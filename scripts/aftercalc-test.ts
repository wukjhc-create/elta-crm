/**
 * Efterkalkulation V1. Ingen DB.
 *   npx tsx scripts/aftercalc-test.ts
 */
import { buildCaseAftercalc, toOre, type AftercalcInput, type CaseAftercalc } from '../src/lib/cases/aftercalc'
import { selectOverviewPage, takeCaseWindow, type AftercalcOverviewItem } from '../src/lib/cases/aftercalc-overview'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

const ore = (n: number | null) => (n == null ? null : toOre(n))
const codes = (r: CaseAftercalc) => r.warnings.map((w) => w.code)
const has = (r: CaseAftercalc, code: string) => codes(r).includes(code as never)

function base(): AftercalcInput {
  return {
    offer: { id: 'o1', offer_number: 'T-1', total_amount: 20000, discount_percentage: 0, discount_amount: 0 },
    offerLines: [
      { id: 'S', description: 'Sektion', quantity: 1, unit: 'stk', total: 99999, cost_price: 99999, line_type: 'section' },
      { id: 'L1', description: 'Montage', quantity: 10, unit: 'timer', total: 8000, cost_price: 400, line_type: 'product' },
      { id: 'L2', description: 'Inverter', quantity: 1, unit: 'stk', total: 12000, cost_price: 8000, supplier_product_id: 'SP1', line_type: 'product' },
    ],
    materials: [
      { id: 'M1', description: 'Inverter', quantity: 1, unit: 'stk', total_cost: 8000, unit_cost: 8000, supplier_product_id: 'SP1', source_offer_line_id: 'L2', billable: true, invoice_line_id: 'IL1' },
    ],
    otherCosts: [],
    timeLogs: [
      { hours: 10, cost_amount: 4000, billable: true, end_time: '2026-10-01T10:00:00Z', approval_status: 'approved', invoice_line_id: 'IL2' },
    ],
    invoices: [
      { total_amount: 20000, final_amount: 25000, amount_paid: 25000, status: 'paid', invoice_type: 'standard', voided_at: null },
    ],
    workOrders: [{ id: 'w1', status: 'done' }],
  }
}

ok(toOre('336,63') === 33663 && toOre(0.1 + 0.2) === 30 && toOre('1.005') === 101 && toOre(null) === null && toOre(0) === 0 && toOre('-200') === -20000, 'øre uden flydende komma')

// 1. Normal sag
const normal = buildCaseAftercalc(base())
ok(ore(normal.quoted.revenue) === 2000000 && ore(normal.quoted.material_cost) === 800000 && ore(normal.quoted.labour_cost) === 400000, '1 normal tilbudt', JSON.stringify(normal.quoted))
ok(normal.quoted.labour_hours === 10 && ore(normal.quoted.other_cost) === 0 && ore(normal.quoted.total_cost) === 1200000, '1 normal timer og samlet kost')
ok(ore(normal.quoted.contribution_margin) === 800000 && normal.quoted.contribution_margin_pct === 40, '1 normal DB 40 %')
ok(ore(normal.actual.revenue) === 2000000 && ore(normal.actual.contribution_margin) === 800000 && normal.variance.contribution_margin.amount === 0, '1 normal faktisk = tilbudt')
ok(normal.data_quality === 'ok' && normal.warnings.length === 0 && normal.invoiced_state === 'fully_invoiced', '1 normal ingen advarsler')
ok(normal.lines.find((r) => r.kind === 'labour')?.status === 'as_offered' && normal.lines.find((r) => r.key === 'L2')?.status === 'as_offered', '1 normal linjer som tilbudt')
ok(!normal.lines.some((r) => r.key === 'S'), '1 sektionslinje indgår ikke')

// 2. Over budget timer
const overIn = base()
overIn.timeLogs[0].hours = 12
overIn.timeLogs[0].cost_amount = 4800
const overRes = buildCaseAftercalc(overIn)
ok(overRes.actual.labour_hours === 12 && ore(overRes.variance.labour_hours.amount) === 200 && overRes.variance.labour_hours.pct === 20, '2 timer over budget', JSON.stringify(overRes.variance.labour_hours))
ok(ore(overRes.variance.labour_cost.amount) === 80000 && ore(overRes.actual.contribution_margin) === 720000 && ore(overRes.variance.contribution_margin.amount) === -80000, '2 lønkost og DB falder 800 kr')
ok(overRes.lines.find((r) => r.kind === 'labour')?.status === 'over', '2 timelinje over budget')

