/**
 * Tilbud -> sag (service_case), server-only kerne (IKKE 'use server'). Bruges af:
 *  - action createServiceCaseFromOffer (bruger-session, gate cases.create)
 *  - kundeportalens accept (ingen bruger-session -> service-role; aktør = tilbuddets ansvarlige saelger)
 * Idempotent (app + UNIQUE uq_service_cases_source_offer_id). Klienten bestemmer adgangen; kalderen gater.
 */
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

type SupabaseLike = { from: (t: string) => any }

// Tilbud der må konverteres: sendt/set/accepteret (manuel godkendelse
// tilladt selv hvis auto-create fejlede). draft/rejected/expired blokeres.
export const CONVERTIBLE_STATUSES: ReadonlySet<string> = new Set(['sent', 'viewed', 'accepted'])

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

export interface OfferToCaseCoreResult {
  case_number: string
  case_id: string
  created: boolean
  audit?: { offer_id: string; offer_number: string | null; customer_id: string | null; contract_sum: number | null; document_count: number; startup_task_count: number }
}

export async function convertOfferToCase(supabase: SupabaseLike, offerId: string, userId: string): Promise<ActionResult<OfferToCaseCoreResult>> {
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
        await supabase.from('offer_activities').insert({
          offer_id: offerId,
          activity_type: 'service_case_created',
          description: `Konverteret til sag ${sag.case_number ?? caseId}`,
          performed_by: userId,
          metadata: { case_id: caseId, case_number: sag.case_number ?? null },
        })
      }
    } catch (e) {
      logger.error('createServiceCaseFromOffer: offer activity failed', { error: e })
    }

    return {
      success: true,
      data: {
        case_id: caseId,
        case_number: sag.case_number as string,
        created: true,
        audit: { offer_id: offer.id as string, offer_number: offerNumber, customer_id: customerId,
          contract_sum: (offer.final_amount as number | null) ?? null, document_count: documentCount, startup_task_count: startupTaskCount },
      },
    }
}
