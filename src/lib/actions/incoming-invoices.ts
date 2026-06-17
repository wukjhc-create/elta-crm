'use server'

/**
 * Incoming-invoice server actions for the approval UI.
 *
 * Pure UI wrappers around the existing service in
 * src/lib/services/incoming-invoices.ts — no business logic added.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import {
  approveInvoice,
  getApprovalQueue,
  getInvoiceById,
  parseAndMatch,
  rejectInvoice,
} from '@/lib/services/incoming-invoices'
import {
  convertAndApproveInvoice,
  type LinePlanInput,
  type ConvertAndApproveResult,
} from '@/lib/services/incoming-invoice-conversion'
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
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.view')) return []
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
  /** Sprint Ø9.0 — har fakturaen et bilag? (beregnet før storage-URL redaction). */
  has_file: boolean
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
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.view')) return null
  const invoice = await getInvoiceById(id)
  if (!invoice) return null

  // Sprint Ø9.0 — har-bilag beregnes FØR redaction; rå storage-URL redactes ud
  // af payloaden (storage-objekter må KUN nås via getIncomingInvoiceFileUrlAction
  // / signed-url). Eksterne email/Graph-URL'er beholdes (provider-styret).
  const attachmentKind = classifyAttachmentUrl(invoice.file_url).kind
  const hasFile = attachmentKind !== 'none'
  if (attachmentKind === 'storage') {
    invoice.file_url = null
  }

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
            customer:customers!service_cases_customer_id_fkey(company_name)
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
    has_file: hasFile,
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
  const { userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.approve')) {
    return { ok: false, message: 'Manglende tilladelse: incoming_invoices.approve' }
  }
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
  const { userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.approve')) {
    return { ok: false, message: 'Manglende tilladelse: incoming_invoices.approve' }
  }
  const r = await rejectInvoice(id, userId, reason.trim())
  revalidatePath('/dashboard/incoming-invoices')
  revalidatePath(`/dashboard/incoming-invoices/${id}`)
  return r
}

// =====================================================
// TEST SEED — admin-only convenience for browser-testing 5E flow
// =====================================================
//
// Creates ONE clearly-marked test invoice + 3 lines (1 material-ish,
// 1 kørsel, 1 lift). The fakturanr is hard-prefixed "TEST-" so we
// can match-and-clean-up without touching real data. No e-conomic
// push — never. Admin-only gate.

const TEST_INVOICE_PREFIX = 'TEST-'
const TEST_SUPPLIER_NAME = 'TEST Leverandør ApS'

async function requireAdminClient() {
  const { supabase, userId } = await getAuthenticatedClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (!profile || profile.role !== 'admin') {
    throw new Error('Kun administratorer må oprette testdata')
  }
  return { supabase, userId }
}