// 3. Under budget materialer
const underIn = base()
underIn.materials[0].unit_cost = 6000
underIn.materials[0].total_cost = 6000
const under = buildCaseAftercalc(underIn)
ok(ore(under.variance.material_cost.amount) === -200000 && under.lines.find((r) => r.key === 'L2')?.status === 'under', '3 materialer under budget')
ok(ore(under.actual.contribution_margin) === 1000000 && ore(under.variance.contribution_margin.amount) === 200000, '3 DB stiger 2.000 kr')

// 4. Ekstra arbejde
const extraIn = base()
extraIn.materials.push({ id: 'M2', description: 'Ekstra beslag', quantity: 1, unit: 'stk', total_cost: 500, unit_cost: 500, billable: true, invoice_line_id: 'IL3' })
const extra = buildCaseAftercalc(extraIn)
ok(extra.lines.find((r) => r.key === 'M2')?.status === 'not_offered' && extra.extra_not_offered.some((h) => h.description === 'Ekstra beslag') && has(extra, 'unlinked_materials'), '4 ekstra linje er ikke tilbudt')
ok(ore(extra.variance.material_cost.amount) === 50000 && extra.worst[0]?.description === 'Ekstra beslag', '4 merkost 500 kr er største negative afvigelse', JSON.stringify(extra.worst))

// 5. Kreditnota
const creditIn = base()
creditIn.invoices.push({ total_amount: 5000, final_amount: 6250, status: 'sent', invoice_type: 'credit', voided_at: null })
const credit = buildCaseAftercalc(creditIn)
ok(ore(credit.actual.revenue) === 1500000 && has(credit, 'credit_notes') && credit.data_quality === 'ok', '5 kreditnota trækker 5.000 fra', JSON.stringify(credit.actual.revenue))
const creditNeg = base()
creditNeg.invoices = [
  { total_amount: 20000, status: 'sent', invoice_type: 'standard', voided_at: '2026-10-02T00:00:00Z' },
  { total_amount: -20000, status: 'sent', invoice_type: 'credit', voided_at: null },
]
ok(buildCaseAftercalc(creditNeg).actual.revenue === 0, '5 fuldt krediteret original udlignes én gang')
const cancelled = base()
cancelled.invoices.push({ total_amount: 50000, status: 'cancelled', invoice_type: 'standard', voided_at: null })
ok(buildCaseAftercalc(cancelled).actual.revenue === 20000, '5 annulleret faktura tæller ikke')
const voidStatus = base()
voidStatus.invoices.push({ total_amount: 8000, status: 'void', invoice_type: 'standard', voided_at: null })
ok(buildCaseAftercalc(voidStatus).actual.revenue === 20000, '5 status void tæller ikke')

// 6. Afviste timer
const rejIn = base()
rejIn.timeLogs.push({ hours: 5, cost_amount: 2000, billable: true, end_time: '2026-10-01T12:00:00Z', approval_status: 'rejected', invoice_line_id: null })
const rej = buildCaseAftercalc(rejIn)
ok(rej.actual.labour_hours === 10 && ore(rej.actual.labour_cost) === 400000 && has(rej, 'rejected_hours'), '6 afviste timer indgår ikke', JSON.stringify({ h: rej.actual.labour_hours, c: rej.actual.labour_cost }))

// 7. Manglende kost
const missIn = base()
missIn.timeLogs[0].cost_amount = null
const miss = buildCaseAftercalc(missIn)
ok(miss.actual.labour_cost == null && miss.actual.contribution_margin == null && miss.variance.labour_cost.amount == null, '7 manglende lønkost gør DB ukendt')
const labourMiss = miss.lines.find((r) => r.kind === 'labour')!
ok(has(miss, 'missing_frozen_labour_cost') && labourMiss.status === 'missing_cost' && labourMiss.actual_cost == null && labourMiss.cost_deviation == null && miss.data_quality === 'warning', '7 manglende faktisk lønkost er ikke en besparelse')
const missMat = base()
missMat.materials[0].unit_cost = null
missMat.materials[0].total_cost = null
const missMatRes = buildCaseAftercalc(missMat)
const matMiss = missMatRes.lines.find((r) => r.key === 'L2')!
ok(missMatRes.actual.material_cost == null && missMatRes.actual.contribution_margin == null && matMiss.status === 'missing_cost' && matMiss.cost_deviation == null, '7 manglende materialekost er ikke 0')

