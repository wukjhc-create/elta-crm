'use server'

/**
 * Incoming-invoice server actions for the approval UI.
 *
 * Pure UI wrappers around the existing service in
 * src/lib/services/incoming-invoices.ts — no business logic added.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import {
  approveInvoice,
  getApprovalQueue,
  getInvoiceById,
  parseAndMatch,
  rejectInvoice,
} from '@/lib/services/incoming-invoices'
import type {
  IncomingInvoiceLineRow,
  IncomingInvoiceRow,
  IncomingInvoiceStatus,
} from '@/types/incoming-invoices.types'

export interface ActionOutcome {
  ok: boolean
  message: string
  data?: Record<string, unknown>
}

export interface IncomingInvoiceListItem {
  id: string
  supplier_id: string | null
  supplier_name: string | null
  invoice_number: string | null
  amount_incl_vat: number | null
  currency: string
  invoice_date: string | null
  status: IncomingInvoiceStatus
  parse_status: string
  parse_confidence: number | null
  match_confidence: number | null
  requires_manual_review: boolean
  matched_work_order_id: string | null
  matched_case_id: string | null
  created_at: string
}

export interface ListFilter {
  status?: 'all' | 'awaiting_approval' | 'needs_review' | 'approved' | 'rejected' | 'posted'
  limit?: number
}

export async function listIncomingInvoicesAction(
  filter: ListFilter = {}
): Promise<IncomingInvoiceListItem[]> {
  const { supabase } = await getAuthenticatedClient()
  const limit = filter.limit ?? 200

  let q = supabase
    .from('incoming_invoices')
    .select(`
      id, supplier_id, supplier_name_extracted, invoice_number,
      amount_incl_vat, currency, invoice_date, status,
      parse_status, parse_confidence, match_confidence,
      requires_manual_review, matched_work_order_id, matched_case_id,
      created_at,
      suppliers:supplier_id ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  switch (filter.status) {
    case undefined:
    case 'all':
      break
    case 'needs_review':
      q = q.eq('requires_manual_review', true).neq('status', 'rejected').neq('status', 'cancelled')
      break
    case 'awaiting_approval':
      q = q.eq('status', 'awaiting_approval').eq('requires_manual_review', false)
      break
    case 'approved':
      q = q.eq('status', 'approved')
      break
    case 'rejected':
      q = q.eq('status', 'rejected')
      break
    case 'posted':
      q = q.eq('status', 'posted')
      break
  }

  const { data } = await q
  return (data ?? []).map((r) => {
    const supplierJoin = (r as { suppliers?: { name?: string } | { name?: string }[] }).suppliers
    const supplierName = Array.isArray(supplierJoin)
      ? supplierJoin[0]?.name ?? null
      : (supplierJoin as { name?: string } | undefined)?.name ?? null
    return {
      id: r.id,
      supplier_id: r.supplier_id,
      supplier_name: supplierName ?? r.supplier_name_extracted ?? null,
      invoice_number: r.invoice_number,
      amount_incl_vat: r.amount_incl_vat != null ? Number(r.amount_incl_vat) : null,
      currency: r.currency,
      invoice_date: r.invoice_date,
      status: r.status as IncomingInvoiceStatus,
      parse_status: r.parse_status as string,
      parse_confidence: r.parse_confidence != null ? Number(r.parse_confidence) : null,
      match_confidence: r.match_confidence != null ? Number(r.match_confidence) : null,
      requires_manual_review: !!r.requires_manual_review,
      matched_work_order_id: r.matched_work_order_id,
      matched_case_id: (r as { matched_case_id?: string | null }).matched_case_id ?? null,
      created_at: r.created_at,
    }
  })
}

export interface IncomingInvoiceDetail {
  invoice: IncomingInvoiceRow
  lines: IncomingInvoiceLineRow[]
  supplier: { id: string; name: string; code: string | null } | null
  workOrder: { id: string; title: string; status: string; case_id: string | null } | null
  case: {
    id: string
    case_number: string
    title: string
    project_name: string | null
    customer_name: string | null
  } | null
  audit: Array<{
    id: string
    action: string
    actor_id: string | null
    actor_name: string | null
    previous_value: Record<string, unknown> | null
    new_value: Record<string, unknown> | null
    ok: boolean
    message: string | null
    created_at: string
  }>
}

export async function getIncomingInvoiceDetailAction(id: string): Promise<IncomingInvoiceDetail | null> {
  const { supabase } = await getAuthenticatedClient()
  const invoice = await getInvoiceById(id)
  if (!invoice) return null

  const [linesRes, supplierRes, woRes, caseRes, auditRes] = await Promise.all([
    supabase
      .from('incoming_invoice_lines')
      .select('*')
      .eq('incoming_invoice_id', id)
      .order('line_number', { ascending: true }),
    invoice.supplier_id
      ? supabase
          .from('suppliers')
          .select('id, name, code')
          .eq('id', invoice.supplier_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    invoice.matched_work_order_id
      ? supabase
          .from('work_orders')
          .select('id, title, status, case_id')
          .eq('id', invoice.matched_work_order_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    invoice.matched_case_id
      ? supabase
          .from('service_cases')
          .select(`
            id, case_number, title, project_name,
            customer:customers!left(company_name)
          `)
          .eq('id', invoice.matched_case_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('incoming_invoice_audit_log')
      .select('id, action, actor_id, previous_value, new_value, ok, message, created_at')
      .eq('incoming_invoice_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // Resolve actor names without a join (profiles has no auth.users FK).
  const actorIds = Array.from(
    new Set((auditRes.data ?? []).map((a) => a.actor_id).filter((x): x is string => !!x))
  )
  const actorMap = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', actorIds)
    for (const p of profiles ?? []) {
      actorMap.set(p.id, p.full_name || p.email || p.id)
    }
  }

  const caseRow = caseRes.data as
    | {
        id: string
        case_number: string
        title: string
        project_name: string | null
        customer: { company_name: string | null } | { company_name: string | null }[] | null
      }
    | null
  const caseDetail = caseRow
    ? {
        id: caseRow.id,
        case_number: caseRow.case_number,
        title: caseRow.title,
        project_name: caseRow.project_name,
        customer_name: Array.isArray(caseRow.customer)
          ? caseRow.customer[0]?.company_name ?? null
          : caseRow.customer?.company_name ?? null,
      }
    : null

  return {
    invoice,
    lines: (linesRes.data ?? []) as IncomingInvoiceLineRow[],
    supplier: (supplierRes.data ?? null) as IncomingInvoiceDetail['supplier'],
    workOrder: (woRes.data ?? null) as IncomingInvoiceDetail['workOrder'],
    case: caseDetail,
    audit: (auditRes.data ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      actor_id: a.actor_id,
      actor_name: a.actor_id ? (actorMap.get(a.actor_id) ?? null) : null,
      previous_value: a.previous_value as Record<string, unknown> | null,
      new_value: a.new_value as Record<string, unknown> | null,
      ok: a.ok,
      message: a.message,
      created_at: a.created_at,
    })),
  }
}

export async function approveIncomingInvoiceAction(
  id: string,
  acknowledgeReview?: boolean
): Promise<ActionOutcome> {
  const { userId } = await getAuthenticatedClient()
  const r = await approveInvoice(id, userId, { acknowledgeReview: acknowledgeReview === true })
  revalidatePath('/dashboard/incoming-invoices')
  revalidatePath(`/dashboard/incoming-invoices/${id}`)
  return r.externalId
    ? { ok: r.ok, message: r.message, data: { externalId: r.externalId } }
    : { ok: r.ok, message: r.message }
}

export async function rejectIncomingInvoiceAction(
  id: string,
  reason: string
): Promise<ActionOutcome> {
  if (!reason || reason.trim().length < 3) {
    return { ok: false, message: 'Angiv venligst en begrundelse (mindst 3 tegn).' }
  }
  const { userId } = await getAuthenticatedClient()
  const r = await rejectInvoice(id, userId, reason.trim())
  revalidatePath('/dashboard/incoming-invoices')
  revalidatePath(`/dashboard/incoming-invoices/${id}`)
  return r
}

export async function reparseIncomingInvoiceAction(id: string): Promise<ActionOutcome> {
  await getAuthenticatedClient()
  const r = await parseAndMatch(id)
  revalidatePath(`/dashboard/incoming-invoices/${id}`)
  return { ok: r.parsed, message: r.message, data: r as unknown as Record<string, unknown> }
}

/**
 * Sprint 5E-1 commit 3 — manual sag-match.
 *
 * Lets the operator override the matcher's choice from the detail UI.
 * Behaviour:
 *   - caseId set: writes matched_case_id, clears matched_work_order_id
 *     (we don't know which WO on the new sag is the right one — the
 *     caller must explicitly link a WO via a future flow).
 *   - caseId null: clears both matched_case_id and matched_work_order_id.
 *   - Refuses on terminal status (approved/rejected/posted/cancelled)
 *     so we never re-match a finalised invoice.
 *   - Records an audit log entry (action='matched') with previous and
 *     new values so the trail is preserved.
 */
