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

import { pgQuote } from '@/lib/validations/postgrest-filter'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MatchBreakdown } from '@/types/incoming-invoices.types'
import { normalizeVatNumber } from '@/lib/invoice-control/vat'
import { senderDomain, suppliersForDomain } from '@/lib/invoice-control/sender-domain'

export interface MatchResult {
  supplierId: string | null
  workOrderId: string | null
  /**
   * Sprint 5E-1: canonical sag link. May be set even when workOrderId
   * is null (case_number direct match without a selectable WO).
   * When workOrderId IS set, caseId mirrors work_orders.case_id.
   */
  caseId: string | null
  duplicateOfId: string | null
  /**
   * L-10 (00221): samme leverandør + fakturanummer som en AFVIST faktura — typisk en rettet, gensendt faktura.
   * Ikke en dublet (annulleres ikke), men kræver manuel kontrol.
   */
  sameNumberAsRejectedId: string | null
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
  /** P3 #19: fakturaen der matches — udelukkes fra dublet-opslag (ellers fandt den altid sig selv
   * paa file_hash, og tjekket paa leverandoer+fakturanummer blev aldrig koert). */
  excludeInvoiceId?: string | null
  /** Leverandoer kendt fra en struktureret kilde (API-import). Vinder over CVR/navn-gaet. */
  knownSupplierId?: string | null
  /** N66: mail-fakturaens afsender — domaenet matches mod leverandoerens website/kontakt-e-mail (sidste udvej). */
  senderEmail?: string | null
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
  let caseId: string | null = null

