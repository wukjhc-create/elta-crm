'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { createAuditLog } from '@/lib/actions/audit'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import type { OfferStatus } from '@/types/offers.types'

// Tilbud der må konverteres: sendt/set/accepteret (manuel godkendelse
// tilladt selv hvis auto-create fejlede). draft/rejected/expired blokeres.
const CONVERTIBLE_STATUSES: ReadonlySet<string> = new Set(['sent', 'viewed', 'accepted'])

// Sprint Ø7.5 — standard opstartstjekliste oprettet ved konvertering.
// Praktiske ELTA Drift-punkter. auto_rule gør oprettelsen idempotent.
const OFFER_STARTUP_RULE = 'offer_conversion_startup'
const OFFER_STARTUP_TASKS = [
  'Gennemgå tilbudsmateriale',
  'Bekræft kunde, anlægsejer og betaler',
  'Kontrollér dokumenter og bilag',
  'Planlæg besigtigelse eller montage',
  'Afklar materialer og bestilling',
  'Afklar faktura- og betalingsplan',
] as const

export type OfferConversionStatus =
  | 'not_converted'      // ikke konverteret (og ikke klar — fx kladde/afvist)
  | 'ready'              // klar til konvertering
  | 'converted'          // netop konverteret
  | 'failed'             // seneste konverteringsforsøg fejlede (klient-tilstand)
  | 'already_converted'  // allerede koblet til en sag

// =====================================================
// Sprint 3B — Manual "Opret sag fra tilbud" flow.
//
// Idempotent: if a service_case already exists with source_offer_id =
// offerId, returns the existing case_number rather than creating a new
// one. Does NOT touch the legacy projects auto-create path in
// portal.acceptOffer.
// =====================================================

export interface OfferToCaseResult {
  case_number: string
  case_id: string
  /** True when this call created a new sag; false when an existing
   *  one was returned (idempotency). */
  created: boolean
}

/**
 * Look up a service_case linked to a given offer (via source_offer_id).
 * Returns null when no link exists. Used by offer detail UI to decide
 * between "Opret sag fra tilbud" and "Åbn sag".
 */