export async function createTestIncomingInvoiceAction(): Promise<ActionOutcome> {
  let supabase
  let userId: string
  try {
    const a = await requireAdminClient()
    supabase = a.supabase
    userId = a.userId
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Adgang nægtet' }
  }

  // Pick the most recent open service_case to attach to so the
  // operator can immediately exercise approve/preview without a
  // separate sag-match step. If none, leave matched_case_id null —
  // operator does "Match til sag" via the existing 5E-1 picker.
  const { data: caseRow } = await supabase
    .from('service_cases')
    .select('id, case_number')
    .in('status', ['new', 'in_progress', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Generate a unique invoice_number so re-clicks don't trip the
  // (supplier_id, invoice_number) UNIQUE — supplier is null on test
  // rows so the partial index doesn't apply, but we still want
  // distinct labels in the queue.
  const ts = new Date()
  const stamp =
    `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}` +
    `${String(ts.getDate()).padStart(2, '0')}-` +
    `${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}` +
    `${String(ts.getSeconds()).padStart(2, '0')}`
  const invoiceNumber = `${TEST_INVOICE_PREFIX}${stamp}`

  const today = ts.toISOString().slice(0, 10)
  const dueDate = new Date(ts.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: inserted, error: insErr } = await supabase
    .from('incoming_invoices')
    .insert({
      source: 'manual',
      uploaded_by: userId,
      supplier_id: null,                                 // no supplier match — keeps things isolated
      supplier_name_extracted: TEST_SUPPLIER_NAME,
      invoice_number: invoiceNumber,
      invoice_date: today,
      due_date: dueDate,
      currency: 'DKK',
      amount_excl_vat: 10000,
      vat_amount: 2500,
      amount_incl_vat: 12500,
      parse_status: 'parsed',
      parse_confidence: 1.0,
      matched_case_id: caseRow?.id ?? null,
      match_confidence: caseRow ? 1.0 : 0,
      requires_manual_review: false,
      status: 'awaiting_approval',
      notes: 'TEST FAKTURA — oprettet via admin seed-knap. Sikker at slette.',
    })
    .select('id, invoice_number')
    .single()

  if (insErr || !inserted) {
    return {
      ok: false,
      message: `Kunne ikke oprette test-faktura: ${insErr?.message ?? 'ukendt fejl'}`,
    }
  }

  // Lines per Henrik's spec
  const lines = [
    { line_number: 1, description: 'Solpanel 425W',        quantity: 8,   unit: 'stk', unit_price: 1000, total_price: 8000 },
    { line_number: 2, description: 'Kørsel til pladsen',   quantity: 100, unit: 'km',  unit_price: 5,    total_price: 500 },
    { line_number: 3, description: 'Liftleje',             quantity: 1,   unit: 'dag', unit_price: 1500, total_price: 1500 },
  ]
  const { error: lineErr } = await supabase
    .from('incoming_invoice_lines')
    .insert(
      lines.map((l) => ({
        incoming_invoice_id: inserted.id,
        ...l,
      }))
    )
  if (lineErr) {
    // Clean up the orphan header so we don't leave half a test row.
    await supabase.from('incoming_invoices').delete().eq('id', inserted.id)
    return {
      ok: false,
      message: `Kunne ikke oprette test-linjer (faktura rullet tilbage): ${lineErr.message}`,
    }
  }

  // Audit row so the trail shows where this came from
  await supabase.from('incoming_invoice_audit_log').insert({
    incoming_invoice_id: inserted.id,
    action: 'ingested',
    actor_id: userId,
    ok: true,
    message: caseRow
      ? `TEST seed oprettet (matchet til ${caseRow.case_number ?? caseRow.id})`
      : 'TEST seed oprettet (ingen sag matchet — brug "Match til sag")',
    new_value: {
      test_seed: true,
      invoice_number: inserted.invoice_number,
      matched_case_id: caseRow?.id ?? null,
    },
  })

  revalidatePath('/dashboard/incoming-invoices')
  revalidatePath(`/dashboard/incoming-invoices/${inserted.id}`)

  return {
    ok: true,
    message: `Test-faktura oprettet (${inserted.invoice_number})${caseRow ? ` og matchet til ${caseRow.case_number ?? 'sag'}` : ''}`,
    data: { invoiceId: inserted.id, invoiceNumber: inserted.invoice_number },
  }
}

/**
 * Cleanup: delete a test invoice + cascade lines/audit.
 * Strict guard — refuses to delete anything not bearing the TEST_
 * prefix. Also rolls back any case_materials / case_other_costs the
 * test invoice converted into (only those linked back to its lines).
 */
export async function deleteTestIncomingInvoiceAction(
  invoiceId: string
): Promise<ActionOutcome> {
  let supabase
  try {
    const a = await requireAdminClient()
    supabase = a.supabase
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Adgang nægtet' }
  }

  const { data: inv } = await supabase
    .from('incoming_invoices')
    .select('id, invoice_number, supplier_name_extracted')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!inv) return { ok: false, message: 'Faktura ikke fundet' }

  const isTest =
    (inv.invoice_number ?? '').startsWith(TEST_INVOICE_PREFIX) ||
    inv.supplier_name_extracted === TEST_SUPPLIER_NAME
  if (!isTest) {
    return {
      ok: false,
      message: 'Refused: dette er ikke en TEST-faktura (sikkerhedsguard).',
    }
  }

  // Find lines first so we can purge any conversions created by 5E-3.
  const { data: lines } = await supabase
    .from('incoming_invoice_lines')
    .select('id, converted_case_material_id, converted_case_other_cost_id')
    .eq('incoming_invoice_id', invoiceId)

  let removedMaterials = 0
  let removedOther = 0
  for (const ln of lines ?? []) {
    if (ln.converted_case_material_id) {
      const { count } = await supabase
        .from('case_materials')
        .delete({ count: 'exact' })
        .eq('id', ln.converted_case_material_id)
      removedMaterials += count ?? 0
    }
    if (ln.converted_case_other_cost_id) {
      const { count } = await supabase
        .from('case_other_costs')
        .delete({ count: 'exact' })
        .eq('id', ln.converted_case_other_cost_id)
      removedOther += count ?? 0
    }
  }

  // CASCADE on incoming_invoice_lines.incoming_invoice_id and
  // incoming_invoice_audit_log.incoming_invoice_id will clean those.
  const { error: delErr } = await supabase
    .from('incoming_invoices')
    .delete()
    .eq('id', invoiceId)
  if (delErr) {
    return { ok: false, message: `Kunne ikke slette: ${delErr.message}` }
  }

  revalidatePath('/dashboard/incoming-invoices')

  return {
    ok: true,
    message:
      `TEST-faktura slettet (${inv.invoice_number}). ` +
      `Ryddet: ${removedMaterials} materiale-linje(r), ${removedOther} øvrig-linje(r).`,
  }
}

/**
 * Sprint 5E-3 — converts faktura-linjer to case_materials/case_other_costs
 * and flips status to 'approved' atomically (per-line, not transaction).
 * Honours the manual-review gate same as approveIncomingInvoiceAction.
 *
 * Pure server action. Schedules revalidatePath for both list, detail
 * and the linked sag's order page so all three reflect the change.
 */
export async function approveIncomingInvoiceWithConversionAction(
  invoiceId: string,
  plan: LinePlanInput[],
  acknowledgeReview?: boolean
): Promise<ConvertAndApproveResult> {
  const { userId, supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.approve')) {
    return { ok: false, message: 'Manglende tilladelse: incoming_invoices.approve', invoiceStatusFlipped: false, perLine: [], caseId: null }
  }
  const result = await convertAndApproveInvoice(invoiceId, userId, plan, {
    acknowledgeReview: acknowledgeReview === true,
  })

  revalidatePath('/dashboard/incoming-invoices')
  revalidatePath(`/dashboard/incoming-invoices/${invoiceId}`)
  if (result.caseId) {
    // Resolve case_number for the canonical orders detail path.
    const { data: caseRow } = await supabase
      .from('service_cases')
      .select('id, case_number')
      .eq('id', result.caseId)
      .maybeSingle()
    if (caseRow?.case_number) {
      revalidatePath(`/dashboard/orders/${caseRow.case_number}`)
    }
    revalidatePath(`/dashboard/orders/${result.caseId}`)
  }
  return result
}

export async function reparseIncomingInvoiceAction(id: string): Promise<ActionOutcome> {
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.edit')) {
    return { ok: false, message: 'Manglende tilladelse: incoming_invoices.edit' }
  }
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
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.edit')) {
    return { ok: false, message: 'Manglende tilladelse: incoming_invoices.edit' }
  }

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
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.view')) {
    return { awaiting_approval: 0, needs_review: 0, approved: 0, rejected: 0, posted: 0 }
  }
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
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.view')) return []
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

