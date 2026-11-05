/**
 * 00248: ukendt materialekost er aldrig 0. Ren logik og statiske værn. Ingen database, intet netværk.
 *   npx tsx scripts/case-material-unknown-cost-test.ts
 */
import { readFileSync } from 'node:fs'
import { addCosts, knownCost, marginOf, parseCostInput, sumCosts } from '../src/lib/cases/material-cost'
import { compareOfferToActual } from '../src/lib/cases/offer-vs-actual'
import { computeRealizedDb } from '../src/lib/cases/realized-db'
import { profitByClosedMonth, profitByCustomer } from '../src/lib/profit/profitability-groups'
import { summarizeAftercalc } from '../src/lib/profit/aftercalc-summary'
import { lineSnapshot } from '../src/lib/services/incoming-invoice-conversion'

let bad = 0
let passed = 0
function t(label: string, ok: boolean, note = '') {
  if (ok) passed++
  else { bad++; console.error(`FAIL  ${label}${note ? ` — ${note}` : ''}`) }
}

// ---- Den kanoniske regel ----
t('null er ukendt', knownCost(null) === null)
t('undefined er ukendt', knownCost(undefined) === null)
t('tom tekst er ukendt', knownCost('') === null)
t('NaN er ukendt', knownCost(Number.NaN) === null && knownCost('NaN') === null)
t('Infinity er ukendt', knownCost(Number.POSITIVE_INFINITY) === null)
t('tekst er ukendt', knownCost('abc') === null)
t('objekt er ukendt', knownCost({}) === null)
t('0 er kendt', knownCost(0) === 0 && knownCost('0') === 0 && knownCost('0.00') === 0)
t('positiv er kendt', knownCost(12.5) === 12.5 && knownCost('12.50') === 12.5)
t('negativ returlinje er kendt', knownCost(-100) === -100)

const allKnown = sumCosts([10, '20.50', 0])
t('alle kendte: total', allKnown.total === 30.5 && allKnown.complete && allKnown.unknownLines === 0)
const realZero = sumCosts([0, 0])
t('kun rigtige nuller: total 0, ikke ukendt', realZero.total === 0 && realZero.complete)
const partly = sumCosts([10, null, 5])
t('én ukendt: ingen total', partly.total === null && !partly.complete)
t('én ukendt: kendt del står', partly.known === 15 && partly.unknownLines === 1)
const onlyUnknown = sumCosts([null, null])
t('kun ukendte: ingen total, kendt 0, 2 linjer', onlyUnknown.total === null && onlyUnknown.known === 0 && onlyUnknown.unknownLines === 2)
const none = sumCosts([])
t('ingen linjer: total 0 (intet at mangle)', none.total === 0 && none.complete)

t('addCosts med ukendt', addCosts(10, null, 5) === null)
t('addCosts kendte', addCosts(10.1, 0, 5.2) === 15.3)
t('margin med ukendt kost', marginOf(100, null).amount === null && marginOf(100, null).percentage === null)
t('margin med kost 0 er rigtig', marginOf(100, 0).amount === 100 && marginOf(100, 0).percentage === 100)
t('margin uden salg', marginOf(0, 10).amount === -10 && marginOf(0, 10).percentage === 0)

const emptyInput = parseCostInput('')
t('tomt felt gemmes som ukendt', emptyInput.ok && emptyInput.cost === null)
const nullInput = parseCostInput(null)
t('null gemmes som ukendt', nullInput.ok && nullInput.cost === null)
const undefinedInput = parseCostInput(undefined)
t('udeladt gemmes som ukendt', undefinedInput.ok && undefinedInput.cost === null)
const zeroInput = parseCostInput(0)
t('skrevet 0 er kost 0', zeroInput.ok && zeroInput.cost === 0)
t('negativ afvises', !parseCostInput(-1).ok)
const negOk = parseCostInput(-1, { allowNegative: true })
t('negativ tilladt på returlinje', negOk.ok && negOk.cost === -1)
t('ugyldig tekst afvises', !parseCostInput('abc').ok)
t('NaN afvises', !parseCostInput(Number.NaN).ok)