export async function setIncomingInvoiceCaseAction(
  invoiceId: string,
  caseId: string | null
): Promise<ActionOutcome> {
  const { supabase, userId } = await getAuthenticatedClient()

  // Read current state
  const { data: cur, error: readErr } = await supabase
    .from('incoming_invoices')
    .select('id, status, matched_case_id, matched_work_order_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (readErr || !cur) {
    return { ok: false, message: 'Faktura ikke fundet' }
  }

  const TERMINAL = ['approved', 'rejected', 'posted', 'cancelled']
  if (TERMINAL.includes(cur.status as string)) {
    return {
      ok: false,
      message: `Faktura er ${cur.status} — sag-tilknytning kan ikke ændres`,
    }
  }

  // Validate target case exists if not clearing
  let caseLabel: string | null = null
  if (caseId) {
    const { data: caseRow, error: caseErr } = await supabase
      .from('service_cases')
      .select('id, case_number')
      .eq('id', caseId)
      .maybeSingle()
    if (caseErr || !caseRow) {
      return { ok: false, message: 'Sag ikke fundet' }
    }
    caseLabel = (caseRow.case_number as string) ?? caseRow.id
  }

  const patch = {
    matched_case_id: caseId,
    // Always clear WO when the case changes manually — the matcher's
    // earlier WO choice may belong to a different sag now.
    matched_work_order_id: null,
  }

  const { error: updErr } = await supabase
    .from('incoming_invoices')
    .update(patch)
    .eq('id', invoiceId)
  if (updErr) {
    return { ok: false, message: updErr.message }
  }

  // Audit (best-effort — same shape as the rest of Phase 15)
  try {
    await supabase.from('incoming_invoice_audit_log').insert({
      incoming_invoice_id: invoiceId,
      action: 'matched',
      actor_id: userId,
      previous_value: {
        matched_case_id: cur.matched_case_id,
        matched_work_order_id: cur.matched_work_order_id,
      },
      new_value: {
        matched_case_id: caseId,
        matched_work_order_id: null,
      },
      ok: true,
      message: caseId
        ? `manual case match → ${caseLabel ?? caseId}`
        : 'manual case match cleared',
    })
  } catch {
    /* best-effort */
  }

  revalidatePath('/dashboard/incoming-invoices')
  revalidatePath(`/dashboard/incoming-invoices/${invoiceId}`)

  return {
    ok: true,
    message: caseId
      ? `Tilknyttet sag ${caseLabel ?? ''}`
      : 'Sag-tilknytning fjernet',
  }
}