// 8. Delvis faktura
const partIn = base()
partIn.materials[0].invoice_line_id = null
const part = buildCaseAftercalc(partIn)
ok(part.invoiced_state === 'partially_invoiced' && has(part, 'partial_invoice') && ore(part.actual.revenue) === 2000000, '8 delvist faktureret beholder udstedt omsætning')

// 9. Slutfaktura
const finIn = base()
finIn.invoices[0].invoice_type = 'final'
const fin = buildCaseAftercalc(finIn)
ok(fin.invoiced_state === 'fully_invoiced' && has(fin, 'final_invoice') && fin.data_quality === 'ok', '9 slutfaktura er info, ikke et hul')

// 10. Intet tilbud
const noOffer = base()
noOffer.offer = null
noOffer.offerLines = []
const noOfferRes = buildCaseAftercalc(noOffer)
ok(noOfferRes.quoted.revenue == null && noOfferRes.quoted.contribution_margin == null && has(noOfferRes, 'missing_offer') && has(noOfferRes, 'invoice_without_offer'), '10 intet tilbud', JSON.stringify(noOfferRes.quoted))
ok(ore(noOfferRes.actual.revenue) === 2000000 && noOfferRes.variance.revenue.amount == null, '10 faktisk omsætning står, afvigelse er ukendt')

// 11. Ingen faktura
const noInv = base()
noInv.invoices = []
noInv.materials[0].invoice_line_id = null
noInv.timeLogs[0].invoice_line_id = null
const noInvRes = buildCaseAftercalc(noInv)
ok(noInvRes.actual.revenue === 0 && ore(noInvRes.actual.contribution_margin) === -1200000 && noInvRes.actual.contribution_margin_pct == null, '11 ingen faktura: DB er minus kosten, procent er ukendt')
ok(noInvRes.invoiced_state === 'not_invoiced' && has(noInvRes, 'unbilled_work'), '11 ikke-faktureret arbejde')

// 12. Blandet fakturerbar / ikke-fakturerbar
const mix = base()
mix.offerLines[1] && (mix.offerLines.find((l) => l.id === 'L1')!.quantity = 8)
mix.timeLogs = [
  { hours: 8, cost_amount: 3200, billable: true, end_time: '2026-10-01T10:00:00Z', approval_status: 'approved', invoice_line_id: 'IL2' },
  { hours: 2, cost_amount: 800, billable: false, end_time: '2026-10-01T12:00:00Z', approval_status: 'approved', invoice_line_id: null },
]
const mixRes = buildCaseAftercalc(mix)
ok(mixRes.quoted.labour_hours === 8 && mixRes.actual.labour_hours === 10 && ore(mixRes.actual.labour_cost) === 400000, '12 ikke-fakturerbare timer indgår i tid og lønkost')
ok(has(mixRes, 'non_billable_hours') && ore(mixRes.actual.revenue) === 2000000 && !has(mixRes, 'unbilled_work') && !has(mixRes, 'partial_invoice'), '12 de tæller ikke som omsætning eller ufaktureret salg')

// 13. Nul
const zero = buildCaseAftercalc({
  offer: { id: 'o0', offer_number: 'T-0', total_amount: 0, discount_percentage: 0, discount_amount: 0 },
  offerLines: [{ id: 'Z', description: 'Tom', quantity: 0, unit: 'stk', total: 0, cost_price: 0 }],
  materials: [],
  otherCosts: [],
  timeLogs: [],
  invoices: [],
  workOrders: [{ id: 'w0', status: 'done' }],
})
ok(zero.quoted.contribution_margin === 0 && zero.quoted.contribution_margin_pct == null && zero.actual.contribution_margin === 0, '13 nul giver DB 0 og ingen DB-procent')
ok(zero.variance.revenue.amount === 0 && zero.variance.revenue.pct == null && zero.data_quality === 'ok', '13 afvigelse i kroner er 0, procent er ukendt')

