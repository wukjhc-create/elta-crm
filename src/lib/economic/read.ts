/**
 * Read-only e-conomic reads for the finance page. Callers must already hold settings.economic and pass the settings
 * they read after that check. Only what the page uses is here; see economicReadPathAllowed.
 * Creditor pages stay on this client. The next-page URL is never followed.
 */
import { economicGetWithSettings, type ReadyEconomicSettings } from '@/lib/services/economic-client'
import { parseCollection, parseLedgerAccount } from '@/lib/economic/read-model'
import { aggregateCreditorRemainders, CREDITOR_ENTRY_TYPES, type CreditorRead } from '@/lib/economic/supplier-remainder'

const PAGE = 100
/** Documented collection maximum. A full page is not treated as the end of the set. */
export const CREDITOR_ENTRY_PAGE = 1000
/** Pages walked per entry type per year. Hitting the cap before the set ends is unknown, not a partial sum. */
export const CREDITOR_MAX_PAGES = 20
const MAX_YEAR_PAGES = 5

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

type PageBatch = { state: 'rows'; rows: unknown[] } | { state: 'error' } | { state: 'unknown' }

function reportedResults(data: unknown): number | 'missing' | 'bad' {
  if (!data || typeof data !== 'object' || !('pagination' in data)) return 'missing'
  const pagination = (data as { pagination?: unknown }).pagination
  if (!pagination || typeof pagination !== 'object' || !('results' in pagination)) return 'missing'
  const results = (pagination as { results?: unknown }).results
  if (typeof results === 'number' && Number.isSafeInteger(results) && results >= 0) return results
  return 'bad'
}

/**
 * Walks skippages on one allowlisted path. A missing collection, a full page, a page cap, or a results count that
 * does not match the rows is unknown. HTTP and timeout failures are errors. Neither becomes an empty list.
 */
async function readPages(
  settings: ReadyEconomicSettings,
  path: string,
  pagesize: number,
  maxPages: number,
  filter?: string,
): Promise<PageBatch> {
  const rows: unknown[] = []
  let reported: number | 'missing' = 'missing'
  for (let page = 0; page < maxPages; page++) {
    const res = await economicGetWithSettings<unknown>(settings, path, {
      pagesize,
      skippages: page,
      filter,
    })
    if (!res.ok) return { state: 'error' }
    const parsed = parseCollection(res.data, pagesize)
    if (!parsed) return { state: 'unknown' }
    const results = reportedResults(res.data)
    if (results === 'bad') return { state: 'unknown' }
    if (results !== 'missing') {
      if (reported !== 'missing' && reported !== results) return { state: 'unknown' }
      reported = results
    }
    rows.push(...parsed.rows)
    if (!parsed.complete) continue
    if (reported !== 'missing' && reported !== rows.length) return { state: 'unknown' }
    return { state: 'rows', rows }
  }
  return { state: 'unknown' }
}

function accountingYear(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null
  const year = (row as { year?: unknown }).year
  if (typeof year === 'string' && /^[0-9]{4}$/.test(year)) return year
  if (typeof year === 'number' && Number.isSafeInteger(year) && year >= 1000 && year <= 9999) return String(year)
  return null
}

/**
 * Open creditor remainders for every accounting year. Uses remainder in the entry currency.
 * A year that is not four digits cannot be requested on the allowlist, so the whole read is unknown.
 */
export async function readOpenSupplierRemainders(settings: ReadyEconomicSettings, today: string): Promise<CreditorRead> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { state: 'unknown' }
    const years = await readPages(settings, '/accounting-years', PAGE, MAX_YEAR_PAGES)
    if (years.state !== 'rows') return { state: years.state }
    const yearNames: string[] = []
    const seenYears = new Set<string>()
    for (const row of years.rows) {
      const year = accountingYear(row)
      if (!year || seenYears.has(year)) return { state: 'unknown' }
      seenYears.add(year)
      yearNames.push(year)
    }
    const wrapped: Array<{ year: string; row: unknown }> = []
    for (const year of yearNames) {
      for (const entryType of CREDITOR_ENTRY_TYPES) {
        const batch = await readPages(
          settings,
          `/accounting-years/${year}/entries`,
          CREDITOR_ENTRY_PAGE,
          CREDITOR_MAX_PAGES,
          `entryType$eq:${entryType}$and:remainder$ne:0`,
        )
        if (batch.state !== 'rows') return { state: batch.state }
        for (const row of batch.rows) wrapped.push({ year, row })
      }
    }
    return aggregateCreditorRemainders({ complete: true, today, rows: wrapped })
  } catch {
    return { state: 'error' }
  }
}