// =====================================================
// Sprint Ø9.0 — Manuel defensiv "Bogfør til e-conomic"
// =====================================================
//
// Godkendelse pusher allerede til e-conomic (skip-safe). Denne action giver
// et manuelt genforsøg for GODKENDTE fakturaer der endnu ikke er bogført —
// fx hvis integrationen ikke var opsat ved godkendelsen, eller pushet fejlede.
// Defensiv: kun status='approved', ikke allerede bogført, integration klar.
// Genbruger pushSupplierInvoiceToEconomic — ingen ny eksportmotor. Ingen
// secrets i payload/logs. Audit i incoming_invoice_audit_log.

export interface PostEconomicOutcome {
  ok: boolean
  status: 'posted' | 'not_configured' | 'already_posted' | 'not_eligible' | 'failed' | 'denied'
  message: string
  external_id?: string | null
}

export async function postIncomingInvoiceToEconomicAction(id: string): Promise<PostEconomicOutcome> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.approve')) {
    return { ok: false, status: 'denied', message: 'Manglende tilladelse: incoming_invoices.approve' }
  }

  const { data: inv } = await supabase
    .from('incoming_invoices')
    .select('id, status, external_invoice_id, external_provider')
    .eq('id', id)
    .maybeSingle()
  if (!inv) return { ok: false, status: 'not_eligible', message: 'Faktura ikke fundet' }
  if (inv.external_invoice_id && inv.external_provider === 'economic') {
    return { ok: true, status: 'already_posted', message: 'Fakturaen er allerede bogført i e-conomic.', external_id: inv.external_invoice_id as string }
  }
  if (inv.status !== 'approved') {
    return { ok: false, status: 'not_eligible', message: 'Kun godkendte fakturaer kan bogføres (ikke ' + inv.status + ').' }
  }

  const { getEconomicSettings, isEconomicReady, pushSupplierInvoiceToEconomic } = await import('@/lib/services/economic-client')
  if (!isEconomicReady(await getEconomicSettings())) {
    return { ok: false, status: 'not_configured', message: 'e-conomic er ikke opsat endnu.' }
  }

  // Bruger-attribueret audit (best-effort) — ingen secrets.
  const audit = async (ok: boolean, message: string, newValue: Record<string, unknown>) => {
    try {
      await supabase.from('incoming_invoice_audit_log').insert({
        incoming_invoice_id: id, action: 'posted', actor_id: userId, ok, message, new_value: newValue,
      })
    } catch { /* best-effort */ }
  }

  const econ = await pushSupplierInvoiceToEconomic(id)
  if (econ.status === 'success') {
    await audit(true, `Manuelt bogført i e-conomic (${econ.externalId})`, { external_invoice_id: econ.externalId })
    revalidatePath(`/dashboard/incoming-invoices/${id}`)
    revalidatePath('/dashboard/incoming-invoices')
    return { ok: true, status: 'posted', message: 'Faktura bogført i e-conomic.', external_id: econ.externalId ?? null }
  }
  if (econ.status === 'skipped') {
    const notConfigured = (econ.reason ?? '').includes('NOT_CONFIGURED')
    return notConfigured
      ? { ok: false, status: 'not_configured', message: 'e-conomic er ikke opsat endnu.' }
      : { ok: true, status: 'already_posted', message: 'Fakturaen er allerede bogført.', external_id: econ.externalId ?? null }
  }
  await audit(false, `Manuel bogføring fejlede: ${econ.error ?? 'ukendt'}`, { reason: econ.reason ?? null })
  return { ok: false, status: 'failed', message: `Bogføring fejlede: ${econ.error ?? 'ukendt fejl'}` }
}

