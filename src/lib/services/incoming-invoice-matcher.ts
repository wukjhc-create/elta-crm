/**
 * Supplier invoice matcher (Phase 15).
 *
 * - Resolves supplier_id from extracted name + VAT number against the
 *   `suppliers` table (case-insensitive, VAT-first when available).
 * - Detects duplicates: same (supplier_id, invoice_number) OR same
 *   file_hash (DB UNIQUE indexes do the hard work; this surface returns
 *   a friendly outcome for the orchestrator).
 * - Resolves work_order from `workOrderHints` extracted by the parser.
 *
 * Pure read; never mutates anything.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface MatchResult {
  supplierId: string | null
  workOrderId: string | null
  duplicateOfId: string | null
  confidence: number
  reasons: string[]
}

export interface MatchInput {
  supplierName: string | null
  supplierVatNumber: string | null
  invoiceNumber: string | null
  workOrderHints: string[]
  fileHash: string | null
}

export async function matchSupplierInvoice(input: MatchInput): Promise<MatchResult> {
  const supabase = createAdminClient()
  const reasons: string[] = []
  let supplierId: string | null = null
  let confidence = 0

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
      confidence += 0.5
      reasons.push(`vat_match:${vat}`)
    }
  }
  if (!supplierId && input.supplierName) {
    const name = input.supplierName.trim()
    // Try exact code (AO/LM) hit if the name contains the code as a token.
    const { data: byCode } = await supabase
      .from('suppliers')
      .select('id, code, name')
      .or(`code.ilike.${escapeIlike(name)},name.ilike.%${escapeIlike(name)}%`)
      .limit(5)
    if (byCode && byCode.length === 1) {
      supplierId = byCode[0].id
      confidence += 0.3
      reasons.push(`name_match:${byCode[0].name}`)
    } else if (byCode && byCode.length > 1) {
      // ambiguous — pick the strictest contains-equality if any.
      const exact = byCode.find((r) => r.name?.toLowerCase() === name.toLowerCase())
      if (exact) {
        supplierId = exact.id
        confidence += 0.2
        reasons.push(`name_match_exact:${exact.name}`)
      } else {
        reasons.push(`ambiguous_name:${byCode.length}_candidates`)
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
    if (hashHit) { duplicateOfId = hashHit.id; reasons.push('duplicate_file_hash') }
  }
  if (!duplicateOfId && supplierId && input.invoiceNumber) {
    const { data: refHit } = await supabase
      .from('incoming_invoices')
      .select('id')
      .eq('supplier_id', supplierId)
      .eq('invoice_number', input.invoiceNumber)
      .limit(1)
      .maybeSingle()
    if (refHit) { duplicateOfId = refHit.id; reasons.push('duplicate_supplier_invoice_number') }
  }

  // ---- 3. work order match ----
  let workOrderId: string | null = null
  if (input.workOrderHints.length > 0) {
    // Try matching against service_cases.case_number first (Elta uses these
    // as the "Sag:" reference) — then fall back to work_orders.title contains.
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
          confidence += 0.2
          reasons.push(`wo_via_case:${hint}`)
          break
        }
      }
    }
    if (!workOrderId) {
      // Fallback: title ilike any hint.
      for (const hint of input.workOrderHints) {
        const { data: wo } = await supabase
          .from('work_orders')
          .select('id')
          .ilike('title', `%${escapeIlike(hint)}%`)
          .limit(2)
        if (wo && wo.length === 1) {
          workOrderId = wo[0].id
          confidence += 0.15
          reasons.push(`wo_title_match:${hint}`)
          break
        }
      }
    }
  }

  return {
    supplierId,
    workOrderId,
    duplicateOfId,
    confidence: Math.min(1, round3(confidence)),
    reasons,
  }
}

function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&')
}

function round3(n: number): number { return Math.round(n * 1000) / 1000 }
