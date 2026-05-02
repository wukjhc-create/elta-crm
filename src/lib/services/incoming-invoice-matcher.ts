/**
 * Supplier invoice matcher (Phase 15.1).
 *
 *   - Supplier resolution (VAT-first → name)
 *   - Supplier-order-ref → work_order via work_orders.title containing
 *     the AO/LM order id
 *   - Customer/delivery address fallback → service_cases (postal+street
 *     match) → most recent work_order on that case
 *   - Duplicate detection (file_hash, supplier+invoice_number)
 *   - Returns a structured `MatchBreakdown` so the UI/audit can show
 *     "why was this matched / not matched" without re-running.
 *
 * Pure read; never mutates anything.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { MatchBreakdown } from '@/types/incoming-invoices.types'

export interface MatchResult {
  supplierId: string | null
  workOrderId: string | null
  duplicateOfId: string | null
  confidence: number
  breakdown: MatchBreakdown
}

export interface MatchInput {
  supplierName: string | null
  supplierVatNumber: string | null
  invoiceNumber: string | null
  workOrderHints: string[]
  supplierOrderRefs: string[]
  deliveryAddressHints: string[]
  fileHash: string | null
}

const WEIGHTS = {
  vat_match: 0.45,
  supplier_name_match: 0.25,
  supplier_order_ref_match: 0.30,
  work_order_via_case: 0.30,
  work_order_via_title: 0.20,
  customer_address_match: 0.15,
}

export async function matchSupplierInvoice(input: MatchInput): Promise<MatchResult> {
  const supabase = createAdminClient()
  const breakdown: MatchBreakdown = {
    vat_match: 0,
    supplier_name_match: 0,
    supplier_order_ref_match: 0,
    work_order_via_case: 0,
    work_order_via_title: 0,
    customer_address_match: 0,
    duplicate_detected: 0,
    total: 0,
    reasons: [],
  }

  let supplierId: string | null = null
  let workOrderId: string | null = null

  // ---- 1. supplier resolution ----
  if (input.supplierVatNumber) {
    const vat = input.supplierVatNumber.replace(/\s/g, '').toUpperCase()
    const { data } = await supabase
      .from('suppliers')
      .select('id, code, name, vat_number')
      .ilike('vat_number', vat)
      .limit(2)
    if (data && data.length === 1) {
      supplierId = data[0].id
      breakdown.vat_match = WEIGHTS.vat_match
      breakdown.reasons.push(`vat_match:${vat}`)
    }
  }
  if (!supplierId && input.supplierName) {
    const name = input.supplierName.trim()
    const { data: byCode } = await supabase
      .from('suppliers')
      .select('id, code, name')
      .or(`code.ilike.${escapeIlike(name)},name.ilike.%${escapeIlike(name)}%`)
      .limit(5)
    if (byCode && byCode.length === 1) {
      supplierId = byCode[0].id
      breakdown.supplier_name_match = WEIGHTS.supplier_name_match
      breakdown.reasons.push(`name_match:${byCode[0].name}`)
    } else if (byCode && byCode.length > 1) {
      const exact = byCode.find((r) => r.name?.toLowerCase() === name.toLowerCase())
      if (exact) {
        supplierId = exact.id
        breakdown.supplier_name_match = WEIGHTS.supplier_name_match * 0.7
        breakdown.reasons.push(`name_match_exact:${exact.name}`)
      } else {
        breakdown.reasons.push(`ambiguous_name:${byCode.length}_candidates`)
      }
    }
  }

  // ---- 2. duplicate detection ----
  let duplicateOfId: string | null = null
  if (input.fileHash) {
    const { data: hashHit } = await supabase
      .from('incoming_invoices')
      .select('id')
      .eq('file_hash', input.fileHash)
      .limit(1)
      .maybeSingle()
    if (hashHit) {
      duplicateOfId = hashHit.id
      breakdown.duplicate_detected = 1
      breakdown.reasons.push('duplicate_file_hash')
    }
  }
  if (!duplicateOfId && supplierId && input.invoiceNumber) {
    const { data: refHit } = await supabase
      .from('incoming_invoices')
      .select('id')
      .eq('supplier_id', supplierId)
      .eq('invoice_number', input.invoiceNumber)
      .limit(1)
      .maybeSingle()
    if (refHit) {
      duplicateOfId = refHit.id
      breakdown.duplicate_detected = 1
      breakdown.reasons.push('duplicate_supplier_invoice_number')
    }
  }

  // ---- 3. work order via supplier-side order reference ----
  if (input.supplierOrderRefs.length > 0) {
    for (const ref of input.supplierOrderRefs) {
      const { data: wo } = await supabase
        .from('work_orders')
        .select('id, title')
        .ilike('title', `%${escapeIlike(ref)}%`)
        .limit(2)
      if (wo && wo.length === 1) {
        workOrderId = wo[0].id
        breakdown.supplier_order_ref_match = WEIGHTS.supplier_order_ref_match
        breakdown.reasons.push(`supplier_order_ref:${ref}`)
        break
      }
    }
  }

  // ---- 4. work order via Elta-side hint (case_number / title) ----
  if (!workOrderId && input.workOrderHints.length > 0) {
    for (const hint of input.workOrderHints) {
      const { data: caseRow } = await supabase
        .from('service_cases')
        .select('id')
        .eq('case_number', hint)
        .maybeSingle()
      if (caseRow) {
        const { data: wo } = await supabase
          .from('work_orders')
          .select('id')
          .eq('case_id', caseRow.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (wo) {
          workOrderId = wo.id
          breakdown.work_order_via_case = WEIGHTS.work_order_via_case
          breakdown.reasons.push(`wo_via_case:${hint}`)
          break
        }
      }
    }
    if (!workOrderId) {
      for (const hint of input.workOrderHints) {
        const { data: wo } = await supabase
          .from('work_orders')
          .select('id')
          .ilike('title', `%${escapeIlike(hint)}%`)
          .limit(2)
        if (wo && wo.length === 1) {
          workOrderId = wo[0].id
          breakdown.work_order_via_title = WEIGHTS.work_order_via_title
          breakdown.reasons.push(`wo_title_match:${hint}`)
          break
        }
      }
    }
  }

  // ---- 5. customer / delivery address fallback ----
  if (!workOrderId && input.deliveryAddressHints.length > 0) {
    const candidate = pickAddressCandidate(input.deliveryAddressHints)
    if (candidate) {
      const { zip, streetToken } = candidate
      const { data: cases } = await supabase
        .from('service_cases')
        .select('id, address, postal_code')
        .eq('postal_code', zip)
        .ilike('address', `%${escapeIlike(streetToken)}%`)
        .limit(3)
      if (cases && cases.length === 1) {
        const caseId = cases[0].id
        const { data: wo } = await supabase
          .from('work_orders')
          .select('id')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (wo) {
          workOrderId = wo.id
          breakdown.customer_address_match = WEIGHTS.customer_address_match
          breakdown.reasons.push(`address_match:${zip}/${streetToken}`)
        }
      }
    }
  }

  const total = Math.min(
    1,
    breakdown.vat_match +
      breakdown.supplier_name_match +
      breakdown.supplier_order_ref_match +
      breakdown.work_order_via_case +
      breakdown.work_order_via_title +
      breakdown.customer_address_match
  )
  breakdown.total = round3(total)

  return {
    supplierId,
    workOrderId,
    duplicateOfId,
    confidence: breakdown.total,
    breakdown,
  }
}

// =====================================================
// helpers
// =====================================================

function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&')
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function pickAddressCandidate(hints: string[]): { zip: string; streetToken: string } | null {
  for (const raw of hints) {
    const m = raw.match(/^(.+?\s\d{1,4}[A-Z]?)(?:,\s*[^\d]*)?\s+(\d{4})\s+[A-ZÆØÅa-zæøå]/)
    if (!m) continue
    const street = m[1].trim()
    const zip = m[2]
    const streetToken = street.split(/[\s,]+/)[0]
    if (streetToken && streetToken.length >= 4) return { zip, streetToken }
  }
  return null
}