export async function getApprovalQueueCountsAction(): Promise<{
  awaiting_approval: number
  needs_review: number
  approved: number
  rejected: number
  posted: number
}> {
  const { supabase } = await getAuthenticatedClient()
  const [aw, nr, ap, rj, pst] = await Promise.all([
    supabase
      .from('incoming_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'awaiting_approval')
      .eq('requires_manual_review', false),
    supabase
      .from('incoming_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('requires_manual_review', true)
      .neq('status', 'rejected')
      .neq('status', 'cancelled'),
    supabase.from('incoming_invoices').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('incoming_invoices').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    supabase.from('incoming_invoices').select('id', { count: 'exact', head: true }).eq('status', 'posted'),
  ])
  return {
    awaiting_approval: aw.count ?? 0,
    needs_review: nr.count ?? 0,
    approved: ap.count ?? 0,
    rejected: rj.count ?? 0,
    posted: pst.count ?? 0,
  }
}

// Re-export the queue helper for the list page's initial data fetch.
export async function getInitialApprovalQueue(): Promise<IncomingInvoiceListItem[]> {
  await getAuthenticatedClient()
  const rows = await getApprovalQueue(200)
  return rows.map((r) => ({
    id: r.id,
    supplier_id: r.supplier_id,
    supplier_name: r.supplier_name_extracted ?? null,
    invoice_number: r.invoice_number,
    amount_incl_vat: r.amount_incl_vat != null ? Number(r.amount_incl_vat) : null,
    currency: r.currency,
    invoice_date: r.invoice_date,
    status: r.status,
    parse_status: r.parse_status,
    parse_confidence: r.parse_confidence != null ? Number(r.parse_confidence) : null,
    match_confidence: r.match_confidence != null ? Number(r.match_confidence) : null,
    requires_manual_review: !!r.requires_manual_review,
    matched_work_order_id: r.matched_work_order_id,
    matched_case_id: (r as { matched_case_id?: string | null }).matched_case_id ?? null,
    created_at: r.created_at,
  }))
}
