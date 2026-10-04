/**
 * Unit-tests for N8a lav-DB-advarslen (src/lib/offers/low-db-warning.ts). Ingen DB.
 *   npx tsx scripts/offer-low-db-test.ts
 */
import { evaluateOfferLowDb, lowDbAckMessage, LOW_DB_ACK_REQUIRED } from '../src/lib/offers/low-db-warning'
import { computeOfferDB } from '../src/lib/logic/pricing'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const line = (total: number, cost: number | null, qty = 1) => ({
  quantity: qty, unit_price: total / qty, total, cost_price: cost, supplier_cost_price_at_creation: null, supplier_margin_applied: null,
})

// 1) DB 1 % under rød grænse 10 % → lav
const a = evaluateOfferLowDb([line(1000, 990)], 0, 10)
ok(a.low && a.dbPercentage === 1 && a.threshold === 10, 'DB 1% < 10% er lav', `${a.dbPercentage}%`)

// 2) DB præcis på grænsen er IKKE lav (samme regel som trafiklyset: < rød)
const b = evaluateOfferLowDb([line(1000, 900)], 0, 10)
ok(!b.low && b.dbPercentage === 10, 'DB = grænse er ikke lav', `${b.dbPercentage}%`)

// 3) Ingen kostpriser → kan ikke vurderes → ingen advarsel (men hasAnyCost=false)
const c = evaluateOfferLowDb([line(1000, null), line(500, 0)], 0, 10)
ok(!c.low && !c.hasAnyCost, 'uden kostpriser: ingen advarsel')

// 4) Tilbudsrabat æder DB: 20 % DB før rabat, 15 % rabat → under 10 %
const d = evaluateOfferLowDb([line(1000, 800)], 15, 10)
ok(d.low && d.dbPercentage < 10, 'rabat sender DB under grænsen', `${d.dbPercentage}%`)

// 5) Sund DB → ikke lav
const e = evaluateOfferLowDb([line(1000, 600), line(2000, 1200)], 0, 10)
ok(!e.low && e.dbPercentage === 40, 'DB 40% er ikke lav', `${e.dbPercentage}%`)

// 6) Fejlbesked har fast præfiks (klienten genkender den) og dansk tekst med tal
const m = lowDbAckMessage(a)
ok(m.startsWith(`${LOW_DB_ACK_REQUIRED}:`) && m.includes('1%') && m.includes('minimum 10%'), 'bekræftelses-besked', m)

// 7) N25: salgslinjer uden kost tælles (DB overvurderet); linjer med 0 kr salg tælles ikke
const n = computeOfferDB([line(1000, 600), line(500, null), line(300, 0), line(0, null)])
ok(n.linesWithoutCost === 2, 'N25: 2 salgslinjer uden kostpris', String(n.linesWithoutCost))
ok(computeOfferDB([line(1000, 600)]).linesWithoutCost === 0, 'N25: alle linjer med kost → 0')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle lav-DB-tests bestået')
process.exitCode = bad ? 1 : 0
