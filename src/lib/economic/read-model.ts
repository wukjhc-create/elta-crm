/**
 * Pure e-conomic read shapes. No HTTP and no secrets.
 * A missing balance is unknown. A real 0 is kept.
 */

/**
 * The only paths the read client may call. Whole-path match, so a query string, an encoded path, `..`, a double
 * slash, a full URL or another case cannot pass. Add a path here only when a screen mounts it.
 */
export function economicReadPathAllowed(path: string): boolean {
  if (typeof path !== 'string') return false
  return [
    /^\/accounting-years$/,
    /^\/accounting-years\/[0-9]{4}\/entries$/,
    /^\/accounts\/[0-9]{1,18}$/,
  ].some((rule) => rule.test(path))
}

export type LedgerAccountRead =
  | { state: 'known'; amount: number; accountName: string | null }
  /** e-conomic says the account is not a balance-sheet account, so its balance cannot be cash. */
  | { state: 'not_balance_sheet'; accountType: string }
  | { state: 'unknown' }

/**
 * One account from GET /accounts/{number}. 0 is a real balance. Anything that cannot be read is unknown.
 * e-conomic has no "bank" account type. 'status' (balance sheet) is the most this can prove, not that it is the bank.
 */
export function parseLedgerAccount(data: unknown, expectedAccountNumber: number): LedgerAccountRead {
  if (!data || typeof data !== 'object') return { state: 'unknown' }
  const row = data as { accountNumber?: unknown; accountType?: unknown; balance?: unknown; name?: unknown }
  if (row.accountNumber !== expectedAccountNumber) return { state: 'unknown' }
  if (typeof row.accountType !== 'string' || !row.accountType) return { state: 'unknown' }
  if (row.accountType !== 'status') return { state: 'not_balance_sheet', accountType: row.accountType }
  if (typeof row.balance !== 'number' || !Number.isFinite(row.balance)) return { state: 'unknown' }
  return { state: 'known', amount: row.balance, accountName: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : null }
}

export interface ParsedCollection {
  rows: unknown[]
  /** False when another page exists or the page is full. A full page must not be summed as the company total. */
  complete: boolean
}

/** Null when the body is not a collection. An empty collection is complete and has no rows. */
export function parseCollection(data: unknown, pagesize: number): ParsedCollection | null {
  if (!data || typeof data !== 'object' || !('collection' in data)) return null
  const collection = (data as { collection?: unknown }).collection
  if (!Array.isArray(collection)) return null
  const next = (data as { pagination?: { nextPage?: unknown } }).pagination?.nextPage
  const hasNext = next != null && next !== ''
  return {
    rows: collection,
    complete: !hasNext && collection.length < pagesize,
  }
}
