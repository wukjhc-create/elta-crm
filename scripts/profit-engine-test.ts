/**
 * Unit-test af Profit Engine (P3 #18). Faste tal, ingen DB.
 *   npx tsx scripts/profit-engine-test.ts
 */
import { priceJob, markupToDb, dbToMarkup, unitSalePrice, legacyDiscountOnCost } from '../src/lib/profit/engine'
import { calculateSalePrice, calculateDBPercentage, computeOfferDB } from '../src/lib/logic/pricing'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps

// begreber
assert(markupToDb(25) === 20 && dbToMarkup(20) === 25, 'avance 25 % = DB 20 % (og omvendt)')
assert(markupToDb(100) === 50 && dbToMarkup(50) === 100, 'avance 100 % = DB 50 %')
assert(near(unitSalePrice(100, { mode: 'target_db', dbPct: 20 }), 125) && near(unitSalePrice(100, { mode: 'markup', markupPct: 25 }), 125), 'mål-DB 20 % og avance 25 % giver samme pris')

// kompatibilitet med pricing.ts uden rabatter
assert(near(unitSalePrice(80, { mode: 'markup', markupPct: 30 }), calculateSalePrice(80, 30)), 'avance-tilstand = pricing.calculateSalePrice (uden rabatter)')

// komplet opgave
const job = priceJob({
  lines: [
    { kind: 'material', description: 'Tavle', quantity: 1, unitListCost: 2000, supplierDiscountPct: 25, policy: { mode: 'markup', markupPct: 30 } },
    { kind: 'material', description: 'Kabel', quantity: 50, unitListCost: 10, policy: { mode: 'target_db', dbPct: 35 } },
    { kind: 'labour', description: 'Elektriker', hours: 8, costPerHour: 380, salePerHour: 595 },
  ],
  labourRiskPct: 10, overheadPctOfDirectCost: 8, minimumDbPct: 25,
})
// tavle: net 1500 -> salg 1950; kabel: net 500 -> 769,23; timer 8,8: kost 3344, salg 5236
assert(job.directCost === 5344 && near(job.saleBeforeDiscount, 7955.23), 'direkte kost og salg', `${job.directCost} / ${job.saleBeforeDiscount}`)
assert(job.db1 === round(7955.23 - 5344) && near(job.db1Pct, calculateDBPercentage(5344, 7955.23), 0.5), 'DB1 = salg − direkte kost (samme definition som pricing.ts)', `${job.db1Pct}%`)
assert(job.overhead === 427.52 && near(job.db2, job.db1 - 427.52), 'DB2 = DB1 − overhead (8 % af direkte kost)')
assert(job.warnings.length === 0, 'ingen advarsler når DB ≥ minimum', job.warnings.join('; '))

// kunderabat: saenker salg, IKKE kost
{
  const r = priceJob({ lines: [{ kind: 'material', description: 'X', quantity: 1, unitListCost: 100, policy: { mode: 'markup', markupPct: 25 } }], customerDiscountPct: 10 })
  assert(r.directCost === 100 && r.sale === 112.5 && r.db1 === 12.5 && r.db1Pct === 11.11, 'kunderabat 10 % på avance 25 %: salg 112,50, DB 11,11 % (reel)')
  const legacy = legacyDiscountOnCost(100, 25, 10)
  assert(legacy.sale === 112.5 && legacy.reportedDbPct === 20 && legacy.trueDbPct === 11.11, 'dagens logik: samme salgspris, men rapporterer DB 20 % (reelt 11,11 %)', JSON.stringify(legacy))
}

// advarsler
{
  const r = priceJob({ lines: [{ kind: 'labour', description: 'Lærling', hours: 1, costPerHour: 300, salePerHour: 250 }, { kind: 'material', description: 'Uden pris', quantity: 1, unitListCost: 0, policy: { mode: 'markup', markupPct: 20 } }], minimumDbPct: 20 })
  assert(r.warnings.some((w) => /under timeomkostning/.test(w)) && r.warnings.some((w) => /mangler kostpris/.test(w)) && r.warnings.some((w) => /underskud/.test(w)) && r.warnings.some((w) => /under minimum/.test(w)), 'advarsler: timepris < kost, manglende kost, underskud, under minimum-DB')
}
let threw = false
try { unitSalePrice(100, { mode: 'target_db', dbPct: 100 }) } catch { threw = true }
assert(threw, 'mål-DB 100 % afvises')

// determinisme
const a = JSON.stringify(priceJob({ lines: [{ kind: 'material', description: 'A', quantity: 3, unitListCost: 33.33, supplierDiscountPct: 12.5, policy: { mode: 'target_db', dbPct: 27 } }] }))
assert(a === JSON.stringify(priceJob({ lines: [{ kind: 'material', description: 'A', quantity: 3, unitListCost: 33.33, supplierDiscountPct: 12.5, policy: { mode: 'target_db', dbPct: 27 } }] })), 'samme input -> identisk resultat')

// send-gaten: tilbudsrabat skal med i DB (P3 #18-fund)
{
  const items = [{ quantity: 1, unit_price: 125, total: 125, cost_price: 100, supplier_cost_price_at_creation: null, supplier_margin_applied: null }]
  const noDisc = computeOfferDB(items)
  const disc = computeOfferDB(items, 30)
  assert(noDisc.dbPercentage === 20 && disc.totalSale === 87.5 && disc.dbPercentage < 0, 'computeOfferDB med 30 % tilbudsrabat: DB negativ (før: 20 % og tilbuddet kunne sendes)', `${noDisc.dbPercentage}% -> ${disc.dbPercentage}%`)
  assert(computeOfferDB(items, 0).dbPercentage === noDisc.dbPercentage, 'uden rabat: uændret (bagudkompatibel)')
}

function round(x: number) { return Math.round(x * 100) / 100 }
console.log(`\n${fails === 0 ? '✅ ALLE PROFIT ENGINE-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