  // ---- 1. supplier resolution ----
  // Struktureret kilde (API) er mere paalidelig end regex-udtrukket CVR/navn.
  if (input.knownSupplierId) {
    supplierId = input.knownSupplierId
    breakdown.vat_match = WEIGHTS.vat_match
    breakdown.reasons.push('structured_supplier')
  }
  if (!supplierId && input.supplierVatNumber) {
    // IC10: suppliers.vat_number (00167) er normaliseret af trigger; samme regel her. Praecis ét hit kraeves —
    // flere leverandoerer med samme CVR = tvetydigt, intet gaet (navne-match kan stadig afgoere det).
    const vat = normalizeVatNumber(input.supplierVatNumber)
    const { data, error: vatErr } = vat
      ? await supabase.from('suppliers').select('id, code, name').eq('vat_number', vat).limit(2)
      : { data: null, error: null }
    if (!vatErr && data && data.length === 1) {
      supplierId = data[0].id
      breakdown.vat_match = WEIGHTS.vat_match
      breakdown.reasons.push(`vat_match:${vat}`)
    } else if (!vatErr && data && data.length > 1) {
      breakdown.reasons.push(`ambiguous_vat:${vat}`)
    }
  }
  if (!supplierId && input.supplierName) {
    const name = input.supplierName.trim()
    const { data: byCode } = await supabase
      .from('suppliers')
      .select('id, code, name')
      .or(`code.ilike.${pgQuote(escapeIlike(name))},name.ilike.${pgQuote(`%${escapeIlike(name)}%`)}`)
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
  // N66: afsenderdomaene (fx faktura@sieg.dk) → leverandoeren med det website/den kontakt-e-mail. Kun praecis ét hit;
  // gratis-mail er aldrig et signal. Samme vaegt som navne-match (svagere end CVR).
  const domain = !supplierId ? senderDomain(input.senderEmail) : null
  if (domain) {
    const like = `%${escapeIlike(domain.split('.').slice(-2).join('.'))}%`
    const { data: cands } = await supabase
      .from('suppliers')
      .select('id, name, website, contact_email')
      .or(`website.ilike.${pgQuote(like)},contact_email.ilike.${pgQuote(like)}`)
      .limit(20)
    const hits = suppliersForDomain(domain, (cands ?? []) as Array<{ id: string; name: string; website: string | null; contact_email: string | null }>)
    if (hits.length === 1) {
      supplierId = hits[0].id
      breakdown.supplier_name_match = WEIGHTS.supplier_name_match
      breakdown.reasons.push(`sender_domain_match:${domain}`)
    } else if (hits.length > 1) {
      breakdown.reasons.push(`ambiguous_sender_domain:${domain}`)
    }
  }

  // ---- 2. duplicate detection ----
  let duplicateOfId: string | null = null
  if (input.fileHash) {
    const { data: hashHit } = await supabase
      .from('incoming_invoices')
      .select('id')
      .eq('file_hash', input.fileHash)
      .neq('id', input.excludeInvoiceId ?? '00000000-0000-0000-0000-000000000000')
      .limit(1)
      .maybeSingle()
    if (hashHit) {
      duplicateOfId = hashHit.id
      breakdown.duplicate_detected = 1
      breakdown.reasons.push('duplicate_file_hash')
    }
  }
  let sameNumberAsRejectedId: string | null = null
  if (!duplicateOfId && supplierId && input.invoiceNumber) {
    // L-10 (00221): afviste/annullerede fakturaer optager ikke nummeret — en gensendt, rettet faktura er ikke en dublet
    const { data: refHits } = await supabase
      .from('incoming_invoices')
      .select('id, status')
      .eq('supplier_id', supplierId)
      .eq('invoice_number', input.invoiceNumber)
      .neq('id', input.excludeInvoiceId ?? '00000000-0000-0000-0000-000000000000')
      .limit(20)
    const hits = (refHits ?? []) as Array<{ id: string; status: string }>
    const active = hits.find((h) => h.status !== 'rejected' && h.status !== 'cancelled')
    if (active) {
      duplicateOfId = active.id
      breakdown.duplicate_detected = 1
      breakdown.reasons.push('duplicate_supplier_invoice_number')
    } else {
      // samme nr. som en afvist ELLER annulleret (Henrik 2026-10-15) → manuel kontrol, ikke stille godkendelse
      const rejected = hits.find((h) => h.status === 'rejected') ?? hits.find((h) => h.status === 'cancelled')
      if (rejected) {
        sameNumberAsRejectedId = rejected.id
        breakdown.reasons.push('same_number_as_rejected')
      }
    }
  }

  // ---- 3. work order via supplier-side order reference ----
  if (input.supplierOrderRefs.length > 0) {
    for (const ref of input.supplierOrderRefs) {
      const { data: wo } = await supabase
        .from('work_orders')
        .select('id, title, case_id')
        .ilike('title', `%${escapeIlike(ref)}%`)
        .limit(2)
      if (wo && wo.length === 1) {
        workOrderId = wo[0].id
        if (wo[0].case_id) caseId = wo[0].case_id as string
        breakdown.supplier_order_ref_match = WEIGHTS.supplier_order_ref_match
        breakdown.reasons.push(`supplier_order_ref:${ref}`)
        break
      }
    }
  }

  // ---- 4. case + work order via Elta-side hint (case_number / title) ----
  // Sprint 5E-1: case_number can match a sag even without a selectable
  // WO. We always set caseId when a case_number resolves; we only set
  // workOrderId when at least one WO exists for that case.
  if (!caseId && input.workOrderHints.length > 0) {
    for (const hint of input.workOrderHints) {
      const { data: caseRow } = await supabase
        .from('service_cases')
        .select('id')
        .eq('case_number', hint)
        .maybeSingle()
      if (caseRow) {
        caseId = caseRow.id as string
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
        } else {
          // Case resolved directly but no WO yet — count as half-credit
          // on the same signal so the operator knows we found the sag.
          breakdown.work_order_via_case = WEIGHTS.work_order_via_case * 0.6
          breakdown.reasons.push(`case_only:${hint}`)
        }
        break
      }
    }
    if (!workOrderId) {
      for (const hint of input.workOrderHints) {
        const { data: wo } = await supabase
          .from('work_orders')
          .select('id, case_id')
          .ilike('title', `%${escapeIlike(hint)}%`)
          .limit(2)
        // LF-7 (indkøbs-review 2026-10-16): er sagen allerede fundet, accepteres kun en arbejdsordre på SAMME sag (før
        // kunne titelsøgningen sætte en arbejdsordre fra en anden sag)
        if (wo && wo.length === 1 && (!caseId || wo[0].case_id === caseId)) {
          workOrderId = wo[0].id
          if (wo[0].case_id && !caseId) caseId = wo[0].case_id as string
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
      // LF-7: adresse-fallbacken må ikke parre en arbejdsordre fra en ANDEN sag end den allerede fundne
      if (cases && cases.length === 1 && (!caseId || cases[0].id === caseId)) {
        const resolvedCaseId = cases[0].id as string
        if (!caseId) caseId = resolvedCaseId
        const { data: wo } = await supabase
          .from('work_orders')
          .select('id')
          .eq('case_id', resolvedCaseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (wo) {
          workOrderId = wo.id
          breakdown.customer_address_match = WEIGHTS.customer_address_match
          breakdown.reasons.push(`address_match:${zip}/${streetToken}`)
        } else {
          // Address resolved a sag but no WO — still useful signal.
          breakdown.customer_address_match = WEIGHTS.customer_address_match * 0.6
          breakdown.reasons.push(`address_match_case_only:${zip}/${streetToken}`)
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
    caseId,
    duplicateOfId,
    sameNumberAsRejectedId,
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

/** Eksporteret til unit-test (LF-8) */
export function pickAddressCandidate(hints: string[]): { zip: string; streetToken: string } | null {
  for (const raw of hints) {
    // LF-8: etage/dør efter komma ("12, 2. th") må indeholde cifre
    const m = raw.match(/^(.+?\s\d{1,4}[A-Z]?)(?:,[^\n]*?)?\s+(\d{4})\s+[A-ZÆØÅa-zæøå]/)
    if (!m) continue
    // LF-8 (indkøbs-review 2026-10-16): HELE gadenavnet + husnummer (sidste "ord + nummer" i linjen) — før kun første
    // ord, så fx leverandørens brevhoved eller en anden sag på samme vej og postnummer kunne matches
    const streetFull = m[1].trim()
    const sm = streetFull.match(/([A-ZÆØÅa-zæøå][A-ZÆØÅa-zæøå.\-]*\s+\d{1,4}[A-Z]?)$/)
    const zip = m[2]
    const streetToken = (sm ? sm[1] : streetFull).replace(/\s+/g, ' ').trim()
    if (streetToken && streetToken.length >= 6 && /\d/.test(streetToken)) return { zip, streetToken }
  }
  return null
}