// ---- Tilbudt mod faktisk ----
const line = { id: 'l1', description: 'Kabel', quantity: 10, unit: 'm', cost_price: 10 }
const mat = (id: string, total: number | null, extra: Record<string, unknown> = {}) => ({ id, description: 'Kabel', quantity: 10, unit: 'm', total_cost: total, source_offer_line_id: 'l1', ...extra })
const known = compareOfferToActual([line], [mat('m1', 120)], { hours: 0, cost: null })
t('kendt: afvigelse beregnes', known.totals.actual_cost === 120 && known.totals.deviation === 20 && known.totals.unknown_cost_lines === 0)
const zero = compareOfferToActual([line], [mat('m1', 0)], { hours: 0, cost: null })
t('rigtig 0: faktisk 0, afvigelse -100', zero.totals.actual_cost === 0 && zero.totals.deviation === -100)
t('rigtig 0: rækken er kendt', zero.rows[0].actual_cost === 0 && zero.rows[0].unknown_cost_lines === 0)
const unknown = compareOfferToActual([line], [mat('m1', null)], { hours: 0, cost: null })
t('ukendt: rækkens kost og afvigelse er null', unknown.rows[0].actual_cost === null && unknown.rows[0].cost_deviation === null)
t('ukendt: ikke vist som sparet', unknown.rows[0].cost_deviation !== -100)
t('ukendt: rækken tæller én ukendt', unknown.rows[0].unknown_cost_lines === 1)
t('ukendt: total og afvigelse er null', unknown.totals.actual_cost === null && unknown.totals.deviation === null)
t('ukendt: status ud fra antal, ikke "ikke brugt"', unknown.rows[0].status === 'as_offered')
const notUsed = compareOfferToActual([line], [], { hours: 0, cost: null })
t('ikke brugt: hele tilbudskosten er sparet', notUsed.rows[0].status === 'not_used' && notUsed.rows[0].cost_deviation === -100)
t('ikke brugt: totalen er kendt 0', notUsed.totals.actual_cost === 0 && notUsed.totals.deviation === -100)
const mixed = compareOfferToActual([line], [mat('m1', 40), mat('m2', null)], { hours: 0, cost: null })
t('blandet på samme linje: ukendt', mixed.rows[0].actual_cost === null && mixed.rows[0].unknown_cost_lines === 1)
t('blandet: kendt del bevaret', mixed.totals.actual_cost_known === 40)
const extra = compareOfferToActual([], [{ id: 'x', description: 'Ekstra', quantity: 1, unit: 'stk', total_cost: null }], { hours: 0, cost: null })
t('ikke tilbudt med ukendt kost', extra.rows[0].status === 'not_offered' && extra.rows[0].actual_cost === null && extra.rows[0].cost_deviation === null)
t('ikke tilbudt: total ukendt', extra.totals.actual_cost === null && extra.totals.unknown_cost_lines === 1)
const labourAndUnknown = compareOfferToActual([], [mat('m1', null, { source_offer_line_id: null })], { hours: 5, cost: 1500 })
t('timekost kendt + materiale ukendt: total ukendt, kendt 1500', labourAndUnknown.totals.actual_cost === null && labourAndUnknown.totals.actual_cost_known === 1500)

// ---- Realiseret DB ----
const issued = [{ total_amount: 1000, status: 'sent', invoice_type: 'standard', voided_at: null, currency: 'DKK' }]
const realized = computeRealizedDb(issued, 600, false)
t('realiseret kendt', realized.realized_db === 400 && realized.realized_db_pct === 40 && realized.actual_cost === 600)
const realizedUnknown = computeRealizedDb(issued, null, false)
t('realiseret ukendt: DB og % null', realizedUnknown.realized_db === null && realizedUnknown.realized_db_pct === null && realizedUnknown.actual_cost === null)
t('realiseret ukendt: faktureret står', realizedUnknown.net_invoiced_ex_vat === 1000 && realizedUnknown.issued_invoice_count === 1)
const realizedZero = computeRealizedDb(issued, 0, false)
t('realiseret kost 0 er rigtig', realizedZero.realized_db === 1000 && realizedZero.realized_db_pct === 100)

