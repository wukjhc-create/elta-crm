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
      requires_manual_review, matched_work_order_id, created_at,
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
      created_at: r.created_at,
    }
  })
}

export interface IncomingInvoiceDetail {
  invoice: IncomingInvoiceRow
  lines: IncomingInvoiceLineRow[]
  supplier: { id: string; name: string; code: string | null } | null
  workOrder: { id: string; title: string; status: string } | null
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

  const [linesRes, supplierRes, woRes, auditRes] = await Promise.all([
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
          .select('id, title, status')
          .eq('id', invoice.matched_work_order_id)
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

  return {
    invoice,
    lines: (linesRes.data ?? []) as IncomingInvoiceLineRow[],
    supplier: (supplierRes.data ?? null) as IncomingInvoiceDetail['supplier'],
    workOrder: (woRes.data ?? null) as IncomingInvoiceDetail['workOrder'],
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
    created_at: r.created_at,
  }))
}
