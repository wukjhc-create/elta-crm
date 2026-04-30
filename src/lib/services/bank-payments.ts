/**
 * Bank payments — import + auto-match (Phase 5.3).
 *
 * Pipeline:
 *   1. Bank export (CSV) → parseBankCSV → ParsedBankRow[]
 *   2. importBankTransactions(rows) — upsert by (date, amount, ref) so the
 *      same export can be re-imported without duplicating.
 *   3. autoMatchTransactions() — scans every unmatched row, applies the
 *      priority rules (reference → amount+sender → ambiguous), and calls
 *      registerPayment() on confident matches.
 *
 * Safety invariants enforced everywhere:
 *   - never overwrite matched_invoice_id once set (UPDATE ... WHERE matched_invoice_id IS NULL)
 *   - never call registerPayment on an already-paid invoice (registerPayment is idempotent)
 *   - ambiguous candidates are recorded but never auto-paid
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { parseCSVLine, parseDanishNumber } from '@/lib/services/import-engine'
import { registerPayment } from '@/lib/services/invoices'
import type {
  BankMatchConfidence,
  BankMatchStatus,
  BankTransactionRow,
  ParsedBankRow,
} from '@/types/bank.types'
import type { InvoiceRow } from '@/types/invoice.types'

// =====================================================
// 1. CSV parser
// =====================================================

/**
 * Parse a bank export CSV. Required columns (case-insensitive):
 *   date, amount, reference_text, sender_name
 *
 * Aliases recognised:
 *   date          ← dato | bogføringsdato | posting_date
 *   amount        ← beløb | belob | kr
 *   reference_text ← reference | tekst | besked | description
 *   sender_name   ← afsender | modparti | counterparty | name
 */
export function parseBankCSV(content: string): ParsedBankRow[] {
  const text = content.replace(/^﻿/, '') // strip BOM
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const delimiter = detectDelimiter(lines[0])
  const headers = parseCSVLine(lines[0], delimiter).map((h) => h.toLowerCase().trim())

  const idx = {
    date: pickIndex(headers, ['date', 'dato', 'bogføringsdato', 'bogforingsdato', 'posting_date']),
    amount: pickIndex(headers, ['amount', 'beløb', 'belob', 'kr', 'value']),
    reference_text: pickIndex(headers, [
      'reference_text',
      'reference',
      'tekst',
      'besked',
      'description',
      'note',
    ]),
    sender_name: pickIndex(headers, [
      'sender_name',
      'afsender',
      'modparti',
      'counterparty',
      'name',
      'navn',
    ]),
  }

  if (idx.date < 0 || idx.amount < 0) return []

  const out: ParsedBankRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i], delimiter)
    const dateRaw = cells[idx.date]
    const amountRaw = cells[idx.amount]
    if (!dateRaw || !amountRaw) continue

    const date = normalizeDate(dateRaw)
    const amount = parseDanishNumber(amountRaw)
    if (!date || amount === null) continue

    out.push({
      date,
      amount,
      reference_text: cells[idx.reference_text]?.trim() || null,
      sender_name: cells[idx.sender_name]?.trim() || null,
    })
  }
  return out
}

function detectDelimiter(headerLine: string): string {
  // Most Danish bank exports are semicolon-delimited; comma is fallback.
  return headerLine.includes(';') ? ';' : ','
}

function pickIndex(headers: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = headers.indexOf(a)
    if (i >= 0) return i
  }
  return -1
}