// ---- Grupper og opsummering ----
const row = (over: Record<string, unknown>) => ({ customer_id: 'k1', customer_name: 'K', status: 'closed', closed_at: '2026-10-10T10:00:00Z', net_invoiced: 1000, realized_db: 400, ...over })
const groupOk = profitByCustomer([row({}), row({ realized_db: 100 })])
t('gruppe kendt', groupOk[0].realized_db === 500 && groupOk[0].incomplete_cases === 0 && groupOk[0].realized_db_pct === 25)
const groupIncomplete = profitByCustomer([row({}), row({ realized_db: null, realized_incomplete: true })])
t('gruppe med ukendt sag: DB ukendt', groupIncomplete[0].realized_db === null && groupIncomplete[0].realized_db_pct === null)
t('gruppe med ukendt sag: faktureret og antal tæller', groupIncomplete[0].net_invoiced === 2000 && groupIncomplete[0].cases === 2 && groupIncomplete[0].incomplete_cases === 1)
const notInvoiced = profitByCustomer([row({ realized_db: null })])
t('ikke faktureret sag er ikke med', notInvoiced.length === 0)
const sorted = profitByCustomer([row({ customer_id: 'a', realized_db: null, realized_incomplete: true }), row({ customer_id: 'b', realized_db: -500 })])
t('ukendt gruppe sorteres sidst', sorted[0].key === 'b' && sorted[1].key === 'a')
const month = profitByClosedMonth([row({ realized_db: null, realized_incomplete: true })])
t('måned med ukendt sag: DB ukendt', month.length === 1 && month[0].realized_db === null)
const after = summarizeAftercalc([
  { status: 'closed', estimated_hours: null, actual_hours: 0, offered_db_pct: 30, realized_db_pct: null, cost_deviation: null, unknown_cost_lines: 1 },
  { status: 'closed', estimated_hours: null, actual_hours: 0, offered_db_pct: 30, realized_db_pct: 20, cost_deviation: 0, unknown_cost_lines: 0 },
], 25)
t('opsummering: ukendt tæller for sig', after.cost_incomplete === 1)
t('opsummering: ukendt er ude af DB-gennemsnit og lav-DB', after.db_basis === 1 && after.low_db === 1 && after.avg_db_deviation_pp === -10)

// ---- Leverandørfaktura → materiale ----
const noPrice = lineSnapshot({ description: 'X', quantity: 2, unit: 'stk', unit_price: null, total_price: null })
t('faktura-linje uden beløb: ukendt, ikke 0', noPrice.unit_cost === null && noPrice.quantity === 2)
const zeroPrice = lineSnapshot({ description: 'X', quantity: 1, unit: 'stk', unit_price: 0, total_price: 0 })
t('faktura-linje med skrevet 0: kendt 0', zeroPrice.unit_cost === 0)
const total = lineSnapshot({ description: 'X', quantity: 2, unit: 'stk', unit_price: null, total_price: 100 })
t('faktura-linje med total: stk-kost', total.unit_cost === 50)
const onlyUnit = lineSnapshot({ description: 'X', quantity: 2, unit: 'stk', unit_price: 30, total_price: null })
t('faktura-linje med stk-pris', onlyUnit.unit_cost === 30)
const credit = lineSnapshot({ description: 'X', quantity: -2, unit: 'stk', unit_price: 100, total_price: -200 })
t('returlinje beholder negativ kost', credit.unit_cost === -100 && credit.quantity === 2)

