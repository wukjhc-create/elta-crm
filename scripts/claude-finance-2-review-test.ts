/**
 * Claude review of Finance Batch 2 (2026-11-12): creditor completeness and projected-cash safety.
 * No network (fetch is mocked), no database, no write.
 *   npx tsx scripts/claude-finance-2-review-test.ts
 *
 * Rule under test: if completeness of the supplier remainder cannot be proven from the response, the result is
 * UNKNOWN, never a possibly incomplete number.
 */
import { readFileSync } from 'node:fs'
import { type ReadyEconomicSettings } from '../src/lib/services/economic-client'
import { readOpenSupplierRemainders } from '../src/lib/economic/read'
import { aggregateCreditorRemainders, classifyCreditorRow, OPEN_ITEM_FILTER } from '../src/lib/economic/supplier-remainder'
import { buildCashPosition, formatQualifiedKr, type BookedBankInput } from '../src/lib/finance/cash-position'

let failed = 0
let passed = 0
function t(name: string, ok: boolean, note = '') {
  if (ok) { passed++; return }
  failed++
  console.error(`FAIL  ${name}${note ? ` — ${note}` : ''}`)
}

const today = '2026-11-04'
const SECRET = 'HEMMELIG-TOKEN'
const ready = { provider: 'economic', active: true, api_token: SECRET, agreement_grant_token: SECRET, config: { bankContraAccountNumber: 5820 } } as unknown as ReadyEconomicSettings

const row = (p: Record<string, unknown> = {}) => ({
  entryNumber: 1, entryType: 'supplierInvoice', currency: 'DKK', remainder: -400, dueDate: '2026-11-20', amount: -1000,
  supplier: { supplierNumber: 7 }, supplierInvoiceNumber: 'INV-1', ...p,
})
const agg = (rows: Array<{ year?: string; row: unknown }>) =>
  aggregateCreditorRemainders({ complete: true, today, rows: rows.map((r) => ({ year: r.year ?? '2026', row: r.row })) })

function bank(): BookedBankInput {
  return { permitted: true, credentialsReady: true, settingsFailed: false, probe: 'not_needed', accountNumber: 5820, balance: { outcome: 'known', amount: 1000, accountName: 'Bank' }, readAt: '2026-11-04T08:00:00.000Z' } as unknown as BookedBankInput
}
const cash = (creditors: ReturnType<typeof agg>) => buildCashPosition({
  today, calculatedAt: '2026-11-04T08:00:00.000Z', receivablesLoaded: true, payablesLoaded: true, invoices: [], payables: [], bank: bank(), creditors,
})

