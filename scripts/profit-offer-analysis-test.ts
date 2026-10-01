/**
 * Unit-tests for lønsomhedsanalysen (src/lib/profit/offer-analysis.ts). Ingen DB.
 *   npx tsx scripts/profit-offer-analysis-test.ts
 */
import { analyzeOfferProfit, isLabourUnit } from '../src/lib/profit/offer-analysis'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

// 1) Timelinje uden kost: DB vises for højt i dag — realistisk DB medregner timekost
const a = analyzeOfferProfit({
  lines: [
    { description: 'Kabel', quantity: 10, unit: 'm', total: 1000, unitCost: 60 },
    { description: 'Montage', quantity: 8, unit: 'timer', total: 4800, unitCost: null },
  ],
  hourlyCost: 420, minimumDbPct: 20, targetDbPct: 35,
})
ok(a.knownCost === 600 && a.estimatedLabourCost === 3360, 'kendt kost + estimeret timekost', `${a.knownCost}/${a.estimatedLabourCost}`)
ok(a.dbKnownPct === 89.66 && a.dbRealisticPct === 31.72, 'DB kendt vs realistisk', `${a.dbKnownPct}% / ${a.dbRealisticPct}%`)
ok(a.verdict === 'under_maal' && a.warnings.some((w) => w.includes('mål-DB')) && a.warnings.some((w) => w.includes('timekost')), 'under mål + timekost-advarsel', a.verdict)
ok(a.costCoveragePct === 100, 'fuld dækning når timekost kendes')

// 2) Ukendt kost på materiale → usikker
const b = analyzeOfferProfit({ lines: [{ description: 'Tavle', quantity: 1, unit: 'stk', total: 10000, unitCost: null }, { description: 'Stik', quantity: 2, unit: 'stk', total: 200, unitCost: 50 }], hourlyCost: 400 })
ok(b.verdict === 'usikker' && b.unknownCostLines === 1 && b.costCoveragePct === 1.96, 'manglende kost → usikker', `${b.costCoveragePct}%`)

// 3) Rabat æder DB
const c = analyzeOfferProfit({ lines: [{ description: 'Pakke', quantity: 1, unit: 'stk', total: 1000, unitCost: 700 }], offerDiscountPct: 20, hourlyCost: null, minimumDbPct: 20 })
ok(c.sale === 800 && c.dbRealisticPct === 12.5 && c.verdict === 'under_minimum', 'rabat → under minimum', `${c.dbRealisticPct}%`)
ok(c.warnings.some((w) => w.includes('Tilbudsrabatten')), 'rabat-advarsel')

// 4) Underskud og timelinje under kost
const d = analyzeOfferProfit({ lines: [{ description: 'Arbejde', quantity: 10, unit: 't', total: 3000, unitCost: null }], hourlyCost: 400 })
ok(d.dbRealistic === -1000 && d.warnings[0].startsWith('Tilbuddet giver underskud') && d.warnings.some((w) => w.includes('under timekost')), 'underskud + timer under kost')

// 5) Ingen timekost konfigureret
const e = analyzeOfferProfit({ lines: [{ description: 'Arbejde', quantity: 2, unit: 'timer', total: 1000, unitCost: null }], hourlyCost: null })
ok(e.estimatedLabourCost === 0 && e.warnings.some((w) => w.includes('timekost er ikke sat')), 'mangler timekost → tydelig advarsel')

// 6) Enheds-genkendelse + determinisme
ok(['t', 'T.', 'timer', 'Time', 'hours'].every(isLabourUnit) && !['stk', 'm', 'tm', ''].some(isLabourUnit), 'enheds-genkendelse')
ok(JSON.stringify(analyzeOfferProfit({ lines: a.lines.map(() => ({ description: 'x', quantity: 1, unit: 'stk', total: 1, unitCost: 1 })), hourlyCost: 1 }))
  === JSON.stringify(analyzeOfferProfit({ lines: a.lines.map(() => ({ description: 'x', quantity: 1, unit: 'stk', total: 1, unitCost: 1 })), hourlyCost: 1 })), 'deterministisk')

console.log(bad ? `\n❌ ${bad} FEJL` : '\n✅ ALLE LØNSOMHEDS-TESTS PASS')
process.exit(bad ? 1 : 0)
