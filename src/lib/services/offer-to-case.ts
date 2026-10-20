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
        'id, offer_number, title, description, scope, status, customer_id, final_amount, tax_amount, orderer_customer_id, end_customer_id, payer_customer_id, billing_mode, billing_model, created_by'
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
    // Pilot-review 2026-10-15 (#8): uden kunde virker sagen ikke (fakturering: "Sagen mangler en kunde", fotos/dokumenter
    // kræver kunde) — preview'et tjekkede det, kernen gjorde ikke
    if (!customerId) return { success: false, error: 'Tilbuddet mangler en kunde — tilknyt en kunde før det gøres til sag' }

    // N26a: planlagte timer + internt kostbudget fra tilbudslinjerne (grundlag for efterkalkulation)
    const { deriveCaseBudgetFromOffer, offerBudgetNote } = await import('@/lib/cases/offer-budget')
    // 00192: kostkolonner — admin-klient: kostbudgettet beregnes serverinternt og skrives på sagen (returneres ikke);
    // kalderen har gatet (cases.create / portal-accept). Tilbuddet er læst med kalderens klient ovenfor.
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data: offerLines } = await createAdminClient()
      .from('offer_line_items')
      .select('quantity, unit, cost_price, supplier_cost_price_at_creation')
      .eq('offer_id', offerId)
    const offerBudget = deriveCaseBudgetFromOffer((offerLines ?? []) as never[])

    // Rapport-review (HØJ): kontraktsummen er EKSKL. moms i resten af systemet (rate-/slutfakturaer lægger moms på,
    // sagsøkonomien sammenligner med fakturering ekskl. moms). Før blev tilbuddets beløb INKL. moms kopieret → en
    // 100 %-rate fakturerede 156.250 for et tilbud på 125.000.
    const contractSumExVat = offer.final_amount != null
      ? Math.round((Number(offer.final_amount) - Number(offer.tax_amount ?? 0)) * 100) / 100
      : null

    // DF-3 (dataflow-review 2026-10-17): sagen fik ingen arbejdsadresse (montørens kort/navigation, AO-levering).
    // Tilbud har ingen egen adresse → slutkundens leveringsadresse, ellers fakturaadresse. Fejl = ingen adresse.
    const siteCustomerId = (offer.end_customer_id as string | null) ?? customerId
    const { data: siteCustomer } = await supabase
      .from('customers')
      .select('shipping_address, shipping_postal_code, shipping_city, billing_address, billing_postal_code, billing_city')
      .eq('id', siteCustomerId)
      .maybeSingle()
    const sc = siteCustomer as Record<string, string | null> | null
    const useShipping = !!sc?.shipping_address?.trim()
    const siteAddress = {
      address: (useShipping ? sc?.shipping_address : sc?.billing_address)?.trim() || null,
      postal_code: (useShipping ? sc?.shipping_postal_code : sc?.billing_postal_code)?.trim() || null,
      city: (useShipping ? sc?.shipping_city : sc?.billing_city)?.trim() || null,
    }

    // DE2-9 (Henrik 2026-10-20: GODKENDT): sagen får tilbuddets sælger som ansvarlig — også når en anden (fx serviceleder)
    // konverterer; ellers mistede sælgeren adgangen til sin egen ordre ("Åbn sag" → 404). Kun en aktiv profil; ellers den
    // der konverterer (som før). created_by = den der konverterer. Tildelingen auditeres nedenfor.
    const offerSeller = ((offer as { created_by?: string | null }).created_by ?? null) as string | null
    let assignee = userId
    if (offerSeller && offerSeller !== userId) {
      // profiles-RLS viser kun egen profil → sælgerens aktiv-status læses med service-role (kun is_active for ét kendt id;
      // intet returneres til brugeren)
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { data: sellerProf } = await createAdminClient().from('profiles').select('id, is_active').eq('id', offerSeller).maybeSingle()
      if (sellerProf && (sellerProf as { is_active: boolean | null }).is_active !== false) assignee = offerSeller
    }

    const insertPayload = {
      source_offer_id: offer.id as string,
      ...siteAddress,
      customer_id: customerId,
      // 00232: sagen arver tilbuddets afregningsform; ikke valgt på tilbuddet → vælges på sagen (ingen gæt)
      billing_model: (offer as { billing_model?: string | null }).billing_model ?? null,
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
      contract_sum: contractSumExVat,
      planned_hours: offerBudget.plannedHours,
      budget: offerBudget.budget,
      description,
      reference: (offer.offer_number as string | null) ?? null,
      type: 'installation' as const,
      status: 'new' as const,
      priority: 'medium' as const,
      source: 'manual' as const,
      created_by: userId,
      assigned_to: assignee,
    }

    const { data: sag, error: insertErr } = await supabase
      .from('service_cases')
      .insert(insertPayload)
      .select('id, case_number')
      .single()

    if (insertErr || !sag) {
      // Sags-review 2026-10-09 (#8): samtidig konvertering (portal-accept + manuel) → unikt indeks på source_offer_id
      // afviste den ene. Returnér den sag der blev oprettet i stedet for en fejl.
      if ((insertErr as { code?: string } | null)?.code === '23505') {
        const { data: winner } = await supabase.from('service_cases').select('id, case_number').eq('source_offer_id', offerId).limit(1).maybeSingle()
        if (winner) return { success: true, data: { case_id: winner.id as string, case_number: winner.case_number as string, created: false } }
      }
      logger.error('createServiceCaseFromOffer insert failed', { error: insertErr })
      return { success: false, error: 'Kunne ikke oprette sag' }
    }

    const caseId = sag.id as string
    const offerNumber = (offer.offer_number as string | null) ?? null

    // DE2-9: tildelingen auditeres (hvem konverterede, hvem blev ansvarlig, og hvorfor)
    try {
      const { insertAuditRow } = await import('@/lib/audit/insert-audit-row')
      await insertAuditRow({
        user_id: userId,
        entity_type: 'service_case',
        entity_id: caseId,
        action: 'case_assigned_from_offer',
        action_description: assignee === userId
          ? `Sag oprettet fra tilbud ${offerNumber ?? ''} — ansvarlig: den der konverterede`
          : `Sag oprettet fra tilbud ${offerNumber ?? ''} — ansvarlig: tilbuddets sælger (konverteret af en anden)`,
        changes: { assigned_to: assignee, converted_by: userId, offer_created_by: offerSeller, offer_id: offer.id },
      })
    } catch (auditErr) {
      logger.warn('convertOfferToCase: audit af tildeling fejlede', { error: auditErr, entityId: caseId })
    }

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
        content: `Oprettet fra tilbud ${offerNumber ?? offer.id}${documentCount ? ` — ${documentCount} dokument(er) koblet` : ''}.${offerBudgetNote(offerBudget) ? ` ${offerBudgetNote(offerBudget)}` : ''}`,
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
    // DF-8 (dataflow-review 2026-10-17): fejlen blev aldrig tjekket (supabase kaster ikke), og RLS kan give 0 rækker
    // → tilbuddet stod som "klar til sag" og kunne konverteres igen. Sagen er allerede oprettet af en gatet kalder,
    // så koblingen gentages med admin-klienten; lykkes det heller ikke, logges en fejl.
    try {
      const link = { converted_case_id: caseId, converted_at: new Date().toISOString() }
      const { data: linked, error: linkErr } = await supabase.from('offers').update(link).eq('id', offerId).select('id')
      if (linkErr || !linked?.length) {
        const { data: linked2, error: linkErr2 } = await createAdminClient().from('offers').update(link).eq('id', offerId).select('id')
        if (linkErr2 || !linked2?.length) {
          logger.error('createServiceCaseFromOffer: offer forward-link failed', { error: linkErr2 ?? linkErr, entity: 'offer', entityId: offerId })
        }
      }
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
          contract_sum: contractSumExVat, document_count: documentCount, startup_task_count: startupTaskCount },
      },
    }
}
