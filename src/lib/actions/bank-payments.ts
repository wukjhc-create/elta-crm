'use server'

/**
 * Bank payment server actions for the minimal UI.
 */
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

export async function manualMatchAction(
  bankTxId: string,
  invoiceId: string
): Promise<MatchOutcome> {
  await requireGate('bank.edit')
  const outcome = await manualMatchTransaction(bankTxId, invoiceId)
  revalidatePath('/dashboard/bank')
  return outcome
}

export async function searchInvoicesForMatchAction(query: string, limit = 20) {
  const { supabase } = await requireGate('bank.view')
  const q = (query || '').trim()
  let req = supabase
    .from('invoices')
    .select('id, invoice_number, final_amount, currency, payment_status, status, due_date')
    .neq('payment_status', 'paid')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (q) req = req.ilike('invoice_number', `%${q}%`)
  const { data } = await req
  return data ?? []
}
