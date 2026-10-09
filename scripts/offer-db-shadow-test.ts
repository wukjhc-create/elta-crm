/**
 * Profit Engine trin 2: reel DB efter tilbudsrabat, ved siden af tallet uden rabat.
 *   npx tsx scripts/offer-db-shadow-test.ts
 */
import fs from 'fs'
import { shadowOfferDb } from '../src/lib/profit/offer-shadow'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
  if (!cond) fails++
}

const line = {
  description: 'Tavle',
  quantity: 1,
  unit: 'stk',
  unit_price: 125,
  total: 125,
  cost_price: 100,
  supplier_cost_price_at_creation: null,
  supplier_margin_applied: 25,
}

{
  const s = shadowOfferDb([line], 30)
  assert(s.before.totalSale === 125 && s.before.dbPercentage === 20, 'uden rabat: salg 125, DB 20 %', `${s.before.totalSale} / ${s.before.dbPercentage}`)
  assert(s.after.totalSale === 87.5 && s.after.totalCost === 100 && s.after.dbAmount === -12.5 && s.after.dbPercentage < 0, '30 % rabat sænker salget, kost bliver 100', `${s.after.totalSale} / ${s.after.dbAmount} / ${s.after.dbPercentage}%`)
  assert(s.differs, 'de to DB-tal er ikke ens')
  assert(s.engine != null && s.engine.directCost === 100 && s.engine.sale === 87.5 && s.engine.db1 === -12.5, 'motoren bruger fuld kost og samme salg', JSON.stringify(s.engine))
  assert(s.engine != null && s.engine.db1Pct < 0 && Math.abs(s.engine.db1Pct - (s.after.dbAmount / s.after.totalSale) * 100) < 0.02, 'motorens DB% er den reelle', String(s.engine?.db1Pct))
}

{
  const s = shadowOfferDb([line], 0)
  assert(!s.differs && s.before.dbPercentage === s.after.dbPercentage && s.engine?.sale === 125, 'uden rabat: samme DB, motorens salg er linjens')
}

{
  const labour = {
    description: 'Elektriker',
    quantity: 2,
    unit: 'timer',
    unit_price: 200,
    total: 400,
    cost_price: 380,
    supplier_cost_price_at_creation: null,
    supplier_margin_applied: null,
  }
  const s = shadowOfferDb([labour], 0)
  assert(s.engine != null && s.engine.warnings.some((w) => /under timeomkostning/.test(w)), 'timelinje under kost giver motorens advarsel', s.engine?.warnings.join('; '))
  assert(s.engine != null && s.engine.directCost === 760, 'timekost er sats × timer, ikke 0', String(s.engine?.directCost))
}

{
  const missing = { ...line, cost_price: null, total: 125 }
  const s = shadowOfferDb([missing], 10)
  assert(s.engine === null, 'manglende kost bliver ikke 0 i motoren')
  assert(s.after.totalCost === 0 && s.after.linesWithoutCost === 1, 'den gamle visning tæller stadig manglende kost som 0 og siger det', `${s.after.totalCost} / ${s.after.linesWithoutCost}`)
}

{
  const table = fs.readFileSync('src/components/shared/line-items-table.tsx', 'utf8')
  const page = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
  assert(table.includes('shadowOfferDb') && table.includes('offer-db-shadow') && table.includes('offerDiscountPercentage'), 'linjefoden kalder skyggen')
  assert(page.includes('offerDiscountPercentage={Number(offer.discount_percentage'), 'tilbudssiden sender rabatten med')
  assert(!table.includes('computeOfferDB(items)'), 'linjefoden regner ikke længere DB uden rabat')
}

console.log(fails === 0 ? '\n✅ alle tilbud-skygge-tests bestået' : `\n❌ ${fails} FEJL`)
process.exit(fails === 0 ? 0 : 1)