export async function getServiceCaseFromOffer(
  offerId: string
): Promise<ActionResult<{ case_number: string; case_id: string } | null>> {
  try {
    if (!offerId) return { success: false, error: 'offerId mangler' }
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('service_cases')
      .select('id, case_number')
      .eq('source_offer_id', offerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.error('getServiceCaseFromOffer failed', { error })
      return { success: false, error: 'Kunne ikke slå sag op' }
    }

    if (!data) return { success: true, data: null }
    return {
      success: true,
      data: {
        case_id: data.id as string,
        case_number: data.case_number as string,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export interface ConversionPartyPreview {
  role: string
  name: string | null
}

export interface OfferConversionPreview {
  status: OfferConversionStatus
  offer_id: string
  offer_number: string | null
  offer_status: OfferStatus
  /** Salgssum (tilbudssum) — må vises. ALDRIG intern kost. */
  offer_sum: number | null
  currency: string | null
  work_title: string | null
  expected_case_type: string
  /** Kunde + sagspartnere (navne). */
  customer_name: string | null
  parties: ConversionPartyPreview[]
  /** Adresse fra kunden (tilbud har ingen adresse). */
  address: string | null
  /** Dokumenter der følger med (customer_documents koblet til tilbuddet). */
  documents_following: { id: string; title: string | null }[]
  /** Hvad der IKKE følger med — tydeligt for kontoret. */
  not_included: string[]
  /** Pæne advarsler hvis nødvendige data mangler. */
  warnings: string[]
  /** Hvis allerede konverteret: link til sagen. */
  linked_case: { case_id: string; case_number: string } | null
  can_convert: boolean
}

/**
 * Cost-free preview FØR en sag oprettes. Viser kunde, sagspartnere, adresse,
 * tilbudsnummer/-sum, sagstype, dokumenter der følger med, og hvad der IKKE
 * følger med. Gated offers.view. Lækker ALDRIG intern kost/margin/kalkulation.
 */
export async function getOfferConversionPreview(
  offerId: string
): Promise<ActionResult<OfferConversionPreview>> {
  try {
    if (!offerId) return { success: false, error: 'offerId mangler' }
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) {
      return { success: false, error: 'Manglende tilladelse: offers.view' }
    }

    // Cost-free select — final_amount (salgssum) må vises; INGEN kost-kolonner.
    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select('id, offer_number, title, status, final_amount, currency, customer_id, orderer_customer_id, end_customer_id, payer_customer_id, converted_case_id')
      .eq('id', offerId)
      .maybeSingle()
    if (offerErr || !offer) return { success: false, error: 'Tilbud ikke fundet' }

    // Eksisterende koblet sag (sandhedskilde: source_offer_id).
    const { data: linked } = await supabase
      .from('service_cases')
      .select('id, case_number')
      .eq('source_offer_id', offerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Kunde- og partnernavne (cost-free).
    const ids = Array.from(new Set([
      offer.customer_id, offer.orderer_customer_id, offer.end_customer_id, offer.payer_customer_id,
    ].filter(Boolean))) as string[]
    const nameById = new Map<string, string>()
    let address: string | null = null
    if (ids.length) {
      const { data: custs } = await supabase
        .from('customers')
        .select('id, company_name, contact_person, billing_address, billing_postal_code, billing_city')
        .in('id', ids)
      for (const c of custs ?? []) {
        nameById.set(c.id as string, (c.company_name as string | null) || (c.contact_person as string | null) || '—')
        if (c.id === offer.customer_id) {
          const a = [c.billing_address, [c.billing_postal_code, c.billing_city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
          address = a || null
        }
      }
    }

    const { data: docs } = await supabase
      .from('customer_documents')
      .select('id, title')
      .eq('offer_id', offerId)
      .is('service_case_id', null)

    const customerName = offer.customer_id ? (nameById.get(offer.customer_id as string) ?? null) : null
    const parties: ConversionPartyPreview[] = [
      { role: 'Ordregiver', name: offer.orderer_customer_id ? (nameById.get(offer.orderer_customer_id as string) ?? null) : customerName },
      { role: 'Anlægsejer (slutkunde)', name: offer.end_customer_id ? (nameById.get(offer.end_customer_id as string) ?? null) : customerName },
      { role: 'Betaler', name: offer.payer_customer_id ? (nameById.get(offer.payer_customer_id as string) ?? null) : customerName },
    ]

    const warnings: string[] = []
    if (!offer.customer_id) warnings.push('Tilbuddet har ingen kunde — sagen kan ikke kobles til en kunde.')
    if (!offer.title) warnings.push('Tilbuddet har ingen titel — sagen får en standardtitel.')

    const offerStatus = offer.status as OfferStatus
    let status: OfferConversionStatus
    if (linked) status = 'already_converted'
    else if (CONVERTIBLE_STATUSES.has(offerStatus)) status = 'ready'
    else status = 'not_converted'

    const canConvert = !linked && CONVERTIBLE_STATUSES.has(offerStatus) && !!offer.customer_id

    return {
      success: true,
      data: {
        status,
        offer_id: offer.id as string,
        offer_number: (offer.offer_number as string | null) ?? null,
        offer_status: offerStatus,
        offer_sum: (offer.final_amount as number | null) ?? null,
        currency: (offer.currency as string | null) ?? 'DKK',
        work_title: (offer.title as string | null) ?? null,
        expected_case_type: 'installation',
        customer_name: customerName,
        parties,
        address,
        documents_following: (docs ?? []).map((d) => ({ id: d.id as string, title: (d.title as string | null) ?? null })),
        not_included: [
          'Tilbudslinjer og kalkulation kopieres ikke — sagen får tilbudssummen som kontraktsum.',
          'Interne priser/kost og margin følger ikke med.',
          'Kontakt på stedet sættes på sagen efterfølgende (følger ikke fra tilbuddet).',
        ],
        warnings,
        linked_case: linked ? { case_id: linked.id as string, case_number: linked.case_number as string } : null,
        can_convert: canConvert,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Kunne ikke hente preview') }
  }
}

/**
 * Create a service_case from an offer. Idempotent — re-calling for the
 * same offer returns the existing sag.
 *
 * Field mapping (copy-on-create — no live sync):
 *   service_cases.source_offer_id ← offer.id
 *   service_cases.customer_id     ← offer.customer_id
 *   service_cases.title           ← offer.title
 *   service_cases.project_name    ← offer.title
 *   service_cases.contract_sum    ← offer.final_amount
 *   service_cases.description     ← offer.description ?? offer.scope
 *   service_cases.reference       ← offer.offer_number
 *   service_cases.type            ← 'installation' (Sprint 3B default)
 *   service_cases.status          ← 'new'
 *   service_cases.source          ← 'manual'
 */
export async function createServiceCaseFromOffer(
  offerId: string
): Promise<ActionResult<OfferToCaseResult>> {
  try {
    if (!offerId) return { success: false, error: 'offerId mangler' }
    // Sprint Ø7.0 — eksplicit server-side permission-håndhævelse.
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.create')) {
      return { success: false, error: 'Manglende tilladelse: cases.create' }
    }

    // 1. Idempotency check — reuse existing sag (server-side dublet-guard).
    {
      const { data: existing } = await supabase
        .from('service_cases')
        .select('id, case_number')
        .eq('source_offer_id', offerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existing) {
        return {
          success: true,
          data: {
            case_id: existing.id as string,
            case_number: existing.case_number as string,
            created: false,
          },
        }
      }
    }

    // 2. Load the offer.
    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select(
        // Sprint 12A — laes parti-roller saa de kan kopieres til sagen.
        'id, offer_number, title, description, scope, status, customer_id, final_amount, orderer_customer_id, end_customer_id, payer_customer_id, billing_mode'
      )
      .eq('id', offerId)
      .maybeSingle()
    if (offerErr || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    // Sprint Ø7.0 — server-side status-guard. Kun sendte/sete/accepterede
    // tilbud må konverteres (UI skjuler knappen, men serveren håndhæver det).
    if (!CONVERTIBLE_STATUSES.has(offer.status as string)) {
      return {
        success: false,
        error: 'Tilbuddet kan ikke konverteres i sin nuværende status (kræver sendt, set eller accepteret).',
      }
    }

    // 3. Insert the sag.
    const description =
      (typeof offer.description === 'string' && offer.description.trim()) ||
      (typeof offer.scope === 'string' && offer.scope.trim()) ||
      null

    const customerId = (offer.customer_id as string | null) ?? null

    const insertPayload = {
      source_offer_id: offer.id as string,
      customer_id: customerId,
      // Sprint 12A — kopiér parti-roller fra offer til service_case.
      // Fallback til customer_id hvis offer-row endnu ikke har felterne
      // udfyldt (post-migration backfill sikrer at de altid er sat for
      // offers oprettet via 12A-trin-3-actions).
      orderer_customer_id: (offer.orderer_customer_id as string | null) ?? customerId,
      end_customer_id: (offer.end_customer_id as string | null) ?? customerId,
      payer_customer_id: (offer.payer_customer_id as string | null) ?? customerId,
      billing_mode: (offer.billing_mode as string | null) ?? 'same_as_customer',
      title: (offer.title as string) || 'Sag fra tilbud',
      project_name: (offer.title as string) || null,
      contract_sum: (offer.final_amount as number | null) ?? null,
      description,
      reference: (offer.offer_number as string | null) ?? null,
      type: 'installation' as const,
      status: 'new' as const,
      priority: 'medium' as const,
      source: 'manual' as const,
      created_by: userId,
      assigned_to: userId,
    }

    const { data: sag, error: insertErr } = await supabase
      .from('service_cases')
      .insert(insertPayload)
      .select('id, case_number')
      .single()

    if (insertErr || !sag) {
      logger.error('createServiceCaseFromOffer insert failed', { error: insertErr })
      return { success: false, error: 'Kunne ikke oprette sag' }
    }

    const caseId = sag.id as string
    const offerNumber = (offer.offer_number as string | null) ?? null

    // 4. Kobl tilbuddets dokumenter til sagen (kun ikke-allerede-koblede).
    let documentCount = 0
    try {
      const { data: linkedDocs } = await supabase
        .from('customer_documents')
        .update({ service_case_id: caseId })
        .eq('offer_id', offerId)
        .is('service_case_id', null)
        .select('id')
      documentCount = linkedDocs?.length ?? 0
    } catch (e) {
      logger.error('createServiceCaseFromOffer: document link failed', { error: e })
    }

    // 5. Synlig sagsnote "Oprettet fra tilbud …" (sporbarhed på sagen).
    try {
      await supabase.from('case_notes').insert({
        case_id: caseId,
        content: `Oprettet fra tilbud ${offerNumber ?? offer.id}${documentCount ? ` — ${documentCount} dokument(er) koblet` : ''}.`,
        kind: 'system',
        urgency: 'normal',
        created_by: userId,
      })
    } catch (e) {
      logger.error('createServiceCaseFromOffer: case note failed', { error: e })
    }

    // 5b. Opstartstjekliste (Ø7.5) — genbruger customer_tasks-motoren med
    // auto_generated + auto_rule. Idempotent: spring over hvis opstartsopgaver
    // allerede findes for sagen (denne blok nås kun ved NY sag, men dobbelt-
    // sikres mod andre kodestier). Cost-free, ingen deadlines (konservativt).
    let startupTaskCount = 0
    try {
      const { data: existingTasks } = await supabase
        .from('customer_tasks')
        .select('id')
        .eq('service_case_id', caseId)
        .eq('auto_rule', OFFER_STARTUP_RULE)
        .limit(1)
      if (!existingTasks || existingTasks.length === 0) {
        const rows = OFFER_STARTUP_TASKS.map((title) => ({
          customer_id: customerId,
          service_case_id: caseId,
          offer_id: offer.id as string,
          title,
          status: 'pending' as const,
          priority: 'normal' as const,
          assigned_to: userId,
          created_by: userId,
          auto_generated: true,
          auto_rule: OFFER_STARTUP_RULE,
        }))
        const { data: inserted } = await supabase.from('customer_tasks').insert(rows).select('id')
        startupTaskCount = inserted?.length ?? 0

        if (startupTaskCount > 0) {
          await supabase.from('case_notes').insert({
            case_id: caseId,
            content: `Opstartstjekliste oprettet fra tilbud (${startupTaskCount} punkter).`,
            kind: 'system',
            urgency: 'normal',
            created_by: userId,
          })
        }
      }
    } catch (e) {
      logger.error('createServiceCaseFromOffer: startup tasks failed', { error: e })
    }

    // 6. Forward-link på tilbuddet (status O(1) + ekstra dublet-sikring).
    try {
      await supabase
        .from('offers')
        .update({ converted_case_id: caseId, converted_at: new Date().toISOString() })
        .eq('id', offerId)
    } catch (e) {
      logger.error('createServiceCaseFromOffer: offer forward-link failed', { error: e })
    }

    // 6b. Konverteringsaktivitet på tilbuddets tidslinje (Ø7.4). Idempotent:
    // denne blok nås kun ved NY sag (idempotency-guarden returnerer ellers
    // tidligt), + defensiv eksistens-tjek mod dublet på tværs af kodestier.
    try {
      const { data: existingActivity } = await supabase
        .from('offer_activities')
        .select('id')
        .eq('offer_id', offerId)
        .eq('activity_type', 'service_case_created')
        .limit(1)
        .maybeSingle()
      if (!existingActivity) {
        const { logOfferActivity } = await import('@/lib/actions/offer-activities')
        await logOfferActivity(
          offerId,
          'service_case_created',
          `Konverteret til sag ${sag.case_number ?? caseId}`,
          userId,
          { case_id: caseId, case_number: sag.case_number ?? null }
        )
      }
    } catch (e) {
      logger.error('createServiceCaseFromOffer: offer activity failed', { error: e })
    }

    // 7. Audit log (best-effort — never blocks). Beriget sporbarhed.
    try {
      await createAuditLog({
        entity_type: 'service_case',
        entity_id: caseId,
        entity_name: (sag.case_number as string) ?? caseId,
        action: 'create',
        action_description: `Sag oprettet fra tilbud ${offerNumber ?? offer.id}`,
        metadata: {
          offer_id: offer.id,
          offer_number: offerNumber,
          customer_id: customerId,
          contract_sum: (offer.final_amount as number | null) ?? null,
          document_count: documentCount,
          startup_task_count: startupTaskCount,
        },
      })
    } catch {
      /* best-effort */
    }

    // 8. Revalidate touched paths.
    revalidatePath('/dashboard/orders')
    revalidatePath(`/dashboard/orders/${sag.id}`)
    revalidatePath(`/dashboard/orders/${sag.case_number}`)
    revalidatePath(`/dashboard/offers/${offerId}`)

    return {
      success: true,
      data: {
        case_id: sag.id as string,
        case_number: sag.case_number as string,
        created: true,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}