// 14. Negativ justering
const neg = base()
neg.otherCosts.push({ id: 'O1', description: 'Kreditering fragt', quantity: 1, total_cost: -200, unit_cost: -200, billable: true, invoice_line_id: 'IL9' })
const negRes = buildCaseAftercalc(neg)
ok(ore(negRes.actual.other_cost) === -20000 && ore(negRes.actual.total_cost) === 1180000 && ore(negRes.actual.contribution_margin) === 820000, '14 negativ øvrig kost øger DB')
ok(ore(negRes.variance.contribution_margin.amount) === 20000, '14 DB-afvigelse +200 kr')
const negInv = base()
negInv.invoices = [{ total_amount: -1000, status: 'sent', invoice_type: 'standard', voided_at: null }]
negInv.materials[0].invoice_line_id = 'IL1'
ok(buildCaseAftercalc(negInv).actual.revenue === -1000, '14 negativ slutfaktura beholder fortegnet')

// Ens tekst uden kobling bliver ikke slået sammen
const look = base()
look.materials[0].source_offer_line_id = null
look.materials[0].supplier_product_id = null
const lookRes = buildCaseAftercalc(look)
const offered = lookRes.lines.find((r) => r.key === 'L2')!
const used = lookRes.lines.find((r) => r.key === 'M1')!
ok(offered.status === 'unmatched' && used.status === 'unmatched' && offered.actual_qty == null && used.offered_qty == null, 'ens tekst er ikke matchet og antal slås ikke sammen', JSON.stringify({ offered, used }))
ok(offered.cost_deviation == null && has(lookRes, 'unmatched_lines'), 'ikke-matchet har ingen kostafvigelse')

// Header vinder, linjesummen advarer
const header = base()
header.offer!.total_amount = 15000
const headerRes = buildCaseAftercalc(header)
ok(headerRes.quoted.revenue === 15000 && has(headerRes, 'header_line_mismatch') && ore(headerRes.quoted.contribution_margin) === 300000, 'header bruges når den afviger mere end 1 kr')

// Åben timer og kladde
const open = base()
open.timeLogs.push({ hours: 3, cost_amount: 9999, billable: true, end_time: null, approval_status: 'approved' })
open.invoices.push({ total_amount: 99999, status: 'draft', invoice_type: 'standard', voided_at: null })
open.workOrders.push({ id: 'w2', status: 'in_progress' })
const openRes = buildCaseAftercalc(open)
ok(openRes.actual.labour_hours === 10 && ore(openRes.actual.revenue) === 2000000 && has(openRes, 'open_timers') && has(openRes, 'draft_invoices_ignored') && has(openRes, 'open_work'), 'åben timer, kladde og åben ordre holdes ude af tallene')

// Frossen leverandørkost når cost_price er 0
const frozen = base()
frozen.offerLines.push({ id: 'L4', description: 'Stik', quantity: 4, unit: 'stk', total: 200, cost_price: 0, supplier_cost_price_at_creation: '25' })
const frozenRes = buildCaseAftercalc(frozen)
ok(ore(frozenRes.quoted.material_cost) === 800000 + 10000, 'frossen leverandørkost bruges når kostpris er 0', String(frozenRes.quoted.material_cost))

// 10,10 × 33,33 kr
const dec = buildCaseAftercalc({
  offer: { id: 'od', offer_number: 'T-d', total_amount: '336.63', discount_percentage: 0, discount_amount: 0 },
  offerLines: [{ id: 'D', description: 'Kabel', quantity: '10.10', unit: 'm', total: '336.63', cost_price: '33.33' }],
  materials: [],
  otherCosts: [],
  timeLogs: [],
  invoices: [],
  workOrders: [],
})
ok(ore(dec.quoted.material_cost) === 33663 && ore(dec.quoted.revenue) === 33663, '10,10 × 33,33 kr = 336,63', String(dec.quoted.material_cost))

const pennies = buildCaseAftercalc({
  offer: null,
  offerLines: [],
  materials: [
    { id: 'a', description: 'a', quantity: 1, unit: 'stk', unit_cost: 0.1, total_cost: 0.1, billable: false },
    { id: 'b', description: 'b', quantity: 1, unit: 'stk', unit_cost: 0.2, total_cost: 0.2, billable: false },
  ],
  otherCosts: [],
  timeLogs: [],
  invoices: [],
  workOrders: [],
})
ok(ore(pennies.actual.material_cost) === 30, '0,10 + 0,20 = 0,30', String(pennies.actual.material_cost))

