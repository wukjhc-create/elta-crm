/**
 * 00248: ukendt materialekost er aldrig 0. Ren logik og statiske værn. Ingen database, intet netværk.
 *   npx tsx scripts/case-material-unknown-cost-test.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { addCosts, knownCost, marginOf, parseCostInput, sumCosts } from '../src/lib/cases/material-cost'
import { compareOfferToActual } from '../src/lib/cases/offer-vs-actual'
import { computeRealizedDb } from '../src/lib/cases/realized-db'
import { profitByClosedMonth, profitByCustomer } from '../src/lib/profit/profitability-groups'
import { summarizeAftercalc } from '../src/lib/profit/aftercalc-summary'
import { lineSnapshot } from '../src/lib/services/incoming-invoice-conversion'
import { CASE_MATERIAL_PUBLIC_COLUMNS, listCaseMaterialsCore, readCaseMaterialCosts, withCosts } from '../src/lib/materials/case-material-costs'

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
t('liste: går gennem loaderen', materials.includes('listCaseMaterialsCore('))
t('rettelse: priser ignoreres uden kost-ret', materials.includes('canSetPrices && patch.unit_cost !== undefined') && materials.includes('canSetPrices && patch.unit_sales_price !== undefined'))
t('rettelse og oprettelse: kost tilbage kun bag ret', (materials.match(/withVisibleCost\(/g) ?? []).length >= 3)
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
// Politikker: KUN work_order_profit's læsepolitik udskiftes (samme navn) — case_materials' politikker røres ikke
const migCode = mig.replace(/^\s*--.*$/gm, '')
const polStmts = Array.from(migCode.matchAll(/(CREATE|DROP|ALTER) POLICY\s+(?:IF EXISTS\s+)?(\w+)\s+ON\s+public\.(\w+)/gi)).map((x) => `${x[1].toUpperCase()} ${x[2]} ${x[3]}`)
t('migration: kun work_order_profit-politikken udskiftes', JSON.stringify(polStmts) === JSON.stringify(['DROP work_order_profit_select_cost_roles work_order_profit', 'CREATE work_order_profit_select_cost_roles work_order_profit']), JSON.stringify(polStmts))
t('migration: ingen tabel-skrivegrants ændres', !/(GRANT|REVOKE)\s+(ALL|INSERT|UPDATE|DELETE|TRUNCATE)\b(?![^;]*ON FUNCTION)/i.test(migCode))
const execStmts = Array.from(migCode.matchAll(/(GRANT|REVOKE)\s+(?:ALL|EXECUTE)\s+ON FUNCTION\s+public\.(\w+)/gi)).map((x) => `${x[1].toUpperCase()} ${x[2]}`)
t('migration: funktions-ACL kun for værnet og snapshot-funktionen', JSON.stringify(execStmts) === JSON.stringify(['REVOKE case_materials_cost_write_guard', 'REVOKE snapshot_work_order_profit', 'GRANT snapshot_work_order_profit']), JSON.stringify(execStmts))
t('migration: snapshot-funktionen lukkes for klienter', /REVOKE EXECUTE ON FUNCTION public\.snapshot_work_order_profit\(uuid, text\) FROM PUBLIC, anon, authenticated/.test(migCode))

// §6 skrive-værn: effektiv rettighed, INVOKER, insert kun NULL, update OF unit_cost afvist uanset værdi, ingen beløb i fejlen
const guardFn = /CREATE FUNCTION public\.case_materials_cost_write_guard\(\)[\s\S]*?\$function\$;/.exec(migCode)?.[0] ?? ''
t('skrive-værn: findes', guardFn.length > 0)
t('skrive-værn: effektiv rettighed materials.view.cost_prices', /user_has_permission\('materials\.view\.cost_prices'\)/.test(guardFn))
t('skrive-værn: ingen rå rolle', !/user_role\(|role\s*=|role\s+IN/i.test(guardFn.replace(/current_user IN \('anon', 'authenticated'\)/, '')))
t('skrive-værn: SECURITY INVOKER (current_user er kalderen)', !/SECURITY DEFINER/i.test(guardFn) && /current_user IN \('anon', 'authenticated'\)/.test(guardFn))
t('skrive-værn: INSERT kun med NULL', /TG_OP <> 'INSERT' OR NEW\.unit_cost IS NOT NULL/.test(guardFn))
t('skrive-værn: sammenligner aldrig med gemt kost (intet orakel)', !/OLD\./.test(guardFn))
t('skrive-værn: fejlen indeholder ingen værdi', /RAISE EXCEPTION '[^'%]*'\s+USING ERRCODE = '42501'/.test(guardFn))
t('skrive-værn: trigger på INSERT', /BEFORE INSERT ON public\.case_materials\s+FOR EACH ROW EXECUTE FUNCTION public\.case_materials_cost_write_guard\(\)/.test(migCode))
t('skrive-værn: trigger på UPDATE OF unit_cost', /BEFORE UPDATE OF unit_cost ON public\.case_materials\s+FOR EACH ROW EXECUTE FUNCTION public\.case_materials_cost_write_guard\(\)/.test(migCode))
t('skrive-værn: klienter har ingen EXECUTE på trigger-funktionen', /REVOKE ALL ON FUNCTION public\.case_materials_cost_write_guard\(\) FROM PUBLIC, anon, authenticated/.test(migCode))

// §7 work_order_profit: begge kost-nøgler + ordre-scope, ingen rå rolle
const wopPol = /CREATE POLICY work_order_profit_select_cost_roles[\s\S]*?\);/.exec(migCode)?.[0] ?? ''
t('avance-politik: economy.cost_prices OG materials.view.cost_prices', /user_has_permission\('economy\.cost_prices'\)\)\s+AND \(SELECT public\.user_has_permission\('materials\.view\.cost_prices'\)\)/.test(wopPol))
t('avance-politik: ordren skal være synlig (work_orders-RLS)', /EXISTS \(SELECT 1 FROM public\.work_orders w WHERE w\.id = work_order_profit\.work_order_id\)/.test(wopPol))
t('avance-politik: kun SELECT for authenticated', /FOR SELECT TO authenticated/.test(wopPol))
t('avance-politik: forudsætningsværn før udskiftning', /IS DISTINCT FROM ARRAY\['work_order_profit_select_cost_roles'\]/.test(migCode))
t('rollback: avance efter 00192 og snapshot-EXECUTE tilbage', /USING \(public\.user_role\(\) IN \('admin', 'serviceleder', 'bogholderi'\)\)/.test(src('docs/runbooks/mp-00248-rollback.sql')) && /GRANT EXECUTE ON FUNCTION public\.snapshot_work_order_profit\(uuid, text\) TO authenticated/.test(src('docs/runbooks/mp-00248-rollback.sql')))
t('rollback: skrive-værnet fjernes', /DROP TRIGGER IF EXISTS trg_case_materials_cost_write_guard_insert/.test(src('docs/runbooks/mp-00248-rollback.sql')) && /DROP TRIGGER IF EXISTS trg_case_materials_cost_write_guard_update/.test(src('docs/runbooks/mp-00248-rollback.sql')) && /DROP FUNCTION IF EXISTS public\.case_materials_cost_write_guard\(\)/.test(src('docs/runbooks/mp-00248-rollback.sql')))

// App: revisionssporet skriver ikke en skjult kost; AI-indsigter kræver begge nøgler
const actionsSrc = src('src/lib/actions/case-materials.ts')
t('app: revisionsspor med kost kun med kost-retten', /\.\.\.\(canSetPrices\s*\?\s*\{ unit_cost: \{ from: cur\.unit_cost/.test(actionsSrc))
t('app: AI-indsigter (avance) kræver begge kost-nøgler', /hasPermission\('economy\.cost_prices'\) \|\| !ctx\.hasPermission\('materials\.view\.cost_prices'\)/.test(src('src/app/api/dashboard/ai-insights/route.ts')))
t('app: work_order_profit læses aldrig med brugerens klient', (() => {
  const offenders: string[] = []
  const walk = (d: string) => { for (const e of readdirSync(join(process.cwd(), d), { withFileTypes: true })) {
    const rel = `${d}/${e.name}`
    if (e.isDirectory()) walk(rel)
    else if (/\.(ts|tsx)$/.test(e.name)) { const s = src(rel); if (/from\(['"]work_order_profit['"]\)/.test(s) && !/createAdminClient\(\)/.test(s)) offenders.push(rel) }
  } }
  walk('src')
  return offenders.length === 0
})())
const rollback = src('docs/runbooks/mp-00248-rollback.sql')
t('rollback: afviser ved NULL og sætter intet til 0', /RAISE EXCEPTION/.test(rollback) && !/UPDATE\s+public\.case_materials/i.test(rollback))

// ---- 00248 adgang: kost kun via loaderen bag ret ----
t('migration: tabel-SELECT fjernes og kolonner gives tilbage', /REVOKE SELECT ON public\.case_materials FROM anon, authenticated/.test(mig) && /GRANT SELECT \(%s\) ON public\.case_materials TO authenticated/.test(mig))
t('migration: kostkolonnerne udelades', /column_name NOT IN \('unit_cost', 'total_cost'\)/.test(mig))
t('migration: fejler hvis kosten stadig kan læses', /has_column_privilege\('authenticated', 'public\.case_materials', 'unit_cost', 'SELECT'\)/.test(mig))
t('migration: ingen rolle-tjek', !/user_role\(\)/.test(mig.replace(/^--.*$/gm, '')))
t('rollback: tabel-SELECT gives tilbage', /GRANT SELECT ON public\.case_materials TO authenticated/.test(rollback))

const cols00100 = Array.from(src('supabase/migrations/00100_case_materials.sql').matchAll(/^\s{2}([a-z_]+)\s+(?:UUID|TEXT|NUMERIC|BOOLEAN|TIMESTAMPTZ)\b/gm)).map((x) => x[1])
const publicCols = CASE_MATERIAL_PUBLIC_COLUMNS.split(',').map((x) => x.trim())
t('offentlige kolonner = skemaet minus kost', JSON.stringify([...publicCols].sort()) === JSON.stringify(cols00100.filter((x) => x !== 'unit_cost' && x !== 'total_cost').sort()), `${publicCols.length} mod ${cols00100.length}`)
t('offentlige kolonner har ingen kost', !publicCols.includes('unit_cost') && !publicCols.includes('total_cost'))

// Ingen bruger-klient-læsning af materialekost i src (kun loaderen, som bruger admin-klienten)
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [] })
const offenders: string[] = []
for (const file of walk('src')) {
  if (file.replace(/\\/g, '/').endsWith('lib/materials/case-material-costs.ts')) continue
  const text = src(file)
  for (const m of text.matchAll(/from\('case_materials'\)([\s\S]{0,400})/g)) {
    const sel = /\.select\(\s*(['`])([^'`]*)\1/.exec(m[1])
    if (sel && (/\bunit_cost\b|\btotal_cost\b|^\s*\*\s*$/.test(sel[2]))) offenders.push(file)
  }
  if (/case_materials\s*\(\s*(\*|[^)]*\b(unit_cost|total_cost)\b)/.test(text)) offenders.push(`${file} (indlejret)`)
}
t('ingen bruger-klient-læsning af unit_cost/total_cost/* på case_materials', offenders.length === 0, offenders.join(', '))
for (const f of ['src/lib/actions/service-case-economy.ts', 'src/lib/actions/case-offer-vs-actual.ts', 'src/lib/actions/reports.ts', 'src/lib/actions/case-materials.ts']) {
  t(`${f}: kost via readCaseMaterialCosts`, src(f).includes('readCaseMaterialCosts(') || src(f).includes('listCaseMaterialsCore('))
}
t('efterkalkulation kræver materials.view.cost_prices', src('src/lib/actions/case-offer-vs-actual.ts').includes("hasPermission('materials.view.cost_prices')"))
t('loaderen er server-only registreret', src('scripts/assert-server-only-helpers.ts').includes("'src/lib/materials/case-material-costs.ts'"))
t('loaderen er ikke en server action', !/^\s*['"]use server['"]/m.test(src('src/lib/materials/case-material-costs.ts')))

// ---- Loaderen med falske klienter ----
type Q = { table: string; cols: string; ids?: string[]; filters: string[] }
function fakeClient(rows: Record<string, unknown>[], log: Q[], fail = false) {
  return {
    from(table: string) {
      const q: Q = { table, cols: '', filters: [] }
      const b = {
        select(cols: string) { q.cols = cols; return b },
        eq(col: string, v: unknown) { q.filters.push(`${col}=${v}`); return b },
        in(col: string, ids: string[]) { q.ids = ids; return b },
        order() { return b },
        range() { return b },
        then(res: (v: unknown) => void, rej: (e: unknown) => void) {
          log.push(q)
          const pick = q.ids ? rows.filter((r) => q.ids!.includes(String(r.id))) : rows
          return Promise.resolve(fail ? { data: null, error: { message: 'nej' } } : { data: pick, error: null }).then(res, rej)
        },
      }
      return b
    },
  } as never
}

async function loaderTests() {
  const safeRows = [
    { id: 'a', case_id: 'c', description: 'kendt', quantity: 2, unit: 'stk', unit_sales_price: 20, total_sales_price: 40 },
    { id: 'b', case_id: 'c', description: 'nul', quantity: 1, unit: 'stk', unit_sales_price: 5, total_sales_price: 5 },
    { id: 'u', case_id: 'c', description: 'ukendt', quantity: 1, unit: 'stk', unit_sales_price: 30, total_sales_price: 30 },
  ]
  const costRows = [
    { id: 'a', unit_cost: '12.34', total_cost: '24.68' },
    { id: 'b', unit_cost: '0', total_cost: '0' },
    { id: 'u', unit_cost: null, total_cost: null },
    { id: 'x', unit_cost: '99.99', total_cost: '99.99' },
  ]
  const run = async (perms: string[], opts: { adminFail?: boolean; userFail?: boolean; visible?: boolean } = {}) => {
    const userLog: Q[] = [], adminLog: Q[] = []
    const res = await listCaseMaterialsCore({
      supabase: fakeClient(safeRows, userLog, opts.userFail),
      admin: fakeClient(costRows, adminLog, opts.adminFail),
      hasPermission: (k) => perms.includes(k),
      canViewCase: async () => opts.visible ?? true,
    }, 'c')
    return { res, userLog, adminLog }
  }

  const none = await run(['materials.view'])
  t('loader uden ret: admin-klienten bruges ikke', none.adminLog.length === 0)
  t('loader uden ret: bruger-klienten vælger kun offentlige kolonner', none.userLog.every((q) => q.cols === CASE_MATERIAL_PUBLIC_COLUMNS))
  t('loader uden ret: null på alle linjer', none.res.success && none.res.data.rows.every((r) => r.unit_cost === null && r.total_cost === null))
  t('loader uden ret: summen og antal ukendte er skjult', none.res.success && none.res.data.summary.total_cost === null && none.res.data.summary.unknown_cost_lines === null && none.res.data.summary.contribution_margin === null)
  t('loader uden ret: ingen kostværdi i svaret', !/12\.34|24\.68|99\.99/.test(JSON.stringify(none.res)))

  const withPerm = await run(['materials.view', 'materials.view.cost_prices'])
  const row = (d: string) => (withPerm.res.success ? withPerm.res.data.rows.find((r) => r.description === d) : undefined)
  t('loader med ret: admin læser kun id\'er brugerens klient returnerede', withPerm.adminLog.length === 1 && JSON.stringify(withPerm.adminLog[0].ids) === JSON.stringify(['a', 'b', 'u']))
  t('loader med ret: admin læser kun kostkolonner', withPerm.adminLog[0]?.cols === 'id, unit_cost, total_cost')
  t('loader med ret: kendt kost', row('kendt')?.unit_cost === 12.34 && row('kendt')?.total_cost === 24.68)
  t('loader med ret: rigtig 0', row('nul')?.unit_cost === 0 && row('nul')?.total_cost === 0)
  t('loader med ret: ukendt er null', row('ukendt')?.unit_cost === null)
  t('loader med ret: fremmed række kommer ikke med', !JSON.stringify(withPerm.res).includes('99.99'))
  t('loader med ret: sum ukendt, kendt 24,68, 1 ukendt', withPerm.res.success && withPerm.res.data.summary.total_cost === null && withPerm.res.data.summary.total_cost_known === 24.68 && withPerm.res.data.summary.unknown_cost_lines === 1)

  const adminFail = await run(['materials.view', 'materials.view.cost_prices'], { adminFail: true })
  t('loader: fejlet kostlæsning er fejl, ikke 0', !adminFail.res.success)
  const userFail = await run(['materials.view', 'materials.view.cost_prices'], { userFail: true })
  t('loader: fejlet rækkelæsning er fejl', !userFail.res.success && userFail.adminLog.length === 0)
  const hidden = await run(['materials.view', 'materials.view.cost_prices'], { visible: false })
  t('loader: usynlig sag giver ingen rækker og ingen admin-læsning', hidden.res.success && hidden.res.data.rows.length === 0 && hidden.adminLog.length === 0 && hidden.userLog.length === 0)
  const noView = await run([])
  t('loader: uden materials.view afvist', !noView.res.success)

  t('readCaseMaterialCosts uden ret: hidden', (await readCaseMaterialCosts({ hasPermission: () => false, admin: fakeClient(costRows, []) }, ['a'])).state === 'hidden')
  const direct = await readCaseMaterialCosts({ hasPermission: () => true, admin: fakeClient(costRows, []) }, ['a', 'u'])
  t('readCaseMaterialCosts: tal og null', direct.state === 'ok' && direct.byId.get('a')?.unit_cost === 12.34 && direct.byId.get('u')?.unit_cost === null)
  t('withCosts: skjult giver null', withCosts([{ id: 'a' }], { state: 'hidden' })[0].unit_cost === null)
}

loaderTests().then(() => {
  if (bad) { console.error(`case-material-unknown-cost-test: ${bad} fejl, ${passed} bestået`); process.exit(1) }
  console.log(`case-material-unknown-cost-test ok (${passed} bestået)`)
}).catch((e) => { console.error(e); process.exit(1) })