// =====================================================
// Sprint Ø9.0 — Sikker bilags-URL (signed-url/admin-helper mønster)
// =====================================================
//
// incoming_invoices.file_url er i dag enten NULL (email-body-ingest) eller en
// EKSTERN email/Graph-URL. Men hvis et bilag nogensinde ligger i et privat
// Supabase-bucket, må det KUN vises via signed-url-helperen — aldrig som rå
// public storage-URL. Denne resolver klassificerer URL'en og signerer kun
// storage-objekter; eksterne URL'er (provider-access-styret) passerer uændret.

const KNOWN_STORAGE_BUCKETS = new Set(['attachments', 'service-case-files', 'portal-attachments'])

type AttachmentKind =
  | { kind: 'none' }
  | { kind: 'external'; url: string }
  | { kind: 'storage'; bucket: string; path: string }

/** Klassificér en file_url. Ren funktion — ingen secrets, intet DB-kald. */
function classifyAttachmentUrl(fileUrl: string | null | undefined): AttachmentKind {
  if (!fileUrl || typeof fileUrl !== 'string') return { kind: 'none' }
  const v = fileUrl.trim()
  if (!v) return { kind: 'none' }

  // Supabase storage-URL: .../storage/v1/object/(public|sign|authenticated)/<bucket>/<path>
  const m = v.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/)
  if (m) {
    return { kind: 'storage', bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) }
  }
  // Ekstern http(s)-URL (email/Graph) — ikke vores at signere.
  if (/^https?:\/\//i.test(v)) return { kind: 'external', url: v }
  // Bar sti "bucket/path" hvor bucket er et kendt privat bucket → storage.
  const slash = v.indexOf('/')
  if (slash > 0) {
    const bucket = v.slice(0, slash)
    if (KNOWN_STORAGE_BUCKETS.has(bucket)) {
      return { kind: 'storage', bucket, path: v.slice(slash + 1) }
    }
  }
  return { kind: 'none' }
}

export interface AttachmentUrlResult {
  ok: boolean
  url: string | null
  /** True når URL'en er ekstern (provider-styret), ikke et signeret storage-objekt. */
  external: boolean
  message?: string
}

/**
 * Resolvér en sikker bilags-URL for en leverandørfaktura. Gated
 * incoming_invoices.view. Storage-objekter signeres (kort TTL) via den
 * eksisterende helper; eksterne URL'er returneres uændret (kun til
 * autoriserede interne brugere). Returnerer ALDRIG en rå public storage-URL.
 */
export async function getIncomingInvoiceFileUrlAction(id: string): Promise<AttachmentUrlResult> {
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.view')) {
    return { ok: false, url: null, external: false, message: 'Manglende tilladelse: incoming_invoices.view' }
  }
  const { data: row } = await supabase
    .from('incoming_invoices')
    .select('file_url')
    .eq('id', id)
    .maybeSingle()
  const cls = classifyAttachmentUrl(row?.file_url as string | null)
  if (cls.kind === 'none') return { ok: true, url: null, external: false, message: 'Ingen fil tilknyttet' }
  if (cls.kind === 'external') return { ok: true, url: cls.url, external: true }

  const { getStorageSignedUrlOrNull, SIGNED_URL_TTL } = await import('@/lib/storage/signed-url')
  const signed = await getStorageSignedUrlOrNull(cls.bucket, cls.path, SIGNED_URL_TTL.SHORT)
  if (!signed) return { ok: false, url: null, external: false, message: 'Kunne ikke generere bilags-link' }
  return { ok: true, url: signed, external: false }
}
