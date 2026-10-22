'use server'
import { pgQuote, escapeLike } from '@/lib/validations/postgrest-filter'
import { secretTokenReader } from '@/lib/portal/token-reader'
import { permissionDenied } from '@/lib/actions/action-helpers'

import { revalidatePath } from 'next/cache'
import {
  getAuthenticatedClient,
  getAuthenticatedClientWithRole,
  formatError,
} from '@/lib/actions/action-helpers'
import { getCaseScope, userCanViewCase } from '@/lib/auth/case-scope'
import { validateUUID } from '@/lib/validations/common'
import { createAnonClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { CASE_MAIL_LOAD_ERROR, caseEmailsOrThrow } from '@/lib/mail/case-mail-load'
import { getStorageSignedUrlOrNull, getStorageSignedUrls, SIGNED_URL_TTL } from '@/lib/storage/signed-url'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import type { MailRoute } from '@/lib/services/mail-routing'
import { createAuditLog } from '@/lib/audit/audit-log-writer'
import type { ActionResult, PaginatedResponse } from '@/types/common.types'
import type {
  ServiceCase,
  ServiceCaseWithRelations,
  ServiceCaseAttachment,
  ServiceCaseStatus,
  ServiceCasePriority,
  ServiceCaseSource,
  ServiceCaseType,
  ServiceCaseBillingMode,
  ChecklistItem,
  CaseNoteKind,
} from '@/types/service-cases.types'
import { DEFAULT_CHECKLIST } from '@/types/service-cases.types'
import type { PortalServiceCase } from '@/types/portal.types'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { safeDocumentDescription } from '@/lib/documents/safe-description'
import { pageWithinIds, IN_CHUNK_SIZE } from '@/lib/supabase/in-chunks'
import { escapeHtml } from '@/lib/utils/html-escape'

/**
 * Storage-review 2026-10-08 (S1): fil-adgang går via service-klienten bag action-gaten — så bucket-politikkerne kan
 * låses for direkte REST-adgang (authenticated kunne læse/overskrive alle filer i 'attachments').
 */
function storageClient() {
  return createAdminClient()
}

const PAGE_SIZE = 25

// =====================================================
// List / Get
// =====================================================

/** FW-1 (montør-review 2026-10-17): kontrakt-/revideret beløb fjernes for roller uden faktura-adgang (montør) */
function stripCaseMoney<T extends { contract_sum?: number | null; revised_sum?: number | null }>(c: T, canSeeMoney: boolean): T {
  return canSeeMoney ? c : { ...c, contract_sum: null, revised_sum: null }
}

export async function getServiceCases(filters?: {
  search?: string
  /** DB-15l: 'active' = ikke lukket/konverteret (som dashboardets "aktive sager") */
  status?: ServiceCaseStatus | 'active'
  priority?: ServiceCasePriority
  /** N9c: sagstype (ordrelistens filter sendte den aldrig videre) */
  type?: ServiceCaseType
  page?: number
  pageSize?: number
  /** Staging-model B: vis kun is_proposal=true. Default vises kun is_proposal=false. */
  proposalsOnly?: boolean
  /** DB-15k: kun disse sager (fx sager med ufaktureret arbejde); højst 300 id'er */
  onlyCaseIds?: string[]
}): Promise<ActionResult<PaginatedResponse<ServiceCaseWithRelations>>> {
  try {
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    // Sprint 7E — accept enten cases.view.all eller cases.view.assigned.
    // Scope-filter applikeres efter rolle.
    if (!hasPermission('cases.view.all') && !hasPermission('cases.view.assigned')) {
      return { success: false, error: 'Manglende tilladelse: cases.view' }
    }
    const scope = await getCaseScope({ role, userId, supabase })

    const page = filters?.page || 1
    const pageSize = filters?.pageSize || PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Sprint 7E — graceful empty for users uden assigned cases
    if (scope.type === 'specific' && scope.caseIds.length === 0) {
      return {
        success: true,
        data: { data: [], total: 0, page, pageSize, totalPages: 0 },
      }
    }

    // PF3-10 (performance-review 2026-10-20): kun listens kolonner — ikke beskrivelse, underskrift (data-URL), tjekliste,
    // adgangsnoter m.m. for 50–500 rækker
    const LIST_SELECT = `
        id, case_number, customer_id, title, status, priority, source, assigned_to, created_by, created_at, updated_at, closed_at,
        address, postal_code, city, project_name, type, reference, requisition, formand_id, planned_hours, contract_sum,
        revised_sum, start_date, end_date, low_profit, source_offer_id, is_proposal, billing_model,
        customer:customers!service_cases_customer_id_fkey(id, company_name, contact_person, email, phone),
        assignee:profiles!service_cases_assigned_to_fkey(id, full_name)
      `
    // W-1 (pilot-review 2026-10-15): søgningen matcher også kundenavn/-nr., projektnavn, adresse, postnr./by og reference
    // (label lovede "titel · kunde · case nr"). Kunde-id'er slås op først (PostgREST kan ikke OR'e på relationer).
    let searchOr: string | null = null
    if (filters?.search) {
      const term = pgQuote(`%${escapeLike(filters.search)}%`)
      const { data: matchingCustomers } = await supabase
        .from('customers')
        .select('id')
        .or(`company_name.ilike.${term},customer_number.ilike.${term},contact_person.ilike.${term}`)
        .limit(100)
      const parts = ['title', 'case_number', 'description', 'project_name', 'address', 'postal_code', 'city', 'reference'].map((c) => `${c}.ilike.${term}`)
      const ids = ((matchingCustomers ?? []) as Array<{ id: string }>).map((c) => c.id)
      if (ids.length) parts.push(`customer_id.in.(${ids.join(',')})`)
      searchOr = parts.join(',')
    }
    // Filtre som funktion, så et stort sags-scope (montør/salg) kan pagineres i bidder (X4n: én .in() med alle
    // scope-id'er sprængte URL-grænsen ~350 → tom sagsliste for en montør efter 1–2 års sager)
    const applyFilters = (q: any): any => {
      q = q.eq('is_proposal', filters?.proposalsOnly === true)
      if (filters?.onlyCaseIds) q = q.in('id', filters.onlyCaseIds.length ? filters.onlyCaseIds.slice(0, 300) : ['00000000-0000-0000-0000-000000000000'])
      if (filters?.status === 'active') {
        q = q.not('status', 'in', '("closed","converted")')
      } else if (filters?.status) {
        q = q.eq('status', filters.status)
      }
      if (filters?.priority) {
        q = q.eq('priority', filters.priority)
      }
      if (filters?.type) {
        q = q.eq('type', filters.type)
      }
      if (searchOr) {
        q = q.or(searchOr)
      }
      return q
    }

    let data: unknown[] | null = null
    let error: unknown = null
    let count: number | null = null
    if (scope.type === 'specific' && scope.caseIds.length > IN_CHUNK_SIZE) {
      try {
        const r = await pageWithinIds<{ id: string }>(
          scope.caseIds,
          { sortKey: 'created_at', ascending: false, offset, pageSize },
          (chunk) => applyFilters(supabase.from('service_cases').select('id, created_at')).in('id', chunk).order('id'),
          (pageIds) => supabase.from('service_cases').select(LIST_SELECT).in('id', pageIds),
        )
        data = r.rows
        count = r.count
      } catch (e) {
        error = e
      }
    } else {
      // Sprint 7E — applikér scope-filter (lille scope: direkte .in())
      let q = applyFilters(supabase.from('service_cases').select(LIST_SELECT, { count: 'exact' }))
      if (scope.type === 'specific') q = q.in('id', scope.caseIds)
      const r = await q.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1)
      data = r.data
      error = r.error
      count = r.count
    }

    if (error) {
      logger.error('Error fetching service cases', { error })
      return { success: false, error: 'Kunne ikke hente serviceopgaver' }
    }

    const total = count || 0
    // D46 (privacy/RBAC): internt budget og lav-DB-markering kun for economy.cost_prices (før: alle med sagsadgang)
    const showEconomy = hasPermission('economy.cost_prices')
    return {
      success: true,
      data: {
        // FW-1 (montør-review 2026-10-17): tilbudt/revideret beløb kun for roller med faktura-adgang (D42: montør ser timer, ikke penge)
        data: ((data || []) as ServiceCaseWithRelations[]).map((c) => stripCaseMoney(showEconomy ? c : { ...c, budget: null, low_profit: false }, hasPermission('invoices.view.own_cases'))),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function getServiceCase(id: string): Promise<ActionResult<ServiceCaseWithRelations>> {
  try {
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all') && !hasPermission('cases.view.assigned')) {
      return { success: false, error: 'Manglende tilladelse: cases.view' }
    }

    // Sprint 7E — bekraft user kan se DENNE case (scope-check).
    if (!(await userCanViewCase(id, { role, userId, supabase }))) {
      return { success: false, error: 'Sagen er ikke tildelt dig' }
    }

    const { data, error } = await supabase
      .from('service_cases')
      .select(`
        *,
        customer:customers!service_cases_customer_id_fkey(id, company_name, contact_person, email, phone),
        site_customer:customers!service_cases_site_customer_id_fkey(id, company_name, contact_person, email, phone),
        site_contact:customer_contacts!service_cases_site_contact_id_fkey(id, name, email, phone, mobile, role),
        assignee:profiles!service_cases_assigned_to_fkey(id, full_name),
        orderer_customer:customers!service_cases_orderer_customer_id_fkey(id, company_name, contact_person, email),
        end_customer:customers!service_cases_end_customer_id_fkey(id, company_name, contact_person, email),
        payer_customer:customers!service_cases_payer_customer_id_fkey(id, company_name, contact_person, email),
        purchased_from_customer:customers!service_cases_purchased_from_customer_id_fkey(id, company_name)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Serviceopgave ikke fundet' }
      }
      logger.error('Error fetching service case', { error })
      return { success: false, error: 'Kunne ikke hente sagen.' }
    }

    // D46: internt budget og lav-DB-markering kun for economy.cost_prices
    const sag = data as ServiceCaseWithRelations
    const visible = hasPermission('economy.cost_prices') ? sag : { ...sag, budget: null, low_profit: false }
    return { success: true, data: stripCaseMoney(visible, hasPermission('invoices.view.own_cases')) } // FW-1
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Create
// =====================================================

interface CreateServiceCaseInput {
  title: string
  description?: string | null
  customer_id?: string | null
  status?: ServiceCaseStatus
  priority?: ServiceCasePriority
  source?: ServiceCaseSource
  source_email_id?: string | null
  assigned_to?: string | null
  status_note?: string | null
  // Smart fields
  address?: string | null
  postal_code?: string | null
  city?: string | null
  floor_door?: string | null
  latitude?: number | null
  longitude?: number | null
  contact_phone?: string | null
  ksr_number?: string | null
  ean_number?: string | null
  // Sprint 2 — sag/ordre fields (migration 00098)
  project_name?: string | null
  type?: ServiceCaseType | null
  reference?: string | null
  requisition?: string | null
  formand_id?: string | null
  planned_hours?: number | null
  contract_sum?: number | null
  revised_sum?: number | null
  budget?: number | null
  start_date?: string | null
  end_date?: string | null
  source_offer_id?: string | null
  // Sprint 9E Phase 4 — sagspartner-roller (alle valgfri)
  orderer_customer_id?: string | null
  end_customer_id?: string | null
  payer_customer_id?: string | null
  purchased_from_customer_id?: string | null
  purchase_source?: string | null
  billing_mode?: ServiceCaseBillingMode | null
  /** X-14 (00232): eksplicit afregningsform ved oprettelse; tom = vælges senere */
  billing_model?: 'fixed_price' | 'time_and_materials' | null
}

export async function createServiceCase(
  input: CreateServiceCaseInput
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.create')) {
      return { success: false, error: 'Manglende tilladelse: cases.create' }
    }

    // IV2-4 (inputvaliderings-review 2026-10-18): serverside-skema (før kun i browseren) + forretningsregler
    {
      const { createServiceCaseServerSchema, serviceCaseAmountsError } = await import('@/lib/validations/service-cases')
      const parsed = createServiceCaseServerSchema.safeParse(input)
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Ugyldige sagsdata' }
      input = { ...input, ...(parsed.data as Partial<CreateServiceCaseInput>) }
      const amountErr = serviceCaseAmountsError(input)
      if (amountErr) return { success: false, error: amountErr }
      // En ny sag kan ikke oprettes lukket — det gik uden om lukke-værnet (ufaktureret arbejde) og cases.close
      if (input.status === 'closed') return { success: false, error: 'En ny sag kan ikke oprettes som lukket' }
      // Kobling til et tilbud sættes af tilbud→sag-flowet; fra klienten kun med cases.edit (admin/serviceleder)
      if (input.source_offer_id && !hasPermission('cases.edit')) input = { ...input, source_offer_id: null }
    }

    // Sprint 9E Phase 4 — sagspartner-roller med smart defaults.
    // Hvis et partner-felt ikke er sat, peger vi det paa customer_id
    // (samme adfaerd som migration 00112 backfill). Saa nye sager
    // har 5 roller udfyldt fra start og UI-panelet viser klare navne.
    const baseCustomerId = input.customer_id || null
    const orderer = input.orderer_customer_id || baseCustomerId
    const endCustomer = input.end_customer_id || baseCustomerId
    const payer = input.payer_customer_id || baseCustomerId
    const purchasedFrom = input.purchased_from_customer_id || null
    // Hvis purchased_from_customer er sat, nulstil fritekst saa data
    // ikke duplikerer (samme regel som updateServiceCaseParties).
    const purchaseSource = purchasedFrom ? null : (input.purchase_source || null)
    const billingMode = input.billing_mode || 'same_as_customer'

    const { data, error } = await supabase
      .from('service_cases')
      .insert({
        title: input.title,
        description: input.description || null,
        customer_id: baseCustomerId,
        status: input.status || 'new',
        priority: input.priority || 'medium',
        source: input.source || 'manual',
        source_email_id: input.source_email_id || null,
        assigned_to: input.assigned_to || userId,
        created_by: userId,
        status_note: input.status_note || null,
        address: input.address || null,
        postal_code: input.postal_code || null,
        city: input.city || null,
        floor_door: input.floor_door || null,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        contact_phone: input.contact_phone || null,
        ksr_number: input.ksr_number || null,
        ean_number: input.ean_number || null,
        // Sprint 2 fields (additive — all nullable)
        project_name: input.project_name ?? null,
        type: input.type ?? null,
        reference: input.reference ?? null,
        requisition: input.requisition ?? null,
        formand_id: input.formand_id ?? null,
        planned_hours: input.planned_hours ?? null,
        contract_sum: input.contract_sum ?? null,
        revised_sum: input.revised_sum ?? null,
        budget: input.budget ?? null,
        // X-14: kun eksplicit valg (aldrig afledt af kontraktsummen)
        billing_model: input.billing_model === 'fixed_price' || input.billing_model === 'time_and_materials' ? input.billing_model : null,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        source_offer_id: input.source_offer_id ?? null,
        // Sprint 9E Phase 4 — sagspartner-roller
        orderer_customer_id: orderer,
        end_customer_id: endCustomer,
        payer_customer_id: payer,
        purchased_from_customer_id: purchasedFrom,
        purchase_source: purchaseSource,
        billing_mode: billingMode,
      })
      .select('*')
      .single()

    if (error) {
      logger.error('Error creating service case', { error })
      return { success: false, error: 'Kunne ikke oprette serviceopgave' }
    }

    // Send confirmation email to customer
    if (input.customer_id) {
      await sendServiceCaseConfirmation(supabase, data as ServiceCase, input.customer_id)
    }

    revalidatePath('/dashboard/service-cases')
    revalidatePath('/dashboard/orders')
    revalidatePath('/dashboard/mail')
    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Update
// =====================================================

interface UpdateServiceCaseInput {
  title?: string
  description?: string | null
  customer_id?: string | null
  status?: ServiceCaseStatus
  priority?: ServiceCasePriority
  assigned_to?: string | null
  status_note?: string | null
  // Smart fields
  address?: string | null
  postal_code?: string | null
  city?: string | null
  floor_door?: string | null
  latitude?: number | null
  longitude?: number | null
  contact_phone?: string | null
  ksr_number?: string | null
  ean_number?: string | null
  checklist?: any
  customer_signature?: string | null
  customer_signature_name?: string | null
  signed_at?: string | null
  // Sprint 2 — sag/ordre fields (migration 00098)
  project_name?: string | null
  type?: ServiceCaseType | null
  reference?: string | null
  requisition?: string | null
  formand_id?: string | null
  planned_hours?: number | null
  contract_sum?: number | null
  revised_sum?: number | null
  budget?: number | null
  start_date?: string | null
  end_date?: string | null
  source_offer_id?: string | null
  auto_invoice_on_done?: boolean
  low_profit?: boolean
  // Sprint 8G — site/leveringskontakt (migration 00111)
  site_contact_id?: string | null
  site_customer_id?: string | null
  access_notes?: string | null
}

const EDITABLE_CASE_FIELDS = new Set([
  'title', 'description', 'customer_id', 'priority', 'assigned_to', 'status_note',
  'address', 'postal_code', 'city', 'floor_door', 'latitude', 'longitude', 'contact_phone', 'ksr_number', 'ean_number',
  'project_name', 'type', 'reference', 'requisition', 'formand_id', 'planned_hours', 'contract_sum', 'revised_sum', 'budget',
  'start_date', 'end_date', 'site_contact_id', 'site_customer_id', 'access_notes',
  'orderer_customer_id', 'end_customer_id', 'payer_customer_id',
])

export async function updateServiceCase(
  id: string,
  input: UpdateServiceCaseInput,
  opts?: { acknowledgeUnbilled?: boolean; acknowledgeContractChange?: boolean }
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.edit')) {
      return { success: false, error: 'Manglende tilladelse: cases.edit' }
    }
    validateUUID(id, 'sag ID')

    // Strip undefined keys so we don't NULL columns the caller did not touch.
    // SEC-B3 (scope-review 2026-10-22): kun redigerbare sagsfelter — tjekliste, underskrift, lukketidspunkt, fakturamodel
    // og flag har egne actions med værn/audit (før kunne et direkte kald sætte dem uden om)
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined && EDITABLE_CASE_FIELDS.has(k)) payload[k] = v
    }
    // SEC-B2 (scope-review 2026-10-22): status skiftes via setServiceCaseStatus EFTER feltopdateringen — samme lukke-værn
    // (ufaktureret arbejde, arbejdsordre i gang, tilbagerulning ved samtidig start), annullering af planlagte job,
    // compare-and-set og audit som sagens statusknap (før: kun ufaktureret-værnet og ingen audit)
    const wantStatus = input.status

    // Sags-review 2026-10-09 (#4): skiftes sagens kunde, flyttes de parter der pegede på den GAMLE kunde med (bestiller/
    // slutkunde/betaler/anlæg). Før blev de stående → underskrifts-/besigtigelsesmails og kopier gik til den forkerte kunde.
    if (typeof payload.customer_id === 'string') {
      const { data: before } = await supabase.from('service_cases')
        .select('customer_id, orderer_customer_id, end_customer_id, payer_customer_id, site_customer_id').eq('id', id).maybeSingle()
      const b = before as Record<string, string | null> | null
      if (b && b.customer_id && b.customer_id !== payload.customer_id) {
        for (const f of ['orderer_customer_id', 'end_customer_id', 'payer_customer_id', 'site_customer_id']) {
          if (payload[f] === undefined && b[f] === b.customer_id) payload[f] = payload.customer_id
        }
      }
    }

    // IV2-4 (Henrik 2026-10-19): kontraktsummen ændres aldrig stille, når der er et accepteret tilbud eller fakturering —
    // brugeren bekræfter; ændringen auditeres altid. (Giver ingen adgang til kost-/avancefelter.)
    // SEC-B3: revideret sum styrer også restbeløb/klar til fakturering/lukke-værn (effectiveContractSum) — samme værn
    const contractChange: Record<string, { old: number | null; new: number | null }> = {}
    const amountFields = (['contract_sum', 'revised_sum', 'budget', 'planned_hours'] as const).filter((f) => payload[f] !== undefined)
    if (amountFields.length) {
      const { serviceCaseAmountsError } = await import('@/lib/validations/service-cases')
      const amountErr = serviceCaseAmountsError(Object.fromEntries(amountFields.map((f) => [f, payload[f] as number | null])))
      if (amountErr) return { success: false, error: amountErr }
    }
    if (payload.contract_sum !== undefined || payload.revised_sum !== undefined) {
      const { data: cur, error: curErr } = await supabase.from('service_cases').select('contract_sum, revised_sum, source_offer_id').eq('id', id).maybeSingle()
      if (curErr) return { success: false, error: 'Kunne ikke læse sagen — prøv igen' }
      const before = (cur as { contract_sum: number | null; revised_sum: number | null; source_offer_id: string | null } | null)
      const num = (v: unknown) => (v == null ? null : Number(v))
      for (const f of ['contract_sum', 'revised_sum'] as const) {
        if (payload[f] === undefined || !before) continue
        if (num(before[f]) !== num(payload[f])) contractChange[f] = { old: num(before[f]), new: num(payload[f]) }
      }
      const oldSum = contractChange.contract_sum?.old ?? contractChange.revised_sum?.old ?? null
      const newSum = contractChange.contract_sum?.new ?? contractChange.revised_sum?.new ?? null
      const label = contractChange.contract_sum ? 'Kontraktsum' : 'Revideret sum'
      if (before && Object.keys(contractChange).length) {
        if (!opts?.acknowledgeContractChange) {
          const reasons: string[] = []
          if (before.source_offer_id) {
            const { data: off } = await supabase.from('offers').select('offer_number, status').eq('id', before.source_offer_id).maybeSingle()
            const o = off as { offer_number: string | null; status: string } | null
            if (o?.status === 'accepted') reasons.push(`Sagen er oprettet fra det accepterede tilbud ${o.offer_number ?? ''}`.trim())
          }
          const { count: invCount } = await supabase.from('invoices').select('id', { count: 'exact', head: true })
            .eq('case_id', id).neq('status', 'cancelled')
          if ((invCount ?? 0) > 0) reasons.push(`Der er allerede ${invCount} faktura(er) på sagen — kontraktgrundlaget ændres`)
          if (reasons.length) {
            const { CONTRACT_PREFIX } = await import('@/lib/cases/contract-guard')
            const fmt = (n: number | null) => (n == null ? 'ingen' : `${n.toLocaleString('da-DK')} kr. ekskl. moms`)
            return { success: false, error: `${CONTRACT_PREFIX}${reasons.join('. ')}. ${label} ${fmt(oldSum)} → ${fmt(newSum)}.` }
          }
        }
      }
    }

    const q = supabase.from('service_cases')
    let { data, error } = Object.keys(payload).length
      ? await q.update(payload).eq('id', id).select('*').single()
      : await q.select('*').eq('id', id).single()

    if (error) {
      logger.error('Error updating service case', { error })
      return { success: false, error: 'Kunne ikke opdatere serviceopgave' }
    }
    if (Object.keys(contractChange).length) {
      const { logUpdate } = await import('@/lib/audit/audit-log-writer')
      await logUpdate('service_case', id, (data as { case_number?: string | null })?.case_number ?? 'Sag', contractChange,
        { acknowledged: !!opts?.acknowledgeContractChange })
    }
    if (wantStatus && wantStatus !== (data as { status?: string } | null)?.status) {
      const st = await setServiceCaseStatus(id, wantStatus, null, { acknowledgeUnbilled: opts?.acknowledgeUnbilled })
      if (!st.success) {
        const { UNBILLED_PREFIX } = await import('@/lib/cases/close-guard')
        // ufaktureret-værnet skal kunne genkendes af formularen (bekræft → gem igen med acknowledgeUnbilled)
        return { success: false, error: st.error?.startsWith(UNBILLED_PREFIX) ? st.error : `Ændringerne er gemt, men status blev ikke ændret: ${st.error ?? 'ukendt fejl'}` }
      }
      data = st.data ?? data
    }

    revalidatePath('/dashboard/service-cases')
    revalidatePath('/dashboard/orders')
    revalidatePath(`/dashboard/orders/${id}`)
    if (data?.case_number) {
      revalidatePath(`/dashboard/orders/${data.case_number}`)
    }
    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// SC-11 (sags-review 2026-10-17): deleteServiceCase er fjernet — ubrugt (0 kaldere) og uden værn: sletning kaskaderede
// fakturerede materialer/omkostninger væk og efterlod fakturaer og timer uden sag. Sager lukkes, de slettes ikke.

// =====================================================
// Portal — customer-facing (anon)
// =====================================================

export async function getPortalServiceCases(
  token: string
): Promise<ActionResult<PortalServiceCase[]>> {
  try {
    // Portal-review 2026-10-07: tager TOKEN (ikke et kunde-id fra kalderen) — som eksporteret server action med
    // service-role kunne et kunde-id fra klienten ellers liste en vilkårlig kundes sager.
    const { validatePortalToken } = await import('@/lib/actions/portal')
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error || 'Ugyldig adgang' }
    }
    const customerId = sessionResult.data.customer_id
    // Phase α.2 trin 4: service_cases anon-policy via portal_access_tokens
    // er droppet i 00127. Vi bruger nu createAdminClient + customer_id-scope
    // fra caller (typisk session.customer_id efter validatePortalToken).
    // Samme moenster som getPortalDocuments / getPortalMessages.
    //
    // Sikkerhed: eksplicit kunde-sikker kolonneliste — ALDRIG select('*').
    // Interne felter (budget, contract_sum, revised_sum, planned_hours,
    // formand_id, assigned_to, low_profit, ksr_number, ean_number,
    // case_notes, parts-FK'er) må aldrig nå portal-klientens RSC-payload.
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('service_cases')
      .select('id, case_number, title, description, source, status, priority, address, postal_code, city, floor_door, start_date, end_date, project_name, type, reference, created_at') // ikke status_note: "Bemærkninger (interne)"
      .eq('customer_id', customerId)
      .in('status', ['new', 'in_progress', 'pending'])
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching portal service cases', { error })
      return { success: false, error: 'Kunne ikke hente serviceopgaver' }
    }

    // PT-3 (portal-review 2026-10-17): en sag oprettet fra en mail har mailens tekst som beskrivelse (kan være en
    // leverandør-/intern mail) — den vises ikke i portalen
    const rows = ((data || []) as Array<Record<string, unknown>>).map(({ source, ...r }) => ({ ...r, description: source === 'email' ? null : r.description }))
    return { success: true, data: rows as unknown as PortalServiceCase[] }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Create from email
// =====================================================

export async function createServiceCaseFromEmail(
  emailId: string
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.create')) {
      return { success: false, error: 'Manglende tilladelse: cases.create' }
    }

    // Get the email
    const { data: email, error: emailError } = await supabase
      .from('incoming_emails')
      .select('id, subject, sender_email, sender_name, body_preview, customer_id')
      .eq('id', emailId)
      .single()

    if (emailError || !email) {
      return { success: false, error: 'Email ikke fundet' }
    }

    // If email not linked to customer, try to find by email
    let customerId = email.customer_id
    if (!customerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', email.sender_email)
        .maybeSingle()
      customerId = customer?.id || null
    }

    const title = email.subject || `Henvendelse fra ${email.sender_name || email.sender_email}`

    const { data, error } = await supabase
      .from('service_cases')
      .insert({
        title,
        description: email.body_preview || null,
        customer_id: customerId,
        priority: 'medium',
        source: 'email',
        source_email_id: emailId,
        assigned_to: userId,
        created_by: userId,
      })
      .select('*')
      .single()

    if (error) {
      logger.error('Error creating service case from email', { error })
      return { success: false, error: 'Kunne ikke oprette serviceopgave' }
    }

    const newCase = data as ServiceCase

    // Sprint 8D-1: når en sag oprettes fra en mail, kobles selve mailen
    // også automatisk til den nye sag. Tidligere blev kun
    // service_cases.source_email_id sat (envejs), nu sættes også
    // incoming_emails.service_case_id (begge veje) plus alle relaterede
    // mails i samme conversation_id og dokumenter via source_email_id.
    try {
      // Selve mailen
      await supabase
        .from('incoming_emails')
        .update({ service_case_id: newCase.id })
        .eq('id', emailId)

      // Andre mails i samme conversation
      const { data: emailFull } = await supabase
        .from('incoming_emails')
        .select('conversation_id')
        .eq('id', emailId)
        .maybeSingle()
      if (emailFull?.conversation_id) {
        await supabase
          .from('incoming_emails')
          .update({ service_case_id: newCase.id })
          .eq('conversation_id', emailFull.conversation_id)
          .neq('id', emailId)
      }

      // Dokumenter der kom fra denne mail
      await supabase
        .from('customer_documents')
        .update({ service_case_id: newCase.id })
        .eq('source_email_id', emailId)
    } catch (linkErr) {
      // Ikke-kritisk — sagen er oprettet, kobling kan rettes manuelt
      logger.warn('createServiceCaseFromEmail: failed to backlink mail/docs', {
        error: linkErr,
        metadata: { emailId, caseId: newCase.id },
      })
    }

    // Send confirmation email
    if (customerId) {
      await sendServiceCaseConfirmation(supabase, newCase, customerId)
    }

    revalidatePath('/dashboard/service-cases')
    revalidatePath('/dashboard/orders')
    revalidatePath('/dashboard/mail')
    return { success: true, data: newCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Customer relation helper
// =====================================================

export async function getCustomerServiceCases(customerId: string): Promise<ServiceCase[]> {
  const r = await getCustomerServiceCasesResult(customerId)
  return r.ok ? r.cases : []
}

/**
 * P-2 (pilot-review 2026-10-16): kundens sager efter brugerens sags-scope — salg/montør ser deres egne/tildelte sager på
 * kunden (før tom liste uden cases.view.all), og en fejl meldes i stedet for "Ingen sager endnu".
 */
export async function getCustomerServiceCasesResult(customerId: string): Promise<{ ok: boolean; cases: ServiceCase[]; restricted: boolean; error?: string }> {
  try {
    validateUUID(customerId, 'kunde ID')
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    const all = hasPermission('cases.view.all')
    if (!all && !hasPermission('cases.view.assigned')) return { ok: true, cases: [], restricted: true }

    let rows: ServiceCase[] = []
    if (all) {
      const { data, error } = await supabase.from('service_cases').select('*').eq('customer_id', customerId).order('created_at', { ascending: false })
      if (error) throw error
      rows = (data || []) as ServiceCase[]
    } else {
      const { getCaseScope } = await import('@/lib/auth/case-scope')
      const scope = await getCaseScope({ role, userId, supabase })
      const ids = scope.type === 'specific' ? scope.caseIds : []
      for (let k = 0; k < ids.length; k += 200) {
        const { data, error } = await supabase.from('service_cases').select('*').eq('customer_id', customerId).in('id', ids.slice(k, k + 200))
        if (error) throw error
        rows.push(...((data || []) as ServiceCase[]))
      }
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    }
    // SEC-4 (permission-review 2026-10-16): samme D46-regel som sagslisten — internt budget og lav-DB-markering kun for
    // economy.cost_prices (før så salg/montør dem på kundekortet)
    if (!hasPermission('economy.cost_prices')) rows = rows.map((c) => ({ ...c, budget: null, low_profit: false }))
    rows = rows.map((c) => stripCaseMoney(c, hasPermission('invoices.view.own_cases'))) // FW-1
    return { ok: true, cases: rows, restricted: !all }
  } catch (error) {
    logger.error('Failed to fetch customer service cases', { error, entityId: customerId })
    return { ok: false, cases: [], restricted: false, error: 'Kundens sager kunne ikke hentes — prøv igen' }
  }
}

// =====================================================
// Stats
// =====================================================

export async function getServiceCaseStats(): Promise<ActionResult<{
  total: number
  new: number
  in_progress: number
  pending: number
  closed: number
  converted: number
}>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all')) {
      return { success: false, error: 'Manglende tilladelse: cases.view.all' }
    }

    // Samme mængde som listerne: sags-forslag (is_proposal) tælles ikke med
    const [totalRes, newRes, progressRes, pendingRes, closedRes, convertedRes] = await Promise.all([
      supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false),
      supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false).eq('status', 'new'),
      supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false).eq('status', 'in_progress'),
      supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false).eq('status', 'pending'),
      supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false).eq('status', 'closed'),
      supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false).eq('status', 'converted'),
    ])

    return {
      success: true,
      data: {
        total: totalRes.count || 0,
        new: newRes.count || 0,
        in_progress: progressRes.count || 0,
        pending: pendingRes.count || 0,
        closed: closedRes.count || 0,
        converted: convertedRes.count || 0,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// SEC-B4 (scope-review 2026-10-22): ubrugte updateChecklist/initializeChecklist, getServiceCaseAttachments/
// uploadServiceCaseAttachment og signOffServiceCase fjernet — de omgik afleveringens værn (lukket sag, fotokrav, CAS,
// underskriftstjek, audit). Brug case-handover.ts (tjekliste, fotos, signCaseHandoverAction).

// DL-4 (slette-review 2026-10-18): ubrugt deleteServiceCaseAttachment fjernet — den omgik afleveringsfotoets værn
// (lukket sag, audit, tjekliste). Sletning af afleveringsfotos går via deleteHandoverPhotoAction (case-handover.ts).

// =====================================================
// Sprint 8D-1: Mails og dokumenter pr. sag
// =====================================================

export interface CaseEmail {
  id: string
  subject: string
  sender_email: string
  sender_name: string | null
  to_email: string | null
  link_status: string
  has_attachments: boolean
  is_read: boolean
  received_at: string
  conversation_id: string | null
}

export async function getEmailsForCase(
  serviceCaseId: string
): Promise<CaseEmail[]> {
  try {
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all') && !hasPermission('cases.view.assigned')) {
      return []
    }
    // G9: uden cases.view.all kun sager i brugerens scope (montør ser kun mails på egne sager/job)
    if (!hasPermission('cases.view.all') && !(await userCanViewCase(serviceCaseId, { role, userId, supabase }))) return []

    const { data, error } = await supabase
      .from('incoming_emails')
      .select('id, subject, sender_email, sender_name, to_email, link_status, has_attachments, is_read, received_at, conversation_id')
      .eq('service_case_id', serviceCaseId)
      .eq('is_archived', false)
      .order('received_at', { ascending: false })
      .limit(200)

    if (error) {
      logger.error('getEmailsForCase failed', { error, entityId: serviceCaseId })
      return caseEmailsOrThrow(error, null)
    }

    return caseEmailsOrThrow(null, (data || []) as CaseEmail[])
  } catch (err) {
    if (err instanceof Error && err.message === CASE_MAIL_LOAD_ERROR) throw err
    return []
  }
}

export interface CaseDocument {
  id: string
  title: string
  file_name: string
  file_url: string
  storage_path: string | null
  mime_type: string
  file_size: number | null
  source_email_id: string | null
  document_type: string
  description: string | null
  created_at: string
  /** X-12: til beskyttelsesreglen (dokumenter koblet til tilbud kan ikke slettes) */
  offer_id?: string | null
  sent_quote_id?: string | null
}

export interface CaseEmailDetail extends CaseEmail {
  body_html: string | null
  body_text: string | null
  body_preview: string | null
  attachment_urls: Array<{
    filename: string
    contentType?: string
    size: number
    url?: string
    storagePath?: string
  }>
  customer_id: string | null
  service_case_id: string | null
}

export async function getCaseEmailDetail(
  emailId: string,
  serviceCaseId: string
): Promise<CaseEmailDetail | null> {
  try {
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all') && !hasPermission('cases.view.assigned')) {
      return null
    }
    if (!hasPermission('cases.view.all') && !(await userCanViewCase(serviceCaseId, { role, userId, supabase }))) return null

    const { data, error } = await supabase
      .from('incoming_emails')
      .select(`
        id, subject, sender_email, sender_name, to_email, link_status,
        has_attachments, is_read, received_at, conversation_id,
        body_html, body_text, body_preview, attachment_urls,
        customer_id, service_case_id
      `)
      .eq('id', emailId)
      .eq('service_case_id', serviceCaseId)
      .maybeSingle()

    if (error || !data) {
      logger.error('getCaseEmailDetail failed', {
        error,
        entityId: emailId,
        metadata: { serviceCaseId },
      })
      return null
    }

    const detail = data as CaseEmailDetail
    // Friske 1-times links fra storagePath i stedet for gemte 1-års links
    const { withFreshAttachmentLinks } = await import('@/lib/mail/attachment-links')
    detail.attachment_urls = (await withFreshAttachmentLinks(detail.id, detail.attachment_urls, detail.customer_id)) as CaseEmailDetail['attachment_urls']
    return detail
  } catch {
    return null
  }
}

/**
 * Sprint 8D-1: arkiver attachments fra én mail til sagens dokumentarkiv.
 * Forudsætter at attachments allerede er downloadet (attachment_urls har
 * 'url' og 'storagePath' sat). Hvis ikke, returneres { needsDownload: true }
 * og brugeren skal trigge "Download vedhæftninger" på selve mailen først.
 *
 * Idempotent: skipper hvis customer_documents allerede har row med samme
 * storage_path eller (source_email_id + file_name).
 */
export async function archiveEmailAttachmentsToCase(
  emailId: string
): Promise<{
  success: boolean
  archivedCount?: number
  skippedCount?: number
  needsDownload?: boolean
  error?: string
}> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.edit')) {
      return { success: false, error: 'Manglende tilladelse: cases.edit' }
    }

    const { data: email, error: fetchErr } = await supabase
      .from('incoming_emails')
      .select('id, customer_id, service_case_id, attachment_urls, has_attachments')
      .eq('id', emailId)
      .maybeSingle()

    if (fetchErr || !email) {
      return { success: false, error: 'Mail ikke fundet' }
    }

    if (!email.customer_id) {
      return { success: false, error: 'Mail er ikke koblet til kunde' }
    }
    if (!email.service_case_id) {
      return { success: false, error: 'Mail er ikke koblet til sag' }
    }

    const attachments = (email.attachment_urls || []) as Array<{
      filename: string
      contentType?: string
      size: number
      url?: string
      storagePath?: string
    }>

    // Filtrér til attachments der faktisk har storage URL (downloadet)
    const ready = attachments.filter((a) => !!a.storagePath)

    if (attachments.length === 0) {
      return { success: true, archivedCount: 0, skippedCount: 0 }
    }

    if (ready.length === 0) {
      // Alle attachments mangler storage — bruger skal trigge download først
      return {
        success: false,
        needsDownload: true,
        error: 'Vedhæftninger er ikke downloadet endnu. Klik "Download vedhæftninger" på selve mailen først.',
      }
    }

    let archived = 0
    let skipped = 0

    for (const att of ready) {
      // Idempotent: tjek om dokumentet allerede er arkiveret
      const { data: existing } = await supabase
        .from('customer_documents')
        .select('id')
        .eq('storage_path', att.storagePath!)
        .maybeSingle()

      if (existing) {
        skipped++
        continue
      }

      const description = JSON.stringify({
        type: 'email_attachment',
        archived_via: 'order_detail',
      })

      const { error: insertErr } = await supabase
        .from('customer_documents')
        .insert({
          customer_id: email.customer_id,
          service_case_id: email.service_case_id,
          source_email_id: email.id,
          title: att.filename,
          description,
          document_type: 'other',
          // Intet gemt link (00210): læsere signerer friskt fra storage_path
          file_url: '',
          storage_path: att.storagePath!,
          file_name: att.filename,
          mime_type: att.contentType || 'application/octet-stream',
          file_size: att.size || null,
          shared_by: null,
        })

      if (insertErr) {
        logger.error('archiveEmailAttachmentsToCase: insert failed', {
          error: insertErr,
          userId,
          metadata: { emailId, filename: att.filename },
        })
      } else {
        archived++
      }
    }

    if (archived > 0) {
      revalidatePath(`/dashboard/orders/${email.service_case_id}`)
      revalidatePath(`/dashboard/customers/${email.customer_id}`)
    }

    logger.info('Archived email attachments to case', {
      userId,
      action: 'archiveEmailAttachmentsToCase',
      entity: 'service_cases',
      entityId: email.service_case_id,
      metadata: { emailId, archived, skipped, totalAttachments: attachments.length },
    })

    return { success: true, archivedCount: archived, skippedCount: skipped }
  } catch (err) {
    logger.error('archiveEmailAttachmentsToCase failed', { error: err })
    return { success: false, error: 'Uventet fejl' }
  }
}

export async function getDocumentsForCase(
  serviceCaseId: string
): Promise<CaseDocument[]> {
  try {
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all') && !hasPermission('cases.view.assigned')) {
      return []
    }
    if (!hasPermission('cases.view.all') && !(await userCanViewCase(serviceCaseId, { role, userId, supabase }))) return []

    // ST-1 (storage-review 2026-10-16): mail-vedhæftninger arkiveret på sagen (fx leverandørers ordrebekræftelser med
    // kostpriser) kun for roller der må se kundemails — samme regel som getCustomerDocuments/getDocumentDownloadUrls;
    // før fik montøren downloadlinks til dem via sagens Dokumenter-fane
    let docsQuery = supabase
      .from('customer_documents')
      .select('id, title, file_name, file_url, storage_path, mime_type, file_size, source_email_id, document_type, description, created_at, offer_id, sent_quote_id')
      .eq('service_case_id', serviceCaseId)
    if (!hasPermission('customers.emails.view')) docsQuery = docsQuery.is('source_email_id', null)
    const { data, error } = await docsQuery
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      logger.error('getDocumentsForCase failed', { error, entityId: serviceCaseId })
      return []
    }

    // Phase β.2.3: lazy-refresh file_url via signed-URL helper for hver row
    // der har storage_path. Sikrer at "Dokumenter"-tab paa orders/[id] virker
    // baade foer og efter attachments bucket-privatisering (β.2.5).
    // ST-1: fuldmagter (CPR + underskrift) kun for roller med adgang til kundens mails/relation — øvrige ser dem ikke
    const { isFuldmagtDocument } = await import('@/lib/documents/is-fuldmagt')
    const rows = ((data || []) as CaseDocument[]).filter((r) => hasPermission('customers.emails.view') || !isFuldmagtDocument(r as { document_type?: string | null; description?: string | null }))
    const paths = rows.map((r) => r.storage_path ?? '')
    const fresh = await getStorageSignedUrls('attachments', paths.filter((p) => p), SIGNED_URL_TTL.SHORT)
    const freshByIdx: Record<number, string | null> = {}
    let fIdx = 0
    for (let i = 0; i < paths.length; i++) {
      if (paths[i]) { freshByIdx[i] = fresh[fIdx]; fIdx++ }
    }
    // IDOR-sweep 2026-10-09 (#2): ingen CPR/underskrift fra fuldmagter i listen
    return rows.map((r, idx) => ({ ...r, description: safeDocumentDescription(r.description), file_url: freshByIdx[idx] ?? r.file_url ?? '' }))
  } catch {
    return []
  }
}

// =====================================================
// Email confirmation helper
// =====================================================

async function sendServiceCaseConfirmation(
  supabase: ReturnType<typeof createAnonClient>,
  serviceCase: ServiceCase,
  customerId: string
) {
  try {
    // Get customer email
    const { data: customer } = await supabase
      .from('customers')
      .select('email, company_name, contact_person')
      .eq('id', customerId)
      .single()

    if (!customer?.email) return

    // Find portal token
    const { data: tokenData } = await (await secretTokenReader())
      .from('portal_access_tokens')
      .select('token')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      // PM-3: aldrig et udløbet link
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const portalUrl = tokenData?.token
      ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app'}/portal/${tokenData.token}`
      : null

    const subject = `Serviceopgave ${serviceCase.case_number} oprettet — ${serviceCase.title}`
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Tak for din henvendelse</h2>
        <p>Kære __GREETING__,</p>
        <p>Vi har modtaget din henvendelse og oprettet en serviceopgave:</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Sagsnr.:</strong> ${escapeHtml(String(serviceCase.case_number ?? ''))}</p>
          <!-- mail-review 2026-10-07: titlen kan være en indgående mails emne (kundestyret) → escapes -->
          <p style="margin: 8px 0 0;"><strong>Emne:</strong> ${escapeHtml(String(serviceCase.title ?? ''))}</p>
          <p style="margin: 8px 0 0;"><strong>Status:</strong> Ny — vi kigger på den hurtigst muligt</p>
        </div>
        ${portalUrl ? `<p><a href="${portalUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Se status i kundeportalen</a></p>` : ''}
        <p style="color: #666; font-size: 14px; margin-top: 24px;">Med venlig hilsen<br/>Elta Solar ApS</p>
      </div>
    `

    if (isGraphConfigured()) {
      // Sprint 8H Phase 4: central mail-router (task_practical-intent).
      // Service-case bekraeftelse prioriterer site_contact > site_customer
      // > paying_customer — billing_contact bruges aldrig.
      const { resolveServiceCaseConfirmationRoute, logMailRoute } = await import(
        '@/lib/actions/mail-route-resolvers'
      )
      const routeResult = await resolveServiceCaseConfirmationRoute(serviceCase.id)
      if (routeResult.ok && routeResult.route) {
        const route = routeResult.route
        // PM-1 (portal-review 2026-10-17): routeren foretrækker kontakt/kunde på adressen — portal-linket tilhører sagens
        // kunde (fx partner/udlejer) og gav beboeren fuld adgang til den portal. Kun til sagens egen kunde.
        const { stripPortalLinks } = await import('@/lib/portal/strip-portal-links')
        // ML-1 (mail-review 2026-10-17): routeren sætter customerId = sagens kunde også for site_contact/site_customer,
        // så tjekket herover var altid sandt → beboer/anlægskontakt fik udlejerens portal. Kun betalende kunde får linket.
        const linkOk = route.recipientRole === 'paying_customer' && route.customerId === customerId
        // ML-10: hilsen til den faktiske modtager (før sagens kontaktperson, fx udlejerens navn til lejeren)
        const greetName = (route as { toName?: string | null }).toName || (route.recipientRole === 'paying_customer' ? (customer.contact_person || customer.company_name) : null) || 'kunde'
        const named = html.replace('__GREETING__', escapeHtml(greetName))
        const safeHtml = linkOk ? named : stripPortalLinks(named)
        const sendResult = await sendEmailViaGraph({
          to: route.toEmail,
          subject,
          html: safeHtml,
          text: `Serviceopgave ${serviceCase.case_number}: ${serviceCase.title}`,
        })

        // Sprint 9F Phase 6a — shadow-preview (read-only, ingen
        // aendring i faktisk send ovenfor). Hvis flag er off eller
        // preview fejler, fortsaetter vi med eksisterende meta.
        const shadowMeta = await maybeBuildServiceCaseShadowMeta(serviceCase.id, route)

        await logMailRoute(
          route,
          sendResult.success ? 'sent' : 'failed',
          { case_id: serviceCase.id, error: sendResult.error, ...(shadowMeta || {}) }
        )
      } else {
        logger.error('Service case confirmation route failed', {
          error: routeResult.error,
          entityId: serviceCase.id,
        })
      }
    }
  } catch (err) {
    logger.error('Failed to send service case confirmation email', { error: err })
  }
}

/**
 * Sprint 9F Phase 6a — shadow-preview wrapper for service-case
 * bekraeftelse. Skal aldrig kunne faa send-flowet til at fejle.
 *
 * - Hvis MAIL_ROUTING_SHADOW_LOG env-flag ikke er sat → returner null.
 * - Hvis preview eller meta-builder fejler → log warn, returner null.
 *
 * Returner-vaerdien laegges direkte ind i logMailRoute meta og bliver
 * logget som structured JSON i Vercel logs (shadow_only=true).
 */
async function maybeBuildServiceCaseShadowMeta(
  caseId: string,
  actualRoute: MailRoute
): Promise<Record<string, unknown> | null> {
  try {
    const { isShadowLogEnabled, getServiceCaseRoutePreview, buildShadowLogMeta } =
      await import('@/lib/actions/service-case-route-preview')
    if (!(await isShadowLogEnabled())) return null

    const preview = await getServiceCaseRoutePreview(caseId, actualRoute)
    if (!preview) return null
    return buildShadowLogMeta(preview) as unknown as Record<string, unknown>
  } catch (err) {
    logger.warn('Service case shadow-log preview failed (non-fatal)', {
      error: err,
      entityId: caseId,
    })
    return null
  }
}

// =====================================================
// Lookup helpers for /dashboard/orders forms
// =====================================================

export async function getCustomersForOrderSelect(): Promise<
  ActionResult<{ id: string; company_name: string; customer_number: string | null }[]>
> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) {
      return { success: false, error: 'Manglende tilladelse: customers.view' }
    }
    const { data, error } = await supabase
      .from('customers')
      .select('id, company_name, customer_number')
      .eq('is_active', true)
      .order('company_name')
    if (error) {
      logger.error('Error fetching customers for order select', { error })
      return { success: false, error: 'Kunne ikke hente kunder' }
    }
    return { success: true, data: (data || []) as { id: string; company_name: string; customer_number: string | null }[] }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function getProfilesForOrderSelect(): Promise<
  ActionResult<{ id: string; full_name: string | null; email: string }[]>
> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    // M-16 (mobil-review 2026-10-14): den der må oprette sager skal kunne vælge ansvarlig (før kun users.view = admin →
    // tom liste for serviceleder/salg). E-mail udleveres stadig kun med users.view.
    const canSeeEmail = hasPermission('users.view')
    if (!canSeeEmail && !hasPermission('cases.create')) {
      return { success: false, error: 'Manglende tilladelse: cases.create' }
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name')
    if (error) {
      logger.error('Error fetching profiles for order select', { error })
      return { success: false, error: 'Kunne ikke hente brugere' }
    }
    const rows = (data || []) as { id: string; full_name: string | null; email: string }[]
    return { success: true, data: canSeeEmail ? rows : rows.map((r) => ({ ...r, email: '' })) }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

/**
 * Lightweight picker for "Planlæg opgave" dialog in /dashboard/calendar.
 * Returns only OPEN service_cases (new, in_progress, pending) — closed
 * and converted are filtered out. Capped at 200, ordered by case_number desc.
 *
 * No FK joins beyond customer name to keep the payload small.
 */
export async function listOpenServiceCasesForPicker(): Promise<
  ActionResult<
    {
      id: string
      case_number: string
      title: string
      status: ServiceCaseStatus
      customer_name: string | null
    }[]
  >
> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all')) {
      return { success: false, error: 'Manglende tilladelse: cases.view.all' }
    }
    // Planlægnings-review 2026-10-09 (#4): ALLE åbne sager (før kun de 200 højeste sagsnumre — "Mangler planlægning"
    // viser de ældste først, som så ikke kunne findes i dialogen) og ikke forslag-sager
    let data: unknown[]
    try {
      data = await fetchAllRows((f, t) =>
        supabase
          .from('service_cases')
          .select(`
            id, case_number, title, status,
            customer:customers!service_cases_customer_id_fkey(company_name)
          `)
          .in('status', ['new', 'in_progress', 'pending'])
          .eq('is_proposal', false)
          .order('case_number', { ascending: false })
          .order('id')
          .range(f, t)
      )
    } catch (error) {
      logger.error('listOpenServiceCasesForPicker failed', { error })
      return { success: false, error: 'Kunne ikke hente sager' }
    }

    const rows = (data || []).map((c: any) => ({
      id: c.id as string,
      case_number: (c.case_number as string) ?? c.id,
      title: (c.title as string) ?? '',
      status: c.status as ServiceCaseStatus,
      customer_name: (c.customer?.company_name as string | null) ?? null,
    }))

    return { success: true, data: rows }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function getEmployeesForOrderSelect(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    // Montør (time_logs.create uden employees.view) får kun sig selv — så timeformularen ikke er tom.
    const ownOnly = !hasPermission('employees.view')
    if (ownOnly && !hasPermission('time_logs.create')) {
      return { success: false, error: 'Manglende tilladelse: employees.view' }
    }
    let q = supabase
      .from('employees')
      .select('id, name, first_name, last_name, active')
      .eq('active', true)
    if (ownOnly) q = q.eq('profile_id', userId)
    const { data, error } = await q.order('name')
    if (error) {
      // employees table may be optional in some envs; return empty rather than fail.
      logger.warn('Error fetching employees for order select', { error })
      return { success: true, data: [] }
    }
    const list = (data || []).map((e: any) => ({
      id: e.id as string,
      name:
        (e.name as string | null) ||
        [e.first_name, e.last_name].filter(Boolean).join(' ') ||
        '—',
    }))
    return { success: true, data: list }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function getOffersForOrderSelect(
  customerId: string
): Promise<ActionResult<{ id: string; offer_number: string | null; title: string }[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) {
      return { success: false, error: 'Manglende tilladelse: offers.view' }
    }
    const { data, error } = await supabase
      .from('offers')
      .select('id, offer_number, title, status, created_at')
      .eq('customer_id', customerId)
      // SC-5 (scope-review 2026-10-20): API-2 — kun tilbud i brugerens scope
      .or(await (await import('@/lib/offers/offer-scope')).currentOfferScopeOr())
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      logger.error('Error fetching offers for order select', { error })
      return { success: false, error: 'Kunne ikke hente tilbud' }
    }
    return {
      success: true,
      data: (data || []).map((o: any) => ({
        id: o.id as string,
        offer_number: (o.offer_number as string | null) ?? null,
        title: (o.title as string) ?? 'Uden titel',
      })),
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Action functions used by the "Handlinger" tab
// =====================================================
//
// Each action updates service_cases and best-effort logs to audit_logs.
// Audit failures are non-blocking — the primary action still succeeds.

async function logServiceCaseAudit(
  caseId: string,
  caseNumber: string,
  action: 'create' | 'update' | 'delete' | 'status_change',
  description: string,
  changes?: Record<string, { old: unknown; new: unknown }>
) {
  try {
    await createAuditLog({
      entity_type: 'service_case',
      entity_id: caseId,
      entity_name: caseNumber,
      action,
      action_description: description,
      changes: changes as any,
    })
  } catch {
    /* audit is best-effort — never block the primary action */
  }
}


/**
 * Lukke-værn: besked hvis sagen har ufaktureret arbejde (timer/materialer/øvrige)
 * eller en kørende timer — ellers null. Samme regler som fakturakladden.
 */
async function unbilledCloseBlock(
  supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'],
  caseId: string
): Promise<string | null> {
  const { unbilledCloseMessage } = await import('@/lib/invoices/unbilled')
  const work = await loadCaseWork(supabase, caseId)
  const msg = unbilledCloseMessage(work.unbilled)
  // Sags-review 2026-10-09 (#6): åbne arbejdsordrer (planlagt/i gang) — montøren så stadig jobbet efter lukning
  const open = work.workOrderStatuses.filter((st) => st === 'planned' || st === 'in_progress').length
  const openMsg = open ? `${open} arbejdsordre${open === 1 ? '' : 'r'} er stadig planlagt eller i gang.` : ''
  // DF-6 (dataflow-review 2026-10-17): fastprissag kunne lukkes stille med ufaktureret kontraktsum (registreringerne
  // er ikke grundlaget for fastpris, så tjekket ovenfor fangede det ikke). Advarsel via samme bekræftelse.
  let fixedMsg = ''
  const { data: sag } = await supabase.from('service_cases').select('contract_sum, revised_sum, billing_model').eq('id', caseId).maybeSingle()
  const s = sag as { contract_sum: number | string | null; revised_sum: number | string | null; billing_model: string | null } | null
  if (s?.billing_model === 'fixed_price') {
    const { effectiveContractSum } = await import('@/lib/cases/expected-revenue')
    const ref = effectiveContractSum({ contractSum: s.contract_sum, revisedSum: s.revised_sum, billingModel: s.billing_model })
    if (ref != null && ref > 0) {
      const { netInvoicedExVat } = await import('@/lib/invoices/net-invoiced')
      const { data: inv } = await supabase.from('invoices').select('total_amount, status, invoice_type, voided_at, currency').eq('case_id', caseId)
      const rest = Math.round((ref - netInvoicedExVat((inv ?? []) as never[])) * 100) / 100
      if (rest >= 1) fixedMsg = `Fastpris: ${rest.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr. ekskl. moms af kontraktsummen er ikke faktureret.`
    }
  }
  return [msg, openMsg, fixedMsg].filter(Boolean).join(' ') || null
}

/** Sagens job-statusser + ufaktureret optælling (samme regler som fakturakladden). */
async function loadCaseWork(
  supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'],
  caseId: string
) {
  const { summarizeUnbilled } = await import('@/lib/invoices/unbilled')
  const { data: wos } = await supabase.from('work_orders').select('id, status').eq('case_id', caseId)
  const woIds = (wos ?? []).map((w) => w.id as string)
  const [tl, mat, oth] = await Promise.all([
    woIds.length
      ? // montør-review: side for side (sager med > 1.000 timeregistreringer blev talt for lavt)
        fetchAllRows((f, t) => supabase.from('time_logs').select('id, end_time, hours, sale_amount, sale_rate_snapshot, billable, invoice_line_id, employee:employees(hourly_rate)').in('work_order_id', woIds).neq('approval_status', 'rejected').order('id').range(f, t)).then((data) => ({ data })) /* sags-review 2026-10-09 (#5): afviste timer blokerer ikke lukning */
      : Promise.resolve({ data: [] }),
    // PF2-5 (performance-review 2026-10-17): side for side — over 1.000 materialelinjer kunne en sag lukke uden advarsel
    fetchAllRows((f, t) => supabase.from('case_materials').select('id, total_sales_price, billable, invoice_line_id').eq('case_id', caseId).order('id').range(f, t)).then((data) => ({ data })),
    fetchAllRows((f, t) => supabase.from('case_other_costs').select('id, total_sales_price, billable, invoice_line_id').eq('case_id', caseId).order('id').range(f, t)).then((data) => ({ data })),
  ])
  return {
    workOrderStatuses: (wos ?? []).map((w) => String((w as { status?: string }).status ?? '')),
    unbilled: summarizeUnbilled({
      timeLogs: (tl.data ?? []) as never[],
      materials: (mat.data ?? []) as never[],
      otherCosts: (oth.data ?? []) as never[],
    }),
  }
}

/**
 * N23: er sagen klar til lukning? (alle job udført, intet ufaktureret, ingen kørende timer). Kun for brugere der må
 * lukke sager (cases.close) — andre får null (intet banner).
 */
export async function getCaseCloseReadinessAction(caseId: string): Promise<ActionResult<import('@/lib/cases/case-progress').CloseReadiness | null>> {
  try {
    validateUUID(caseId, 'sags-ID')
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.close')) return { success: true, data: null }
    const { data: sc } = await supabase.from('service_cases').select('status').eq('id', caseId).maybeSingle()
    if (!sc) return { success: false, error: 'Sag ikke fundet' }
    const { caseCloseReadiness } = await import('@/lib/cases/case-progress')
    const work = await loadCaseWork(supabase, caseId)
    return { success: true, data: caseCloseReadiness({ caseStatus: (sc as { status?: string }).status, ...work }) }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

/**
 * N58: sag der står som "Ny" trods arbejde (job startet/udført, tid, udstedt faktura) — forslag om at sætte den til
 * "I gang". Kun brugere der må ændre status (cases.edit); andre får null.
 */
export async function getCaseStartHintAction(caseId: string): Promise<ActionResult<{ suggest: boolean; reason: string } | null>> {
  try {
    validateUUID(caseId, 'sags-ID')
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.edit')) return { success: true, data: null }
    const { data: sc } = await supabase.from('service_cases').select('status').eq('id', caseId).maybeSingle()
    if (!sc) return { success: false, error: 'Sag ikke fundet' }
    if ((sc as { status?: string }).status !== 'new') return { success: true, data: { suggest: false, reason: '' } }
    const { data: wos } = await supabase.from('work_orders').select('id, status').eq('case_id', caseId)
    const woIds = (wos ?? []).map((w) => w.id as string)
    const [tl, inv] = await Promise.all([
      woIds.length ? supabase.from('time_logs').select('id', { count: 'exact', head: true }).in('work_order_id', woIds) : Promise.resolve({ count: 0 }),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('case_id', caseId).neq('status', 'draft').is('voided_at', null),
    ])
    const { caseStartHint } = await import('@/lib/cases/case-progress')
    return {
      success: true,
      data: caseStartHint({
        caseStatus: 'new',
        workOrderStatuses: (wos ?? []).map((w) => String((w as { status?: string }).status ?? '')),
        timeLogCount: tl.count ?? 0,
        issuedInvoiceCount: inv.count ?? 0,
      }),
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

export async function setServiceCaseStatus(
  id: string,
  status: ServiceCaseStatus,
  note?: string | null,
  opts?: { acknowledgeUnbilled?: boolean }
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    // Status-skift kan inkludere 'closed' — saa krav er enten cases.edit eller cases.close.
    const required = status === 'closed' ? 'cases.close' : 'cases.edit'
    if (!hasPermission(required)) {
      return { success: false, error: `Manglende tilladelse: ${required}` }
    }

    // Read prior status for audit log
    const { data: prior } = await supabase
      .from('service_cases')
      .select('status, case_number')
      .eq('id', id)
      .maybeSingle()

    const update: Record<string, unknown> = { status }
    if (note != null) update.status_note = note
    let closedDespite: string | null = null
    if (status === 'closed' && !prior?.status?.toString()?.includes('closed')) {
      // Lukke-værn: ikke stille lukning med ufaktureret arbejde
      const block = await unbilledCloseBlock(supabase, id)
      if (block && !opts?.acknowledgeUnbilled) {
        const { UNBILLED_PREFIX } = await import('@/lib/cases/close-guard')
        return { success: false, error: `${UNBILLED_PREFIX}${block}` }
      }
      closedDespite = block
      update.closed_at = new Date().toISOString()
      // SC-2 (sags-review 2026-10-17): en arbejdsordre i gang skal afsluttes først — før kunne sagen lukkes, og
      // arbejdsordren kunne derefter hverken afsluttes eller annulleres (lukket sag), men stod i montørens "Mine job"
      const { count: running } = await supabase.from('work_orders').select('id', { count: 'exact', head: true })
        .eq('case_id', id).eq('status', 'in_progress')
      if ((running ?? 0) > 0) {
        return { success: false, error: `Sagen har ${running} arbejdsordre${running === 1 ? '' : 'r'} i gang — afslut eller annullér ${running === 1 ? 'den' : 'dem'} først` }
      }
    } else if (status !== 'closed') {
      update.closed_at = null // genåbnet (sags-review 2026-10-09 #10)
    }

    // RC-3 (samtidigheds-review 2026-10-18): compare-and-set på den læste status (samtidig lukning/statusskift)
    let upd = supabase.from('service_cases').update(update).eq('id', id)
    if (prior?.status) upd = upd.eq('status', prior.status as string)
    const { data, error } = await upd.select('*').maybeSingle()

    if (!error && !data) return { success: false, error: 'Sagens status er netop ændret af en anden — genindlæs og prøv igen' }
    if (error || !data) {
      logger.error('Error setting service case status', { error })
      return { success: false, error: 'Kunne ikke ændre status' }
    }
    // RC-3: en arbejdsordre startet mellem tælling og lukning → lukningen rulles tilbage (ellers lukket sag med job i gang)
    if (status === 'closed' && !prior?.status?.toString()?.includes('closed')) {
      const { count: runningNow } = await supabase.from('work_orders').select('id', { count: 'exact', head: true })
        .eq('case_id', id).eq('status', 'in_progress')
      if ((runningNow ?? 0) > 0) {
        await supabase.from('service_cases').update({ status: prior?.status ?? 'in_progress', closed_at: null }).eq('id', id).eq('status', 'closed')
        return { success: false, error: 'En arbejdsordre blev netop startet — sagen er ikke lukket. Afslut den først' }
      }
    }
    // SC-2: planlagte (ikke påbegyndte) arbejdsordrer annulleres ved lukning, så de ikke hænger i kalender/"Mine job"
    let cancelledPlanned = 0
    if (status === 'closed' && !prior?.status?.toString()?.includes('closed')) {
      const { data: cancelled, error: woErr } = await supabase.from('work_orders').update({ status: 'cancelled' })
        .eq('case_id', id).eq('status', 'planned').select('id')
      if (woErr) logger.warn('setServiceCaseStatus: planlagte arbejdsordrer kunne ikke annulleres', { error: woErr, entityId: id })
      cancelledPlanned = (cancelled ?? []).length
    }

    await logServiceCaseAudit(
      id,
      (data?.case_number as string) ?? id,
      'status_change',
      `Status ændret: ${prior?.status ?? '—'} → ${status}${note ? ` (${note})` : ''}${closedDespite ? ` — lukket trods: ${closedDespite}` : ''}${cancelledPlanned ? ` — ${cancelledPlanned} planlagt(e) arbejdsordre(r) annulleret` : ''}`,
      { status: { old: prior?.status ?? null, new: status }, ...(closedDespite ? { unbilled_at_close: { old: null, new: closedDespite } } : {}) }
    )

    revalidatePath('/dashboard/orders')
    revalidatePath(`/dashboard/orders/${id}`)
    if (data?.case_number) revalidatePath(`/dashboard/orders/${data.case_number}`)

    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function markServiceCaseDone(
  id: string,
  opts?: { acknowledgeUnbilled?: boolean }
): Promise<ActionResult<ServiceCase>> {
  const __denied = await permissionDenied('cases.close')
  if (__denied) return { success: false, error: __denied }
  return setServiceCaseStatus(id, 'closed', 'Markeret som afsluttet', opts)
}

export async function setServiceCaseLowProfit(
  id: string,
  value: boolean
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.edit')) {
      return { success: false, error: 'Manglende tilladelse: cases.edit' }
    }

    const { data: prior } = await supabase
      .from('service_cases')
      .select('low_profit, case_number')
      .eq('id', id)
      .maybeSingle()

    const { data, error } = await supabase
      .from('service_cases')
      .update({ low_profit: value })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      logger.error('Error toggling low_profit', { error })
      return { success: false, error: 'Kunne ikke opdatere "Lav DB"' }
    }

    await logServiceCaseAudit(
      id,
      (data?.case_number as string) ?? id,
      'update',
      `Lav DB sat til ${value ? 'JA' : 'nej'}`,
      { low_profit: { old: prior?.low_profit ?? null, new: value } }
    )

    revalidatePath('/dashboard/orders')
    revalidatePath(`/dashboard/orders/${id}`)
    if (data?.case_number) revalidatePath(`/dashboard/orders/${data.case_number}`)

    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function setServiceCaseAutoInvoice(
  id: string,
  value: boolean
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.edit')) {
      return { success: false, error: 'Manglende tilladelse: cases.edit' }
    }

    const { data: prior } = await supabase
      .from('service_cases')
      .select('auto_invoice_on_done, case_number')
      .eq('id', id)
      .maybeSingle()

    const { data, error } = await supabase
      .from('service_cases')
      .update({ auto_invoice_on_done: value })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      logger.error('Error toggling auto_invoice_on_done', { error })
      return { success: false, error: 'Kunne ikke opdatere auto-faktura' }
    }

    await logServiceCaseAudit(
      id,
      (data?.case_number as string) ?? id,
      'update',
      `Auto-faktura ved afsluttet sat til ${value ? 'JA' : 'nej'}`,
      { auto_invoice_on_done: { old: prior?.auto_invoice_on_done ?? null, new: value } }
    )

    revalidatePath('/dashboard/orders')
    revalidatePath(`/dashboard/orders/${id}`)
    if (data?.case_number) revalidatePath(`/dashboard/orders/${data.case_number}`)

    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Activity log (read)
// =====================================================
//
// Returns audit_logs rows for this service case (entity_type='service_case').
// RLS allows admins to read all, and users to read their own actions.

export interface ServiceCaseActivityEntry {
  id: string
  user_name: string | null
  user_email: string | null
  action: string
  action_description: string | null
  changes: Record<string, { old: unknown; new: unknown }> | null
  created_at: string
}

export async function getServiceCaseActivity(
  caseId: string
): Promise<ActionResult<ServiceCaseActivityEntry[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all')) {
      return { success: false, error: 'Manglende tilladelse: cases.view.all' }
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, user_name, user_email, action, action_description, changes, created_at')
      .eq('entity_type', 'service_case')
      .eq('entity_id', caseId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      // PR4-3 (pilot-review 4): en læsefejl er ikke "ingen aktivitet" (RLS-tomme rækker giver ingen fejl, kun [])
      logger.warn('Could not fetch service case activity', { error })
      return { success: false, error: 'Kunne ikke hente aktivitet — prøv igen' }
    }

    return {
      success: true,
      data: (data || []) as ServiceCaseActivityEntry[],
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Sprint Ø7.1 — Noter på sagen (read-only panel)
// =====================================================

export interface CaseNoteEntry {
  id: string
  content: string
  kind: string | null
  urgency: string | null
  created_at: string
  author_name: string | null
  /** Sprint Ø7.4 — er noten skrevet af den aktuelle bruger? (styrer edit/delete-UI). */
  is_mine: boolean
}

/**
 * Hent sagens noter (case_notes) til notes-panel. Intern — gated
 * cases.view (all eller assigned), aldrig kundevendt portal. Beriger
 * forfatternavn via profiles (separat batch — ingen FK-antagelse).
 */
export async function getCaseNotes(caseId: string): Promise<ActionResult<CaseNoteEntry[]>> {
  try {
    if (!caseId) return { success: false, error: 'caseId mangler' }
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.view.all') && !hasPermission('cases.view.assigned')) {
      return { success: false, error: 'Manglende tilladelse: cases.view' }
    }
    // Sags-review: uden cases.view.all kun sager i brugerens scope (som sagens mails) — før kunne montør/salg læse alle
    // noter (inkl. AI-resuméer af kundemails) på enhver sag ud fra sags-id'et
    if (!hasPermission('cases.view.all') && !(await userCanViewCase(caseId, { role, userId, supabase }))) {
      return { success: false, error: 'Sagen er ikke tildelt dig' }
    }

    const { data, error } = await supabase
      .from('case_notes')
      .select('id, content, kind, urgency, created_at, created_by')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      // W-15: før tavst 100 — nu 500 (UI'et siger det, hvis loftet rammes)
      .limit(500)
    if (error) {
      logger.warn('Could not fetch case notes', { error })
      return { success: true, data: [] }
    }

    const rows = data || []
    // Berig forfatternavn (batch — ét opslag, ingen N+1).
    const authorIds = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))) as string[]
    const nameById = new Map<string, string>()
    if (authorIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', authorIds)
      for (const p of profs ?? []) nameById.set(p.id as string, (p.full_name as string | null) || '')
    }

    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id as string,
        content: (r.content as string | null) ?? '',
        kind: (r.kind as string | null) ?? null,
        urgency: (r.urgency as string | null) ?? null,
        created_at: r.created_at as string,
        author_name: r.created_by ? (nameById.get(r.created_by as string) || null) : null,
        is_mine: r.created_by === userId,
      })),
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

const CASE_NOTE_MAX = 4000

/**
 * Fælles permission-gate for note-mutationer. Returnerer null hvis tilladt,
 * ellers en fejlbesked. cases.edit → enhver note; cases.edit.own → kun egne
 * noter på egne/tildelte sager (robust via created_by + case-scope).
 */
async function authorizeCaseNoteMutation(
  ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>,
  note: { case_id: string; created_by: string | null }
): Promise<string | null> {
  if (ctx.hasPermission('cases.edit')) return null
  if (!ctx.hasPermission('cases.edit.own')) return 'Manglende tilladelse: cases.edit'
  const ownsCase = await userCanViewCase(note.case_id, { role: ctx.role, userId: ctx.userId, supabase: ctx.supabase })
  if (!ownsCase) return 'Du har kun adgang til noter på egne sager'
  if (note.created_by !== ctx.userId) return 'Du kan kun redigere/slette dine egne noter'
  return null
}

/**
 * Opret en intern note på sagen. Gated server-side: cases.edit (alle sager)
 * eller cases.edit.own (kun egne/tildelte sager via case-scope). Auditerer
 * med case_id + kind + længde — ALDRIG den fulde notetekst. Read-after-write:
 * returnerer den oprettede note (med forfatternavn) så UI kan vise den uden
 * reload. Ingen portal/kundevendt adgang.
 */
export async function createCaseNote(input: {
  caseId: string
  content: string
  kind?: CaseNoteKind
}): Promise<ActionResult<CaseNoteEntry>> {
  try {
    const caseId = input.caseId
    if (!caseId) return { success: false, error: 'caseId mangler' }
    const content = (input.content ?? '').trim()
    if (!content) return { success: false, error: 'Noten må ikke være tom' }
    const kind: CaseNoteKind = input.kind === 'warning' ? 'warning' : 'note'

    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()

    // Permission: cases.edit (alle) ELLER cases.edit.own (kun egne sager).
    const canEditAll = hasPermission('cases.edit')
    if (!canEditAll) {
      if (!hasPermission('cases.edit.own')) {
        return { success: false, error: 'Manglende tilladelse: cases.edit' }
      }
      const ownsCase = await userCanViewCase(caseId, { role, userId, supabase })
      if (!ownsCase) {
        return { success: false, error: 'Du har kun adgang til at tilføje noter på egne sager' }
      }
    }

    const { data: row, error } = await supabase
      .from('case_notes')
      .insert({
        case_id: caseId,
        content: content.slice(0, CASE_NOTE_MAX),
        kind,
        urgency: null,
        created_by: userId,
      })
      .select('id, content, kind, urgency, created_at, created_by')
      .single()
    if (error || !row) {
      logger.error('createCaseNote insert failed', { error })
      return { success: false, error: 'Kunne ikke gemme noten' }
    }

    // Audit — case_id + kind + længde, IKKE den fulde tekst.
    try {
      await createAuditLog({
        entity_type: 'service_case',
        entity_id: caseId,
        entity_name: caseId,
        action: 'update',
        action_description: `Note tilføjet (${kind === 'warning' ? 'advarsel' : 'note'})`,
        metadata: { case_id: caseId, kind, content_length: content.length, event: 'note_added' },
      })
    } catch {
      /* best-effort */
    }

    // Forfatternavn til read-after-write.
    let authorName: string | null = null
    try {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
      authorName = (prof?.full_name as string | null) || null
    } catch { /* best-effort */ }

    return {
      success: true,
      data: {
        id: row.id as string,
        content: (row.content as string | null) ?? '',
        kind: (row.kind as string | null) ?? null,
        urgency: (row.urgency as string | null) ?? null,
        created_at: row.created_at as string,
        author_name: authorName,
        is_mine: true,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

/**
 * Rediger en note (content/kind). Gated via authorizeCaseNoteMutation
 * (cases.edit eller cases.edit.own+egen note). Audit uden fuld tekst.
 */
export async function updateCaseNote(input: {
  noteId: string
  content: string
  kind?: CaseNoteKind
}): Promise<ActionResult<CaseNoteEntry>> {
  try {
    if (!input.noteId) return { success: false, error: 'noteId mangler' }
    const content = (input.content ?? '').trim()
    if (!content) return { success: false, error: 'Noten må ikke være tom' }
    const kind: CaseNoteKind = input.kind === 'warning' ? 'warning' : 'note'

    const ctx = await getAuthenticatedClientWithRole()
    const { supabase, userId } = ctx

    const { data: existing, error: existingErr } = await supabase
      .from('case_notes')
      .select('id, case_id, content, created_by')
      .eq('id', input.noteId)
      .maybeSingle()
    if (existingErr) {
      logger.error('updateCaseNote read failed', { error: existingErr })
      return { success: false, error: 'Kunne ikke læse noten. Den er ikke ændret.' }
    }
    if (!existing) return { success: false, error: 'Noten blev ikke fundet' }

    const denied = await authorizeCaseNoteMutation(ctx, { case_id: existing.case_id as string, created_by: (existing.created_by as string | null) ?? null })
    if (denied) return { success: false, error: denied }

    const lenBefore = ((existing.content as string | null) ?? '').length
    const { data: row, error } = await supabase
      .from('case_notes')
      .update({ content: content.slice(0, CASE_NOTE_MAX), kind })
      .eq('id', input.noteId)
      .select('id, content, kind, urgency, created_at, created_by')
      .single()
    if (error || !row) {
      logger.error('updateCaseNote failed', { error })
      return { success: false, error: 'Kunne ikke gemme ændringen' }
    }

    try {
      await createAuditLog({
        entity_type: 'service_case',
        entity_id: existing.case_id as string,
        entity_name: existing.case_id as string,
        action: 'update',
        action_description: `Note redigeret (${kind === 'warning' ? 'advarsel' : 'note'})`,
        metadata: {
          note_id: input.noteId,
          case_id: existing.case_id,
          kind,
          content_length_before: lenBefore,
          content_length_after: content.length,
          event: 'note_edited',
        },
      })
    } catch { /* best-effort */ }

    let authorName: string | null = null
    try {
      const cbId = (row.created_by as string | null) ?? null
      if (cbId) {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', cbId).maybeSingle()
        authorName = (prof?.full_name as string | null) || null
      }
    } catch { /* best-effort */ }

    return {
      success: true,
      data: {
        id: row.id as string,
        content: (row.content as string | null) ?? '',
        kind: (row.kind as string | null) ?? null,
        urgency: (row.urgency as string | null) ?? null,
        created_at: row.created_at as string,
        author_name: authorName,
        is_mine: (row.created_by as string | null) === userId,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

/**
 * Slet en note (hard-delete — case_notes har ingen soft-delete-kolonne).
 * Gated via authorizeCaseNoteMutation. Audit uden fuld tekst.
 */
export async function deleteCaseNote(noteId: string): Promise<ActionResult<{ id: string }>> {
  try {
    if (!noteId) return { success: false, error: 'noteId mangler' }
    const ctx = await getAuthenticatedClientWithRole()
    const { supabase } = ctx

    const { data: existing, error: existingErr } = await supabase
      .from('case_notes')
      .select('id, case_id, kind, content, created_by')
      .eq('id', noteId)
      .maybeSingle()
    if (existingErr) {
      logger.error('deleteCaseNote read failed', { error: existingErr })
      return { success: false, error: 'Kunne ikke læse noten. Den er ikke slettet.' }
    }
    if (!existing) return { success: false, error: 'Noten blev ikke fundet' }

    const denied = await authorizeCaseNoteMutation(ctx, { case_id: existing.case_id as string, created_by: (existing.created_by as string | null) ?? null })
    if (denied) return { success: false, error: denied }

    const lenBefore = ((existing.content as string | null) ?? '').length
    const { error } = await supabase.from('case_notes').delete().eq('id', noteId)
    if (error) {
      logger.error('deleteCaseNote failed', { error })
      return { success: false, error: 'Kunne ikke slette noten' }
    }

    try {
      await createAuditLog({
        entity_type: 'service_case',
        entity_id: existing.case_id as string,
        entity_name: existing.case_id as string,
        action: 'delete',
        action_description: 'Note slettet',
        metadata: {
          note_id: noteId,
          case_id: existing.case_id,
          kind: existing.kind,
          content_length_before: lenBefore,
          event: 'note_deleted',
        },
      })
    } catch { /* best-effort */ }

    return { success: true, data: { id: noteId } }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}
