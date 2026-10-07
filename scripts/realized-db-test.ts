/**
 * Unit-tests for realiseret DB pr. sag (src/lib/cases/realized-db.ts). Ingen DB.
 *   npx tsx scripts/realized-db-test.ts
 */
import { computeRealizedDb } from '../src/lib/cases/realized-db'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const inv = (total: number, status = 'sent', type = 'standard', voided: string | null = null) => ({ total_amount: total, status, invoice_type: type, voided_at: voided })

// 7.777 er fuldt krediteret (voided_at sat af kreditflowet) — originalen + dens kreditnota udligner hinanden (X1)
const a = computeRealizedDb([inv(10000), inv(5000, 'paid'), inv(-2000, 'sent', 'credit'), inv(9999, 'draft'), inv(7777, 'sent', 'standard', '2026-10-01'), inv(7777, 'sent', 'credit')], 9000, true)
ok(a.invoiced_ex_vat === 22777 && a.credited_ex_vat === 9777 && a.net_invoiced_ex_vat === 13000, 'netto = udstedte − kredit (kladde udelukket; fuldt krediteret udlignes)', JSON.stringify(a))
ok(a.realized_db === 4000 && a.realized_db_pct === 30.77, 'realiseret DB og %', `${a.realized_db} / ${a.realized_db_pct}`)
ok(a.issued_invoice_count === 5 && a.state === 'fully_invoiced', 'antal udstedte + fuldt faktureret')

const b = computeRealizedDb([], 1234.5, false)
ok(b.state === 'not_invoiced' && b.realized_db === -1234.5 && b.realized_db_pct === null, 'intet faktureret → negativ DB, ingen %', JSON.stringify(b))

const c = computeRealizedDb([inv(1000)], 1500, false)
ok(c.state === 'partially_invoiced' && c.realized_db === -500 && c.realized_db_pct === -50, 'delvist faktureret, underskud')

const d = computeRealizedDb([{ total_amount: '2500.50', status: 'paid', invoice_type: null, voided_at: null }], 0, true)
ok(d.net_invoiced_ex_vat === 2500.5 && d.realized_db_pct === 100, 'numeric som streng; manglende type = standard')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle realiseret-DB-tests bestået')
process.exitCode = bad ? 1 : 0
