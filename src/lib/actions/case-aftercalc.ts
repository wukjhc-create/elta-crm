'use server'

/**
 * Efterkalkulation V1 — læsning for én sag og for ledelsesoversigten.
 *
 * Kun læsning. Beregningen ligger i src/lib/cases/aftercalc.ts.
 * Kost kræver economy.cost_prices. Sagen slås op med brugerens klient (RLS)
 * før admin-klienten læser kostkolonner (00192). Ingen timesats, ingen lønkolonne.
 */

import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { IN_CHUNK_SIZE } from '@/lib/supabase/in-chunks'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import { copenhagenLocalToIso } from '@/lib/utils/copenhagen-time'
import { buildCaseAftercalc, type AftercalcInput, type CaseAftercalcView } from '@/lib/cases/aftercalc'
import {
  selectOverviewPage,
  takeCaseWindow,
  AFTERCALC_CASE_WINDOW,
  AFTERCALC_PAGE_SIZE,
  AFTERCALC_SORTS,
  AFTERCALC_VARIANCE_FILTERS,
  type AftercalcOverviewFilters,
  type AftercalcOverviewItem,
  type AftercalcOverviewResult,
  type AftercalcSort,
  type AftercalcVarianceFilter,
} from '@/lib/cases/aftercalc-overview'
import { SERVICE_CASE_STATUSES } from '@/types/service-cases.types'
import type { ActionResult } from '@/types/common.types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function nextCalendarDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

