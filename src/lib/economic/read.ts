/**
 * Read-only e-conomic reads for the finance page. Callers must already hold settings.economic and pass the settings
 * they read after that check. Only what the page uses is here; see economicReadPathAllowed.
 */
import { economicGetWithSettings, type ReadyEconomicSettings } from '@/lib/services/economic-client'
import { parseCollection, parseLedgerAccount } from '@/lib/economic/read-model'

const PAGE = 100

export type EconomicProbe = { ok: true; complete: boolean } | { ok: false; reason: 'failed' | 'timeout' }

/** Tells "e-conomic does not answer" apart from "no bank account chosen". No figure is taken from it. */
export async function readAccountingYears(settings: ReadyEconomicSettings): Promise<EconomicProbe> {
  const res = await economicGetWithSettings<unknown>(settings, '/accounting-years', { pagesize: PAGE })
  if (!res.ok) return { ok: false, reason: res.reason }
  const parsed = parseCollection(res.data, PAGE)
  if (!parsed) return { ok: false, reason: 'failed' }
  return { ok: true, complete: parsed.complete }
}

export type BankBalanceRead =
  | { state: 'known'; amount: number; accountName: string | null }
  | { state: 'unknown'; reason: 'failed' | 'timeout' | 'missing_balance' | 'not_balance_sheet' }

/** One configured ledger account. A missing balance is not 0. The account number comes from the settings, not from a user. */
export async function readBankAccountBalance(settings: ReadyEconomicSettings, accountNumber: number): Promise<BankBalanceRead> {
  if (!Number.isSafeInteger(accountNumber) || accountNumber <= 0) return { state: 'unknown', reason: 'failed' }
  const res = await economicGetWithSettings<unknown>(settings, `/accounts/${accountNumber}`)
  if (!res.ok) return { state: 'unknown', reason: res.reason }
  const parsed = parseLedgerAccount(res.data, accountNumber)
  if (parsed.state === 'not_balance_sheet') return { state: 'unknown', reason: 'not_balance_sheet' }
  if (parsed.state === 'unknown') return { state: 'unknown', reason: 'missing_balance' }
  return { state: 'known', amount: parsed.amount, accountName: parsed.accountName }
}