function normalizeDate(raw: string): string | null {
  const t = raw.trim()
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  // Danish dd-mm-yyyy or dd/mm/yyyy or dd.mm.yyyy
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (m) {
    const [, d, mo, y] = m
    const yy = y.length === 2 ? `20${y}` : y
    return `${yy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

// =====================================================
// 2. Import (dedup-aware upsert)
// =====================================================

export interface ImportResult {
  inserted: number
  duplicates: number
  invalid: number
}

export async function importBankTransactions(rows: ParsedBankRow[]): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, duplicates: 0, invalid: 0 }
  if (!rows.length) return result

  const supabase = createAdminClient()
  // Use a manual existence check then insert; UNIQUE index also guards
  // against races. Batch-friendly enough for typical bank exports
  // (≤ a few hundred rows per file).
  for (const r of rows) {
    if (!r.date || !Number.isFinite(r.amount)) {
      result.invalid++
      continue
    }
    const { data: existing } = await supabase
      .from('bank_transactions')
      .select('id')
      .eq('date', r.date)
      .eq('amount', r.amount)
      .eq('reference_text', r.reference_text ?? '')
      .maybeSingle()

    if (existing) {
      result.duplicates++
      continue
    }

    const { error } = await supabase.from('bank_transactions').insert({
      date: r.date,
      amount: r.amount,
      reference_text: r.reference_text,
      sender_name: r.sender_name,
    })
    if (error) {
      // 23505 = unique constraint hit on race. Treat as duplicate.
      if ((error as { code?: string }).code === '23505') {
        result.duplicates++
      } else {
        logger.error('importBankTransactions insert failed', { error })
        result.invalid++
      }
      continue
    }
    result.inserted++
  }

  console.log(
    'BANK IMPORT:',
    `inserted=${result.inserted}`,
    `duplicates=${result.duplicates}`,
    `invalid=${result.invalid}`
  )
  try {
    const { logHealth } = await import('@/lib/services/system-health')
    const status = result.invalid > 0 ? 'warning' : 'ok'
    await logHealth('bank', status, `import: ${result.inserted} new, ${result.duplicates} dup, ${result.invalid} invalid`, { ...result })
  } catch { /* never crash */ }
  return result
}

// =====================================================
// 3. Auto-match
// =====================================================

const INVOICE_NUMBER_RE = /F-\d{4}-\d{4}/g

export interface MatchOutcome {
  bankTxId: string
  status: BankMatchStatus
  invoiceId: string | null
  amount: number
  reason: string
}

export interface AutoMatchSummary {
  scanned: number
  matched: number
  partial: number
  overpayment: number
  ambiguous: number
  unmatched: number
  errors: string[]
}

export async function autoMatchTransactions(): Promise<AutoMatchSummary> {
  const supabase = createAdminClient()
  const summary: AutoMatchSummary = {
    scanned: 0,
    matched: 0,
    partial: 0,
    overpayment: 0,
    ambiguous: 0,
    unmatched: 0,
    errors: [],
  }

  const { data: txs, error } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('match_status', 'unmatched')
    .is('matched_invoice_id', null)
    .order('date', { ascending: true })
    .limit(500)

  if (error) {
    logger.error('autoMatchTransactions: fetch failed', { error })
    summary.errors.push(error.message)
    return summary
  }

  for (const raw of txs ?? []) {
    const tx = raw as BankTransactionRow
    summary.scanned++
    try {
      const outcome = await matchOne(tx)
      // skip variable shadowing — only log on terminal outcomes
      switch (outcome.status) {
        case 'matched':
          summary.matched++
          console.log('MATCHED PAYMENT:', outcome.invoiceId, outcome.amount)
          break
        case 'partial':
          summary.partial++
          console.log('PARTIAL PAYMENT:', outcome.invoiceId, outcome.amount)
          break
        case 'overpayment':
          summary.overpayment++
          console.log('OVERPAYMENT:', outcome.invoiceId, outcome.amount)
          break
        case 'ambiguous':
          summary.ambiguous++
          console.log('AMBIGUOUS MATCH:', tx.id)
          break
        case 'unmatched':
        default:
          summary.unmatched++
          console.log('UNMATCHED TRANSACTION:', tx.id)
          break
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('autoMatchTransactions: row failed', { entityId: tx.id, error: err })
      summary.errors.push(`${tx.id}: ${msg}`)
      try {
        const { logHealth } = await import('@/lib/services/system-health')
        await logHealth('bank', 'error', `match row threw: ${msg}`, { bankTxId: tx.id })
      } catch { /* never crash */ }
    }
  }

  try {
    const { logHealth } = await import('@/lib/services/system-health')
    const status = summary.errors.length > 0 ? 'warning' : 'ok'
    await logHealth('bank', status, `auto-match: scanned=${summary.scanned} matched=${summary.matched} partial=${summary.partial} ambig=${summary.ambiguous} unmatched=${summary.unmatched}`, summary as unknown as Record<string, unknown>)
  } catch { /* never crash */ }

  return summary
}

// -----------------------------------------------------
// Match one bank transaction
// -----------------------------------------------------

async function matchOne(tx: BankTransactionRow): Promise<MatchOutcome> {
  const supabase = createAdminClient()

  // === Strategy A — reference match =================================
  const referenceMatches = await findByReference(tx.reference_text)
  if (referenceMatches.length === 1) {
    return await applyMatch(tx, referenceMatches[0], 'reference')
  }
  if (referenceMatches.length > 1) {
    await markAmbiguous(tx, referenceMatches.map((i) => i.id))
    return { bankTxId: tx.id, status: 'ambiguous', invoiceId: null, amount: tx.amount, reason: 'multiple reference candidates' }
  }

  // === Strategies B + C — amount-based ==============================
  const amountMatches = await findByAmount(tx.amount)
  if (amountMatches.length === 0) {
    await markUnmatched(tx)
    return { bankTxId: tx.id, status: 'unmatched', invoiceId: null, amount: tx.amount, reason: 'no candidates' }
  }

  if (amountMatches.length === 1) {
    const senderOk = await senderMatchesInvoiceCustomer(supabase, tx.sender_name, amountMatches[0])
    if (senderOk) {
      return await applyMatch(tx, amountMatches[0], 'amount+sender')
    }
    await markUnmatched(tx)
    return { bankTxId: tx.id, status: 'unmatched', invoiceId: null, amount: tx.amount, reason: 'amount-only, no sender match' }
  }

  // Multiple amount candidates → narrow by sender similarity.
  const senderHits: InvoiceRow[] = []
  for (const inv of amountMatches) {
    if (await senderMatchesInvoiceCustomer(supabase, tx.sender_name, inv)) senderHits.push(inv)
  }
  if (senderHits.length === 1) {
    return await applyMatch(tx, senderHits[0], 'amount+sender')
  }

  await markAmbiguous(tx, amountMatches.map((i) => i.id))
  return { bankTxId: tx.id, status: 'ambiguous', invoiceId: null, amount: tx.amount, reason: 'multiple amount candidates' }
}

// -----------------------------------------------------
// Candidate finders
// -----------------------------------------------------

async function findByReference(refRaw: string | null): Promise<InvoiceRow[]> {
  if (!refRaw) return []
  const ref = refRaw.trim()
  if (!ref) return []

  const supabase = createAdminClient()

  // 1. Look for invoice numbers explicitly mentioned in the text.
  const numberMatches = ref.match(INVOICE_NUMBER_RE)
  if (numberMatches && numberMatches.length > 0) {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .in('invoice_number', Array.from(new Set(numberMatches)))
      .neq('payment_status', 'paid')
    if (data && data.length > 0) return data as InvoiceRow[]
  }

  // 2. Look for payment_reference values found in the text. We can't ILIKE
  //    the other way around in Postgres directly via PostgREST without an
  //    RPC; we pull a candidate set whose payment_reference is non-null
  //    AND not paid AND short enough that we can scan in JS.
  const { data: refCandidates } = await supabase
    .from('invoices')
    .select('*')
    .not('payment_reference', 'is', null)
    .neq('payment_status', 'paid')
    .limit(2000)

  if (!refCandidates) return []
  const lower = ref.toLowerCase()
  const hits = (refCandidates as InvoiceRow[]).filter((inv) => {
    const r = (inv.payment_reference || '').trim()
    return r.length >= 4 && lower.includes(r.toLowerCase())
  })
  return hits
}

async function findByAmount(amount: number): Promise<InvoiceRow[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('invoices')
    .select('*')
    .eq('final_amount', amount)
    .neq('payment_status', 'paid')
    .in('status', ['sent', 'draft'])
    .limit(50)
  return (data ?? []) as InvoiceRow[]
}

async function senderMatchesInvoiceCustomer(
  supabase: ReturnType<typeof createAdminClient>,
  senderName: string | null,
  invoice: InvoiceRow
): Promise<boolean> {
  if (!senderName || !invoice.customer_id) return false
  const { data: cust } = await supabase
    .from('customers')
    .select('company_name, contact_person')
    .eq('id', invoice.customer_id)
    .maybeSingle()
  if (!cust) return false
  const a = normalizeName(senderName)
  if (!a) return false
  const candidates = [cust.company_name, cust.contact_person]
    .map((n) => normalizeName(n))
    .filter((n): n is string => Boolean(n))
  return candidates.some((n) => nameSimilar(a, n))
}

function normalizeName(s: string | null | undefined): string | null {
  if (!s) return null
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(aps|a\/s|i\/s|holding|ivs)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameSimilar(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const ta = new Set(a.split(' ').filter((t) => t.length >= 3))
  const tb = new Set(b.split(' ').filter((t) => t.length >= 3))
  if (ta.size === 0 || tb.size === 0) return false
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  // Require ≥2 shared tokens OR ≥60% overlap of the smaller side.
  const minSize = Math.min(ta.size, tb.size)
  return common >= 2 || common / minSize >= 0.6
}

// -----------------------------------------------------
// Apply / mark helpers
// -----------------------------------------------------

async function applyMatch(
  tx: BankTransactionRow,
  invoice: InvoiceRow,
  confidence: Exclude<BankMatchConfidence, null>
): Promise<MatchOutcome> {
  const supabase = createAdminClient()

  // Race-safe: only bind if not already bound.
  const claim = await supabase
    .from('bank_transactions')
    .update({
      matched_invoice_id: invoice.id,
      match_status: 'matched',          // upgraded below if partial / overpayment
      match_confidence: confidence,
      matched_at: new Date().toISOString(),
    })
    .eq('id', tx.id)
    .is('matched_invoice_id', null)
    .select('id')
    .maybeSingle()

  if (!claim.data) {
    return { bankTxId: tx.id, status: 'unmatched', invoiceId: null, amount: tx.amount, reason: 'already matched (race)' }
  }

  // registerPayment is idempotent on already-paid invoices.
  const payment = await registerPayment(invoice.id, tx.amount, tx.reference_text || tx.sender_name || undefined)

  let finalStatus: BankMatchStatus = 'matched'
  if (payment.fullyPaid) {
    if (tx.amount > Number(invoice.final_amount)) finalStatus = 'overpayment'
    else finalStatus = 'matched'
  } else if (payment.paymentStatus === 'partial') {
    finalStatus = 'partial'
  }

  await supabase
    .from('bank_transactions')
    .update({ match_status: finalStatus })
    .eq('id', tx.id)

  return {
    bankTxId: tx.id,
    status: finalStatus,
    invoiceId: invoice.id,
    amount: tx.amount,
    reason: confidence,
  }
}

async function markAmbiguous(tx: BankTransactionRow, candidates: string[]): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('bank_transactions')
    .update({ match_status: 'ambiguous', candidate_invoice_ids: candidates })
    .eq('id', tx.id)
    .is('matched_invoice_id', null) // never overwrite a real match
}

async function markUnmatched(tx: BankTransactionRow): Promise<void> {
  // Already 'unmatched' by default; keep the row intact, but this gives
  // us a single place to attach a future "scanned_at" column without
  // touching matchOne().
  void tx
}

// =====================================================
// 4. Manual match (for the minimal UI)
// =====================================================

export async function manualMatchTransaction(
  bankTxId: string,
  invoiceId: string
): Promise<MatchOutcome> {
  const supabase = createAdminClient()

  const { data: tx } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('id', bankTxId)
    .maybeSingle()
  if (!tx) throw new Error(`bank_transaction ${bankTxId} not found`)
  if (tx.matched_invoice_id) {
    return { bankTxId, status: tx.match_status as BankMatchStatus, invoiceId: tx.matched_invoice_id, amount: Number(tx.amount), reason: 'already matched' }
  }

  const { data: inv } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!inv) throw new Error(`invoice ${invoiceId} not found`)

  return applyMatch(tx as BankTransactionRow, inv as InvoiceRow, 'manual')
}