function isRealDate(isoDate: string): boolean {
  if (!DATE_RE.test(isoDate)) return false
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

type OfferRow = {
  id: string
  offer_number: string | null
  total_amount: number | string | null
  discount_percentage: number | string | null
  discount_amount: number | string | null
}

type LineRow = {
  id: string
  offer_id?: string
  description: string | null
  quantity: number | string | null
  unit: string | null
  total: number | string | null
  cost_price: number | string | null
  supplier_cost_price_at_creation: number | string | null
  supplier_product_id: string | null
  line_type: string | null
}

type MaterialRow = {
  id: string
  case_id?: string
  description: string | null
  quantity: number | string | null
  unit: string | null
  total_cost: number | string | null
  unit_cost: number | string | null
  supplier_product_id: string | null
  source_offer_line_id: string | null
  billable: boolean | null
  invoice_line_id: string | null
}

type OtherRow = {
  id: string
  case_id?: string
  description: string | null
  quantity: number | string | null
  total_cost: number | string | null
  unit_cost: number | string | null
  billable: boolean | null
  invoice_line_id: string | null
}

type InvoiceRow = {
  case_id?: string
  total_amount: number | string | null
  final_amount: number | string | null
  amount_paid: number | string | null
  status: string | null
  invoice_type: string | null
  voided_at: string | null
}

type WorkOrderRow = { id: string; case_id?: string; status: string | null }

type TimeLogRow = {
  hours: number | string | null
  cost_amount: number | string | null
  billable: boolean | null
  end_time: string | null
  approval_status: string | null
  invoice_line_id: string | null
  work_order?: { case_id: string } | Array<{ case_id: string }> | null
}

function toInput(
  offer: OfferRow | null,
  lines: LineRow[],
  materials: MaterialRow[],
  otherCosts: OtherRow[],
  logs: TimeLogRow[],
  invoices: InvoiceRow[],
  workOrders: WorkOrderRow[],
): AftercalcInput {
  return {
    offer: offer
      ? {
          id: offer.id,
          offer_number: offer.offer_number,
          total_amount: offer.total_amount,
          discount_percentage: offer.discount_percentage,
          discount_amount: offer.discount_amount,
        }
      : null,
    offerLines: lines.map((l) => ({
      id: l.id,
      description: l.description ?? '',
      quantity: l.quantity,
      unit: l.unit,
      total: l.total,
      cost_price: l.cost_price,
      supplier_cost_price_at_creation: l.supplier_cost_price_at_creation,
      supplier_product_id: l.supplier_product_id,
      line_type: l.line_type,
    })),
    materials: materials.map((m) => ({
      id: m.id,
      description: m.description ?? '',
      quantity: m.quantity,
      unit: m.unit,
      total_cost: m.total_cost,
      unit_cost: m.unit_cost,
      supplier_product_id: m.supplier_product_id,
      source_offer_line_id: m.source_offer_line_id,
      billable: m.billable,
      invoice_line_id: m.invoice_line_id,
    })),
    otherCosts: otherCosts.map((o) => ({
      id: o.id,
      description: o.description ?? '',
      quantity: o.quantity,
      total_cost: o.total_cost,
      unit_cost: o.unit_cost,
      billable: o.billable,
      invoice_line_id: o.invoice_line_id,
    })),
    timeLogs: logs.map((l) => ({
      hours: l.hours,
      cost_amount: l.cost_amount,
      billable: l.billable,
      end_time: l.end_time,
      approval_status: l.approval_status,
      invoice_line_id: l.invoice_line_id,
    })),
    invoices: invoices.map((i) => ({
      total_amount: i.total_amount,
      final_amount: i.final_amount,
      amount_paid: i.amount_paid,
      status: i.status,
      invoice_type: i.invoice_type,
      voided_at: i.voided_at,
    })),
    workOrders: workOrders.map((w) => ({ id: w.id, status: w.status })),
  }
}

export async function getCaseAftercalc(caseId: string): Promise<ActionResult<CaseAftercalcView>> {
  try {
    validateUUID(caseId, 'sag ID')
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('economy.cost_prices')) {
      return { success: false, error: 'Manglende tilladelse: economy.cost_prices' }
    }

    const { data: sag, error: caseErr } = await supabase
      .from('service_cases')
      .select('id, case_number, title, source_offer_id')
      .eq('id', caseId)
      .maybeSingle()
    if (caseErr) {
      logger.error('getCaseAftercalc: case failed', { error: caseErr })
      return { success: false, error: 'Kunne ikke hente sagen' }
    }
    if (!sag) return { success: false, error: 'Sag ikke fundet' }

    const offerId = (sag.source_offer_id as string | null) ?? null
    let workOrders: WorkOrderRow[]
    try {
      workOrders = await fetchAllRows<WorkOrderRow>((from, to) =>
        supabase.from('work_orders').select('id, status').eq('case_id', caseId).order('id').range(from, to))
    } catch (error) {
      logger.error('getCaseAftercalc: work_orders failed', { error })
      return { success: false, error: 'Kunne ikke hente arbejdsordrer' }
    }
    const woIds = workOrders.map((w) => w.id)

    const admin = createAdminClient()
    const paged = <T>(label: string, load: () => Promise<T[]>) =>
      load().then((data) => ({ data, error: null }), (error: unknown) => {
        logger.error(`getCaseAftercalc: ${label} failed`, { error })
        return { data: null, error }
      })
    const [offerRes, linesRes, materialsRes, otherRes, invoicesRes, logsRes] = await Promise.all([
      offerId
        ? supabase.from('offers').select('id, offer_number, total_amount, discount_percentage, discount_amount').eq('id', offerId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      offerId
        ? paged('offer_line_items', () => fetchAllRows<LineRow & { position?: number | null }>((from, to) =>
            admin.from('offer_line_items')
              .select('id, description, quantity, unit, total, cost_price, supplier_cost_price_at_creation, supplier_product_id, line_type, position')
              .eq('offer_id', offerId)
              .order('id')
              .range(from, to),
          ).then((rows) => rows.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))))
        : Promise.resolve({ data: [] as LineRow[], error: null }),
      paged('case_materials', () => fetchAllRows<MaterialRow>((from, to) =>
        supabase.from('case_materials')
          .select('id, description, quantity, unit, total_cost, unit_cost, supplier_product_id, source_offer_line_id, billable, invoice_line_id')
          .eq('case_id', caseId)
          .order('id')
          .range(from, to))),
      paged('case_other_costs', () => fetchAllRows<OtherRow>((from, to) =>
        supabase.from('case_other_costs')
          .select('id, description, quantity, total_cost, unit_cost, billable, invoice_line_id')
          .eq('case_id', caseId)
          .order('id')
          .range(from, to))),
      paged('invoices', () => fetchAllRows<InvoiceRow>((from, to) =>
        supabase.from('invoices')
          .select('id, total_amount, final_amount, amount_paid, status, invoice_type, voided_at')
          .eq('case_id', caseId)
          .order('id')
          .range(from, to))),
      woIds.length === 0
        ? Promise.resolve({ data: [] as TimeLogRow[], error: null })
        : paged('time_logs', async () => {
            const rows: TimeLogRow[] = []
            for (let i = 0; i < woIds.length; i += IN_CHUNK_SIZE) {
              const chunk = woIds.slice(i, i + IN_CHUNK_SIZE)
              rows.push(...await fetchAllRows<TimeLogRow>((from, to) =>
                admin.from('time_logs')
                  .select('id, hours, cost_amount, billable, end_time, approval_status, invoice_line_id')
                  .in('work_order_id', chunk)
                  .order('id')
                  .range(from, to)))
            }
            return rows
          }),
    ])

    for (const [name, res] of [
      ['offer', offerRes],
      ['offer_line_items', linesRes],
      ['case_materials', materialsRes],
      ['case_other_costs', otherRes],
      ['invoices', invoicesRes],
      ['time_logs', logsRes],
    ] as const) {
      if (res.error) {
        logger.error(`getCaseAftercalc: ${name} failed`, { error: res.error })
        return { success: false, error: 'Kunne ikke hente efterkalkulation' }
      }
    }

    const calc = buildCaseAftercalc(toInput(
      (offerRes.data as OfferRow | null) ?? null,
      (linesRes.data ?? []) as LineRow[],
      (materialsRes.data ?? []) as MaterialRow[],
      (otherRes.data ?? []) as OtherRow[],
      (logsRes.data ?? []) as TimeLogRow[],
      (invoicesRes.data ?? []) as InvoiceRow[],
      workOrders,
    ))
    return {
      success: true,
      data: {
        ...calc,
        case_number: (sag.case_number as string | null) ?? null,
        title: (sag.title as string | null) ?? null,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Kunne ikke hente efterkalkulation') }
  }
}

function allowed<T extends string>(value: string | null | undefined, list: readonly T[]): value is T {
  return !!value && (list as readonly string[]).includes(value)
}

export async function getAftercalcOverview(filters: AftercalcOverviewFilters = {}): Promise<ActionResult<AftercalcOverviewResult>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('economy.cost_prices')) {
      return { success: false, error: 'Manglende tilladelse: economy.cost_prices' }
    }

    const from = filters.from?.trim() || null
    const to = filters.to?.trim() || null
    if ((from && !isRealDate(from)) || (to && !isRealDate(to)) || (from && to && from > to)) {
      return { success: false, error: 'Ugyldig periode' }
    }
    const assigneeId = filters.assigneeId?.trim() || null
    if (assigneeId) validateUUID(assigneeId, 'ansvarlig')
    const status = filters.status?.trim() || null
    if (status && !allowed(status, SERVICE_CASE_STATUSES)) return { success: false, error: 'Ukendt status' }
    const variance: AftercalcVarianceFilter = filters.variance && allowed(filters.variance, AFTERCALC_VARIANCE_FILTERS) ? filters.variance : 'all'
    if (filters.variance && !allowed(filters.variance, AFTERCALC_VARIANCE_FILTERS)) return { success: false, error: 'Ukendt afvigelsesfilter' }
    const sort: AftercalcSort = filters.sort && allowed(filters.sort, AFTERCALC_SORTS) ? filters.sort : 'worst_db'
    if (filters.sort && !allowed(filters.sort, AFTERCALC_SORTS)) return { success: false, error: 'Ukendt sortering' }
    const page = filters.page == null ? 1 : Math.floor(Number(filters.page))
    if (!Number.isFinite(page) || page < 1) return { success: false, error: 'Ugyldig side' }

    const started = performance.now()
    let caseQuery = supabase
      .from('service_cases')
      .select('id, case_number, title, status, created_at, assigned_to, source_offer_id, customer:customers!service_cases_customer_id_fkey(company_name), assignee:profiles!service_cases_assigned_to_fkey(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(AFTERCALC_CASE_WINDOW + 1)
    if (status) caseQuery = caseQuery.eq('status', status)
    else caseQuery = caseQuery.neq('status', 'converted')
    if (assigneeId) caseQuery = caseQuery.eq('assigned_to', assigneeId)
    if (from) caseQuery = caseQuery.gte('created_at', copenhagenLocalToIso(from, '00:00'))
    if (to) caseQuery = caseQuery.lt('created_at', copenhagenLocalToIso(nextCalendarDate(to), '00:00'))

    const assigneeQuery = supabase
      .from('service_cases')
      .select('assigned_to, assignee:profiles!service_cases_assigned_to_fkey(id, full_name)')
      .not('assigned_to', 'is', null)
      .order('created_at', { ascending: false })
      .limit(400)

    const [caseRes, assigneeRes] = await Promise.all([caseQuery, assigneeQuery])
    if (caseRes.error) {
      logger.error('getAftercalcOverview: cases failed', { error: caseRes.error })
      return { success: false, error: 'Kunne ikke hente sager' }
    }

    const assignees = new Map<string, string | null>()
    if (!assigneeRes.error) {
      for (const row of (assigneeRes.data ?? []) as Array<{ assigned_to: string | null; assignee: { id: string; full_name: string | null } | Array<{ id: string; full_name: string | null }> | null }>) {
        const person = one(row.assignee)
        const id = person?.id ?? row.assigned_to
        if (!id || assignees.has(id)) continue
        assignees.set(id, person?.full_name ?? null)
      }
    }

    type CaseRow = {
      id: string
      case_number: string | null
      title: string | null
      status: string
      created_at: string
      assigned_to: string | null
      source_offer_id: string | null
      customer: { company_name: string | null } | Array<{ company_name: string | null }> | null
      assignee: { id: string; full_name: string | null } | Array<{ id: string; full_name: string | null }> | null
    }
    const fetched = (caseRes.data ?? []) as CaseRow[]
    const windowed = takeCaseWindow(fetched)
    const cases = windowed.rows
    if (cases.length === 0) {
      return {
        success: true,
        data: {
          rows: [],
          total: 0,
          page: 1,
          pageSize: AFTERCALC_PAGE_SIZE,
          truncated: false,
          cases_considered: 0,
          query_ms: Math.round(performance.now() - started),
          assignees: [...assignees.entries()].map(([id, full_name]) => ({ id, full_name })).sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'da')),
        },
      }
    }

    const caseIds = cases.map((c) => c.id)
    const offerIds = [...new Set(cases.map((c) => c.source_offer_id).filter((id): id is string => !!id))]
    const admin = createAdminClient()

    const [offers, lines, materials, others, invoices, workOrders, logs] = await Promise.all([
      offerIds.length
        ? fetchAllRows<OfferRow>((f, t) => supabase.from('offers').select('id, offer_number, total_amount, discount_percentage, discount_amount').in('id', offerIds).order('id').range(f, t))
        : Promise.resolve([] as OfferRow[]),
      offerIds.length
        ? fetchAllRows<LineRow>((f, t) => admin.from('offer_line_items').select('id, offer_id, description, quantity, unit, total, cost_price, supplier_cost_price_at_creation, supplier_product_id, line_type').in('offer_id', offerIds).order('id').range(f, t))
        : Promise.resolve([] as LineRow[]),
      fetchAllRows<MaterialRow>((f, t) => supabase.from('case_materials').select('id, case_id, description, quantity, unit, total_cost, unit_cost, supplier_product_id, source_offer_line_id, billable, invoice_line_id').in('case_id', caseIds).order('id').range(f, t)),
      fetchAllRows<OtherRow>((f, t) => supabase.from('case_other_costs').select('id, case_id, description, quantity, total_cost, unit_cost, billable, invoice_line_id').in('case_id', caseIds).order('id').range(f, t)),
      fetchAllRows<InvoiceRow>((f, t) => supabase.from('invoices').select('id, case_id, total_amount, final_amount, amount_paid, status, invoice_type, voided_at').in('case_id', caseIds).order('id').range(f, t)),
      fetchAllRows<WorkOrderRow>((f, t) => supabase.from('work_orders').select('id, case_id, status').in('case_id', caseIds).order('id').range(f, t)),
      fetchAllRows<TimeLogRow>((f, t) => admin.from('time_logs').select('id, hours, cost_amount, billable, end_time, approval_status, invoice_line_id, work_order:work_orders!inner(case_id)').in('work_order.case_id', caseIds).order('id').range(f, t)),
    ])

    const offerById = new Map(offers.map((o) => [o.id, o]))
    const linesByOffer = new Map<string, LineRow[]>()
    for (const line of lines) {
      const id = line.offer_id
      if (!id) continue
      const list = linesByOffer.get(id) ?? []
      list.push(line)
      linesByOffer.set(id, list)
    }
    const group = <T extends { case_id?: string }>(rows: T[]) => {
      const map = new Map<string, T[]>()
      for (const row of rows) {
        if (!row.case_id) continue
        const list = map.get(row.case_id) ?? []
        list.push(row)
        map.set(row.case_id, list)
      }
      return map
    }
    const matsByCase = group(materials)
    const otherByCase = group(others)
    const invByCase = group(invoices)
    const woByCase = group(workOrders)
    const logsByCase = new Map<string, TimeLogRow[]>()
    for (const log of logs) {
      const wo = one(log.work_order)
      if (!wo?.case_id) continue
      const list = logsByCase.get(wo.case_id) ?? []
      list.push(log)
      logsByCase.set(wo.case_id, list)
    }

    const items: AftercalcOverviewItem[] = cases.map((c) => {
      const calc = buildCaseAftercalc(toInput(
        c.source_offer_id ? offerById.get(c.source_offer_id) ?? null : null,
        c.source_offer_id ? linesByOffer.get(c.source_offer_id) ?? [] : [],
        matsByCase.get(c.id) ?? [],
        otherByCase.get(c.id) ?? [],
        logsByCase.get(c.id) ?? [],
        invByCase.get(c.id) ?? [],
        woByCase.get(c.id) ?? [],
      ))
      const customer = one(c.customer)
      const assignee = one(c.assignee)
      return {
        actual_db: calc.actual.contribution_margin,
        row: {
          case_id: c.id,
          case_number: c.case_number ?? '',
          title: c.title ?? '',
          customer_name: customer?.company_name ?? null,
          assignee_name: assignee?.full_name ?? null,
          status: c.status,
          created_at: c.created_at,
          quoted_revenue: calc.quoted.revenue,
          actual_revenue: calc.actual.revenue,
          quoted_db_pct: calc.quoted.contribution_margin_pct,
          actual_db_pct: calc.actual.contribution_margin_pct,
          db_variance: calc.variance.contribution_margin.amount,
          db_variance_pct_points: calc.variance.contribution_margin_pct_points,
          data_quality: calc.data_quality,
          warning_codes: calc.warnings.map((w) => w.code),
          invoiced_state: calc.invoiced_state,
        },
      }
    })

    const selected = selectOverviewPage(items, {
      variance,
      missingCostOnly: filters.missingCostOnly === true,
      sort,
      page,
    })
    return {
      success: true,
      data: {
        ...selected,
        truncated: windowed.truncated,
        cases_considered: cases.length,
        query_ms: Math.round(performance.now() - started),
        assignees: [...assignees.entries()].map(([id, full_name]) => ({ id, full_name })).sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'da')),
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Kunne ikke hente efterkalkulation') }
  }
}
