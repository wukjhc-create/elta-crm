'use server'

/**
 * Bank payment server actions for the minimal UI.
 */
import { escapeLike } from '@/lib/validations/postgrest-filter'
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import type { Permission } from '@/lib/auth/permissions'

/** RBAC (P-009-fund, S2): bankimport/-match markerer fakturaer betalt -> kun bank.edit (admin, bogholderi). */
async function requireGate(permission: Permission) {
  const ctx = await getAuthenticatedClientWithRole()
  ctx.requirePermission(permission)
  return ctx
}
import {
  importBankTransactions,
  parseBankCSV,
  manualMatchTransaction,
  autoMatchTransactions,
  type ImportResult,
  type MatchOutcome,
  type AutoMatchSummary,
} from '@/lib/services/bank-payments'

export interface BankTxListRow {
  id: string
  date: string
  amount: number
  reference_text: string | null
  sender_name: string | null
  match_status: string
  match_confidence: string | null
  matched_invoice_id: string | null
  matched_invoice_number?: string | null
  candidate_invoice_ids: string[] | null
  created_at: string
}

export async function listUnmatchedBankTransactions(limit = 200): Promise<BankTxListRow[]> {
  const { supabase } = await requireGate('bank.view')
  const { data, error } = await supabase
    .from('bank_transactions')
    .select('id, date, amount, reference_text, sender_name, match_status, match_confidence, matched_invoice_id, candidate_invoice_ids, created_at')
    .in('match_status', ['unmatched', 'ambiguous'])
    .order('date', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data ?? []) as BankTxListRow[]
}

export async function importBankCsvAction(csv: string): Promise<ImportResult> {
  await requireGate('bank.edit')
  const rows = parseBankCSV(csv)
  return importBankTransactions(rows)
}

export async function runAutoMatchAction(): Promise<AutoMatchSummary> {
  await requireGate('bank.edit')
  const summary = await autoMatchTransactions()
  revalidatePath('/dashboard/bank')
  return summary
}

/** A-8 (review 2026-10-16): udfaldet meldes på dansk — før lukkede panelet som om alt gik godt, også når fakturaen ikke
 *  kunne modtage betaling (kladde/kreditnota/annulleret) eller et opslag fejlede */
export async function manualMatchAction(
  bankTxId: string,
  invoiceId: string
): Promise<{ ok: boolean; message: string; outcome?: MatchOutcome }> {
  await requireGate('bank.edit')
  let outcome: MatchOutcome
  try {
    outcome = await manualMatchTransaction(bankTxId, invoiceId)
  } catch {
    return { ok: false, message: 'Posten eller fakturaen blev ikke fundet — genindlæs siden' }
  }
  revalidatePath('/dashboard/bank')
  const ok = outcome.status === 'matched' || outcome.status === 'partial' || outcome.status === 'overpayment'
  if (outcome.reason === 'already matched') return { ok: false, message: 'Posten er allerede matchet', outcome }
  // FR-1: betalingen er gemt, men fakturaen kunne ikke opdateres — vis advarslen (ikke "Betaling registreret")
  if (ok && outcome.reason.startsWith('Betalingen er registreret, men')) return { ok: false, message: outcome.reason, outcome }
  if (!ok) {
    const why = outcome.reason === 'not an incoming payment' ? 'posten er ikke en indbetaling'
      : outcome.reason.startsWith('already matched') ? 'posten blev netop matchet af en anden'
      : outcome.reason === 'non-DKK invoice' ? 'fakturaen er ikke i kroner (bankposter kan kun kobles til DKK-fakturaer)'
      : 'fakturaen kan ikke modtage betaling (kun sendte, ikke-annullerede fakturaer)'
    return { ok: false, message: `Ikke matchet — ${why}`, outcome }
  }
  const label = outcome.status === 'partial' ? 'Delbetaling registreret' : outcome.status === 'overpayment' ? 'Overbetaling registreret' : 'Betaling registreret'
  return { ok: true, message: label, outcome }
}

export async function searchInvoicesForMatchAction(query: string, limit = 20) {
  const { supabase } = await requireGate('bank.view')
  const q = (query || '').trim()
  let req = supabase
    .from('invoices')
    .select('id, invoice_number, final_amount, currency, payment_status, status, due_date')
    .neq('payment_status', 'paid')
    // A-8: kun udstedte, ikke-annullerede almindelige fakturaer kan modtage betaling (samme regel som auto-match)
    .eq('status', 'sent').is('voided_at', null).or('invoice_type.is.null,invoice_type.neq.credit')
    .or('currency.is.null,currency.eq.DKK') // FR-7: kun kronefakturaer (som auto-match)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (q) req = req.ilike('invoice_number', `%${escapeLike(q)}%`)
  const { data } = await req
  return data ?? []
}