async function main() {
  const realFetch = globalThis.fetch
  delete process.env.ECONOMIC_PUSH_ENABLED
  try {
    // ---------- 1. Completeness does not depend on entryType ----------
    for (const entryType of ['financeVoucher', 'systemEntry', 'openingEntry', 'transferredOpeningEntry', 'supplierPayment', 'someFutureType']) {
      const r = agg([{ row: row() }, { row: row({ entryNumber: 2, entryType, remainder: -100 }) }])
      t(`a supplier remainder of type ${entryType} is counted`, r.state === 'known' && r.dkkToPay === 500, JSON.stringify(r).slice(0, 120))
    }
    t('a non-zero remainder with no supplier and no customer makes the read unknown', agg([{ row: row() }, { row: row({ entryNumber: 2, entryType: 'financeVoucher', supplier: null, remainder: -250 }) }]).state === 'unknown')
    t('a remainder naming both supplier and customer makes the read unknown', agg([{ row: row({ customer: { customerNumber: 3 } }) }]).state === 'unknown')
    t('a supplier object without a usable number makes the read unknown', agg([{ row: row({ supplier: { supplierNumber: '7' } }) }]).state === 'unknown')
    t('a non-numeric remainder makes the read unknown', agg([{ row: row({ remainder: '-400' }) }]).state === 'unknown')
    t('a customer-side type naming a supplier makes the read unknown', agg([{ row: row({ entryType: 'reminder' }) }]).state === 'unknown')
    t('a customer open item is a receivable and ignored', (() => { const r = agg([{ row: row() }, { row: row({ entryNumber: 2, entryType: 'customerInvoice', supplier: null, customer: { customerNumber: 3 }, remainder: 9999 }) }]); return r.state === 'known' && r.dkkToPay === 400 })())
    t('a matched/contra line (no party, remainder null) is ignored', (() => { const r = agg([{ row: row() }, { row: row({ entryNumber: 2, supplier: null, remainder: null }) }]); return r.state === 'known' && r.dkkToPay === 400 })())
    t('a supplier line with remainder null makes the read unknown', agg([{ row: row({ remainder: null }) }]).state === 'unknown')
    t('classify does not ignore any supplier row by type', classifyCreditorRow(row({ entryType: 'systemEntry' })).kind === 'item')

    // ---------- 2. Accounting years: no possible double count ----------
    t('opening entry in 2026 + open items for the same supplier in 2025 → unknown (may be the same debt twice)',
      agg([{ year: '2025', row: row() }, { year: '2026', row: row({ entryNumber: 9, entryType: 'transferredOpeningEntry', remainder: -400 }) }]).state === 'unknown')
    t('plain openingEntry follows the same rule',
      agg([{ year: '2025', row: row() }, { year: '2026', row: row({ entryNumber: 9, entryType: 'openingEntry' }) }]).state === 'unknown')
    t('opening balance for another supplier does not block',
      (() => { const r = agg([{ year: '2025', row: row() }, { year: '2026', row: row({ entryNumber: 9, entryType: 'openingEntry', supplier: { supplierNumber: 8 }, remainder: -50 }) }]); return r.state === 'known' && r.dkkToPay === 450 })())
    t('opening balance first, later-year invoices for the same supplier is fine',
      (() => { const r = agg([{ year: '2025', row: row({ entryType: 'openingEntry' }) }, { year: '2026', row: row({ entryNumber: 2, remainder: -100 }) }]); return r.state === 'known' && r.dkkToPay === 500 })())
    t('the same entry number in different years is two entries, the same in one year is unknown',
      agg([{ year: '2026', row: row() }, { year: '2026', row: row() }]).state === 'unknown' && agg([{ year: '2025', row: row() }, { year: '2026', row: row({ remainder: -1 }) }]).state === 'known')

    // ---------- 3. Signs, partial and unmatched payments ----------
    {
      const r = agg([{ row: row({ remainder: -400, amount: -1000 }) }, { row: row({ entryNumber: 2, entryType: 'supplierPayment', remainder: 150, dueDate: null, supplierInvoiceNumber: null }) }])
      t('partial payment uses remainder; an unmatched payment (positive, undated) lowers the total', r.state === 'known' && r.dkkToPay === 250)
      t('an unmatched payment alone does not block the horizons', r.state === 'known' && r.horizonBlocked === null && r.horizon30ToPay === 400)
    }

    // ---------- 4. Projected cash safety ----------
    {
      const undated = agg([{ row: row({ dueDate: null }) }])
      const c = cash(undated)
      t('undated DKK debt: total known, projected 30/60/90 unknown (not higher)', c.openPayables.amount === 400 && c.forecast30.projectedCash.amount === null && c.forecast90.projectedCash.amount === null && formatQualifiedKr(c.forecast30.projectedCash) === 'Ukendt')
      const credit = agg([{ row: row({ remainder: -100, dueDate: '2026-11-10' }) }, { row: row({ entryNumber: 2, entryType: 'supplierInvoice', remainder: 300, dueDate: '2026-11-12', supplierInvoiceNumber: 'CN-1' }) }])
      const cc = cash(credit)
      t('a supplier credit never becomes incoming cash (horizon outflow floored at 0)', credit.state === 'known' && credit.horizon30ToPay === 0 && cc.forecast30.projectedCash.amount === 1000)
      t('the open total still shows the net (negative = in our favour), not floored', credit.state === 'known' && credit.dkkToPay === -200)
      const foreign = cash(agg([{ row: row({ currency: 'EUR', remainder: -50 }) }]))
      t('foreign currency keeps projected cash unknown', foreign.forecast30.projectedCash.amount === null)
      const ok = cash(agg([{ row: row({ remainder: -400, dueDate: '2026-11-20' }) }, { row: row({ entryNumber: 2, remainder: -100, dueDate: '2027-06-01' }) }]))
      t('complete, dated, DKK only: projected cash is a number', ok.forecast30.projectedCash.amount === 600 && ok.forecast90.projectedCash.amount === 600)
    }

    // ---------- 5. Reader: one open-item read per year, no entryType filter ----------
    {
      const calls: Array<{ path: string; filter: string | null; method: string }> = []
      globalThis.fetch = (async (url: unknown, init?: { method?: string }) => {
        const u = new URL(String(url))
        calls.push({ path: u.pathname, filter: u.searchParams.get('filter'), method: init?.method ?? 'GET' })
        const json = (d: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(d) }) as Response
        if (u.pathname === '/accounting-years') return json({ collection: [{ year: '2026' }], pagination: { results: 1 } })
        if (u.pathname === '/accounting-years/2026/entries') {
          return json({ collection: [
            row(),
            row({ entryNumber: 2, entryType: 'financeVoucher', remainder: -100, supplierInvoiceNumber: null }),
            row({ entryNumber: 3, entryType: 'systemEntry', remainder: -50, supplierInvoiceNumber: null }),
            row({ entryNumber: 4, entryType: 'customerInvoice', supplier: null, customer: { customerNumber: 1 }, remainder: 777 }),
          ], pagination: { results: 4 } })
        }
        return { ok: false, status: 404, text: async () => '{}' } as Response
      }) as typeof fetch
      const r = await readOpenSupplierRemainders(ready, today)
      t('reader: financeVoucher and systemEntry supplier remainders are in the total', r.state === 'known' && r.dkkToPay === 550, JSON.stringify(r).slice(0, 160))
      t('reader: the entries request has no entryType filter', calls.filter((c) => c.path.endsWith('/entries')).every((c) => c.filter === OPEN_ITEM_FILTER))
      t('reader: GET only, one entries call per year', calls.every((c) => c.method === 'GET') && calls.filter((c) => c.path.endsWith('/entries')).length === 1)

      globalThis.fetch = (async (url: unknown) => {
        const u = new URL(String(url))
        const json = (d: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(d) }) as Response
        if (u.pathname === '/accounting-years') return json({ collection: [{ year: '2026' }], pagination: { results: 1 } })
        return json({ collection: [row(), row({ entryNumber: 2, entryType: 'financeVoucher', supplier: null, remainder: -100 })], pagination: { results: 2 } })
      }) as typeof fetch
      t('reader: an unattributable open item makes the whole read unknown', (await readOpenSupplierRemainders(ready, today)).state === 'unknown')
    }

    // ---------- 7. Staging-proof checklist (section 3 of the staging request), one assertion per item ----------
    {
      const U = (r: { state: string }) => r.state === 'unknown'
      t('P: incomplete pagination → unknown', U(aggregateCreditorRemainders({ complete: false, today, rows: [{ year: '2026', row: row() }] })))
      t('P: malformed accounting year → unknown', U(aggregateCreditorRemainders({ complete: true, today, rows: [{ year: '2025/2026', row: row() }] })) && U(aggregateCreditorRemainders({ complete: true, today, rows: [{ year: '26', row: row() }] })))
      t('P: duplicate entry → unknown', U(agg([{ row: row() }, { row: row() }])))
      t('P: supplier + customer on the same open entry → unknown', U(agg([{ row: row({ customer: { customerNumber: 4 } }) }])))
      t('P: non-zero remainder with neither supplier nor customer → unknown', U(agg([{ row: row({ supplier: null, entryType: 'systemEntry' }) }])))
      t('P: supplier on each customer-only type → unknown', ['customerInvoice', 'customerPayment', 'reminder', 'manualDebtorInvoice'].every((entryType) => U(agg([{ row: row({ entryType }) }]))))
      t('P: malformed supplier → unknown', U(agg([{ row: row({ supplier: { supplierNumber: -7 } }) }])) && U(agg([{ row: row({ supplier: { supplierNumber: 7.5 } }) }])))
      t('P: malformed remainder → unknown', U(agg([{ row: row({ remainder: '-400' }) }])) && U(agg([{ row: row({ remainder: Number.NaN }) }])))
      t('P: malformed currency → unknown', U(agg([{ row: row({ currency: 'dkk' }) }])) && U(agg([{ row: row({ currency: null }) }])))
      t('P: malformed due date → unknown', U(agg([{ row: row({ dueDate: '2026/11/20' }) }])) && U(agg([{ row: row({ dueDate: 20261120 }) }])))
      t('P: opening entry + earlier-year open item, same supplier → unknown', U(agg([{ year: '2025', row: row() }, { year: '2026', row: row({ entryNumber: 2, entryType: 'openingEntry' }) }])))
      {
        const f = agg([{ row: row({ currency: 'EUR' }) }])
        const fc = cash(f)
        t('P: foreign currency → no DKK total and projected unknown, currency listed separately', f.state === 'known' && !f.dkkOnly && f.dkkToPay === null && fc.openPayables.amount === null && fc.forecast30.projectedCash.amount === null && fc.creditorCurrencies.some((c) => c.currency === 'EUR'))
        t('P: projected cash says why (another currency)', /anden valuta/.test(fc.forecast30.projectedCash.detail ?? ''))
      }
      {
        const u = cash(agg([{ row: row({ dueDate: null }) }]))
        t('P: undated net DKK debt → 30/60/90 unknown', u.forecast30.projectedCash.amount === null && u.forecast60.projectedCash.amount === null && u.forecast90.projectedCash.amount === null)
        t('P: projected cash says why (no due date)', /uden forfaldsdato/.test(u.forecast30.projectedCash.detail ?? ''), u.forecast30.projectedCash.detail ?? '')
      }
      {
        const empty = agg([])
        const ec = cash(empty)
        t('P: complete empty creditor set = known 0', empty.state === 'known' && empty.dkkToPay === 0 && ec.openPayables.amount === 0 && ec.openPayables.source === 'economic_open_items')
      }
      {
        const failed = buildCashPosition({ today, calculatedAt: '2026-11-04T08:00:00.000Z', receivablesLoaded: true, payablesLoaded: true, invoices: [], payables: [{ id: 'p1', status: 'approved', currency: 'DKK', amountInclVat: 999, dueDate: '2026-11-10', supplierName: 'X', invoiceNumber: 'F1', supplierId: null, duplicateOfId: null } as never], bank: bank(), creditors: { state: 'error' } })
        t('P: HTTP/read failure ≠ 0 (Ukendt, alert)', failed.openPayables.amount === null && formatQualifiedKr(failed.openPayables) === 'Ukendt' && failed.alerts.some((a) => a.code === 'creditor_read_failed'))
        t('P: invoice-total fallback never substituted for a failed remainder', failed.openPayables.amount === null && failed.forecast30.expectedOutgoing.amount === null && failed.forecast30.projectedCash.amount === null)
        t('P: projected cash says why (read failed)', /kunne ikke læses/.test(failed.forecast30.projectedCash.detail ?? ''))
      }
      {
        const cr = agg([{ row: row({ remainder: -100, dueDate: '2026-11-10' }) }, { row: row({ entryNumber: 2, remainder: 500, dueDate: '2026-11-12' }) }])
        const cc = cash(cr)
        t('P: supplier credits cannot turn forecast outgoing negative', cr.state === 'known' && cr.horizon30ToPay === 0 && cr.horizon90ToPay === 0 && cc.forecast30.expectedOutgoing.amount === 0)
        t('P: credit balance is never incoming cash (projected = bank + incoming, not more)', cc.forecast30.projectedCash.amount === 1000)
      }
      {
        const p = agg([{ row: row({ amount: -1000, remainder: -400 }) }])
        t('P: partial payment uses remainder, never invoice amount', p.state === 'known' && p.dkkToPay === 400)
        const pay = agg([{ row: row({ entryType: 'supplierPayment', remainder: 150, dueDate: null, supplierInvoiceNumber: null }) }])
        t('P: unmatched supplier payment keeps its sign', pay.state === 'known' && pay.dkkToPay === -150 && pay.currencies[0]?.remainder === 150)
      }
    }

    // ---------- 6. Static: the entryType allowlist is gone, the client is unchanged ----------
    const reader = readFileSync('src/lib/economic/read.ts', 'utf8')
    t('static: reader does not filter on entryType', !/entryType\$eq/.test(reader) && /OPEN_ITEM_FILTER/.test(reader))
    t('static: no POST/PUT/PATCH/DELETE and no fetch in the creditor files', !/method:\s*'(POST|PUT|PATCH|DELETE)'|fetch\(/.test(readFileSync('src/lib/economic/supplier-remainder.ts', 'utf8') + reader))
  } finally {
    globalThis.fetch = realFetch
  }
  console.log(failed ? `claude-finance-2-review-test FEJL: ${failed} af ${passed + failed}` : `claude-finance-2-review-test ok (${passed} bestået)`)
  process.exitCode = failed ? 1 : 0
}
main()
