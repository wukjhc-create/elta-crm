/**
 * Read-only e-conomic collections. Callers must already have settings.economic.
 * One page only. complete=false means the page is not the full set.
 */
import { economicGet } from '@/lib/services/economic-client'
import { parseAccountBalance, parseCollection } from '@/lib/economic/read-model'

const PAGE = 100

export interface EconomicPage {
  ok: true
  rows: unknown[]
  complete: boolean
}

export interface EconomicReadFailure {
  ok: false
  reason: 'not_configured' | 'failed' | 'timeout'
  message: string
}

async function onePage(path: string, query?: Record<string, string | number | undefined>): Promise<EconomicPage | EconomicReadFailure> {
  const res = await economicGet<unknown>(path, { pagesize: PAGE, ...query })
  if (!res.ok) return { ok: false, reason: res.reason, message: res.message }
  const parsed = parseCollection(res.data, PAGE)
  if (!parsed) return { ok: false, reason: 'failed', message: 'Svaret kunne ikke læses.' }
  return { ok: true, rows: parsed.rows, complete: parsed.complete }
}

export function readAccountingYears(): Promise<EconomicPage | EconomicReadFailure> {
  return onePage('/accounting-years')
}

export function readAccountsPage(): Promise<EconomicPage | EconomicReadFailure> {
  return onePage('/accounts')
}

export function readCustomersPage(): Promise<EconomicPage | EconomicReadFailure> {
  return onePage('/customers')
}

export function readSuppliersPage(): Promise<EconomicPage | EconomicReadFailure> {
  return onePage('/suppliers')
}

export function readOpenBookedInvoicesPage(): Promise<EconomicPage | EconomicReadFailure> {
  return onePage('/invoices/booked', { filter: 'remainder$ne:0' })
}

export function readBookedEntriesPage(year: string): Promise<EconomicPage | EconomicReadFailure> {
  if (!/^\d{4}$/.test(year)) {
    return Promise.resolve({ ok: false, reason: 'failed', message: 'Regnskabsåret er ikke et årstal.' })
  }
  return onePage(`/accounting-years/${year}/entries`)
}

export type BankBalanceRead =
  | { state: 'known'; amount: number }
  | { state: 'unknown'; reason: 'failed' | 'timeout' | 'missing_balance'; message: string }

/** One configured ledger account. A missing balance is not 0. The account number is chosen by the caller. */
export async function readBankAccountBalance(accountNumber: number): Promise<BankBalanceRead> {
  if (!Number.isInteger(accountNumber) || accountNumber <= 0) {
    return { state: 'unknown', reason: 'failed', message: 'Kontonummeret er ikke gyldigt.' }
  }
  const res = await economicGet<unknown>(`/accounts/${accountNumber}`)
  if (!res.ok) {
    return { state: 'unknown', reason: res.reason === 'timeout' ? 'timeout' : 'failed', message: res.message }
  }
  const parsed = parseAccountBalance(res.data)
  if (parsed.state === 'unknown') return { state: 'unknown', reason: 'missing_balance', message: 'Kontoen havde ingen saldo.' }
  return { state: 'known', amount: parsed.amount }
}