// ---- Statiske værn: NULL → 0 og fakturering ----
const src = (f: string) => readFileSync(f, 'utf8')
const materials = src('src/lib/actions/case-materials.ts')
t('oprettelse: ingen standard på 0', !materials.includes('input.unit_cost ?? 0'))
t('oprettelse: uden kost-ret gemmes null', materials.includes('hasPermission(PRICE_VISIBILITY_PERMISSION) ? parsedCost.cost : null'))
t('liste: ingen Number() på kost', !materials.includes('Number(r.unit_cost)') && !materials.includes('Number(r.total_cost)'))
t('liste: skjult er null på alle linjer', materials.includes('{ ...r, unit_cost: null, total_cost: null }'))
t('liste: antal ukendte skjules uden kost-ret', materials.includes('unknown_cost_lines: canSeeCostPrices ? costs.unknownLines : null'))
t('rettelse: priser ignoreres uden kost-ret', materials.includes('canSetPrices && patch.unit_cost !== undefined') && materials.includes('canSetPrices && patch.unit_sales_price !== undefined'))
t('rettelse: skjult kost sendes ikke tilbage', materials.includes('canSetPrices ? saved : { ...saved, unit_cost: null, total_cost: null }'))
t('rettelse: ukendt → 0 auditeres', materials.includes('knownCost(update.unit_cost) !== knownCost(cur.unit_cost)'))

const dialog = src('src/app/dashboard/orders/[id]/case-material-dialog.tsx')
t('dialog: tomt felt som standard', dialog.includes("unit_cost: '', //") && !dialog.includes("unit_cost: '0'"))
t('dialog: viser ikke "null"', !dialog.includes('unit_cost: String(editing.unit_cost)'))
t('dialog: priser sendes kun med kost-ret', dialog.includes('...(showPrices ? { unit_cost: parsedCost, unit_sales_price: parsedSale } : {})'))

const economy = src('src/lib/actions/service-case-economy.ts')
t('økonomi: ingen Number(total_cost ?? 0) på materialer', !economy.includes('mat_cost') && !/matRows\.reduce\(\(s, r\) => s \+ Number\(r\.total_cost/.test(economy))
t('økonomi: ingen 0-test for "uden kost"', !economy.includes('Number(m.unit_cost ?? 0) === 0'))

const conversion = src('src/lib/services/incoming-invoice-conversion.ts')
t('konvertering: materiale gemmer null', /from\('case_materials'\)[\s\S]{0,400}unit_cost: snap\.unit_cost,/.test(conversion))

// Faktura, ufaktureret arbejde og lukke-værn læser kun salg: ukendt kost kan ikke blokere eller ændre dem
for (const file of ['src/lib/cases/unbilled-work.ts', 'src/lib/cases/close-readiness-batch.ts', 'src/lib/services/invoice-from-case.ts', 'src/lib/invoices/unbilled.ts']) {
  const text = src(file)
  t(`${file}: læser ikke materialekost`, !/case_materials[^\n]*(unit_cost|total_cost)/.test(text))
}
const stage = src('src/lib/services/invoice-stage.ts')
t('slutfaktura: materialelæsning uden kost', !/from\('case_materials'\)\s*\.select\('[^']*(unit_cost|total_cost)/.test(stage))
const caseActions = src('src/lib/actions/service-cases.ts')
t('lukke-status: materialelæsning uden kost', !/case_materials'\)\.select\('[^']*(unit_cost|total_cost)/.test(caseActions))
const invoiceAction = src('src/lib/actions/invoices.ts')
t('fakturakladde: materialelæsning uden kost', !/from\('case_materials'\)\s*\.select\(\s*'[^']*(unit_cost|total_cost)/.test(invoiceAction))

// Migrationen
const mig = src('supabase/migrations/00248_case_material_unknown_cost.sql')
t('migration: nullable uden standard', /ALTER COLUMN unit_cost DROP DEFAULT/.test(mig) && /ALTER COLUMN unit_cost DROP NOT NULL/.test(mig))
t('migration: ingen dataændring', !/^\s*UPDATE\s/im.test(mig) && !/^\s*DELETE\s/im.test(mig))
t('migration: ingen politik/grant ændret', !/CREATE POLICY|DROP POLICY|^\s*GRANT\s|^\s*REVOKE\s/im.test(mig))
const rollback = src('docs/runbooks/mp-00248-rollback.sql')
t('rollback: afviser ved NULL og sætter intet til 0', /RAISE EXCEPTION/.test(rollback) && !/UPDATE\s+public\.case_materials/i.test(rollback))

if (bad) { console.error(`case-material-unknown-cost-test: ${bad} fejl, ${passed} bestået`); process.exit(1) }
console.log(`case-material-unknown-cost-test ok (${passed} bestået)`)