// Tilbud uden kostgrundlag
const bare = buildCaseAftercalc({
  offer: { id: 'ob', offer_number: 'T-b', total_amount: 1000, discount_percentage: 0, discount_amount: 0 },
  offerLines: [{ id: 'B', description: 'Uden kost', quantity: 1, unit: 'stk', total: 1000, cost_price: null }],
  materials: [],
  otherCosts: [],
  timeLogs: [],
  invoices: [],
  workOrders: [],
})
ok(bare.quoted.material_cost == null && bare.quoted.contribution_margin == null && has(bare, 'offer_without_cost_basis') && has(bare, 'missing_cost_price'), 'tilbud uden kostgrundlag')

// Oversigt: sortering, filtre, side
const item = (n: string, variance: number | null, actual: number | null, quality: 'ok' | 'warning', warnings: AftercalcOverviewItem['row']['warning_codes'], created: string): AftercalcOverviewItem => ({
  actual_db: actual,
  row: {
    case_id: n, case_number: n, title: n, customer_name: null, assignee_name: null, status: 'closed', created_at: created,
    quoted_revenue: 100, actual_revenue: 100, quoted_db_pct: 10, actual_db_pct: actual, db_variance: variance, db_variance_pct_points: null,
    data_quality: quality, warning_codes: warnings, invoiced_state: 'fully_invoiced',
  },
})
const items: AftercalcOverviewItem[] = [
  item('S1', -500, -100, 'warning', ['missing_cost_price'], '2026-10-01T00:00:00Z'),
  item('S2', 200, 800, 'ok', [], '2026-10-03T00:00:00Z'),
  item('S3', null, null, 'warning', ['open_work'], '2026-10-02T00:00:00Z'),
]
const worst = selectOverviewPage(items, { sort: 'worst_db' })
ok(worst.rows.map((r) => r.case_number).join(',') === 'S1,S2,S3', 'oversigt dårligste DB-afvigelse først, ukendt sidst', worst.rows.map((r) => r.case_number).join(','))
ok(selectOverviewPage(items, { sort: 'biggest_gain' }).rows[0].case_number === 'S2', 'oversigt højeste gevinst')
ok(selectOverviewPage(items, { sort: 'biggest_loss' }).rows[0].case_number === 'S1', 'oversigt største tab')
ok(selectOverviewPage(items, { sort: 'missing_data' }).rows[0].case_number === 'S1', 'oversigt manglende data først')
ok(selectOverviewPage(items, { sort: 'newest' }).rows.map((r) => r.case_number).join(',') === 'S2,S3,S1', 'oversigt nyeste først')
ok(selectOverviewPage(items, { variance: 'negative' }).total === 1, 'oversigt kun negativ afvigelse')
ok(selectOverviewPage(items, { variance: 'positive' }).rows[0].case_number === 'S2', 'oversigt kun positiv afvigelse')
ok(selectOverviewPage(items, { missingCostOnly: true }).rows.length === 1 && selectOverviewPage(items, { missingCostOnly: true }).rows[0].case_number === 'S1', 'oversigt kun manglende kost')
const many = Array.from({ length: 30 }, (_, i) => item(`A${String(i).padStart(2, '0')}`, 0, 0, 'ok', [], `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`))
const page2 = selectOverviewPage(many, { sort: 'newest', page: 2 })
ok(page2.total === 30 && page2.page === 2 && page2.rows.length === 5, 'oversigt side 2 har resten')
ok(selectOverviewPage(many, { page: 99 }).page === 2, 'oversigt side klemmes til sidste')
const wide = Array.from({ length: 201 }, (_, i) => i)
const windowed = takeCaseWindow(wide)
ok(windowed.truncated && windowed.rows.length === 200 && windowed.rows[0] === 0 && windowed.rows[199] === 199, 'oversigt beregner højst de 200 første i listen')
ok(takeCaseWindow(wide.slice(0, 200)).truncated === false && takeCaseWindow(wide.slice(0, 200)).rows.length === 200, 'præcis 200 sager er ikke afskåret')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle efterkalkulationstests bestået')
process.exitCode = bad ? 1 : 0
