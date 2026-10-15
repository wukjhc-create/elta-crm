/**
 * Unit-test (ingen DB) for arbejdskost-modellen (lib/labour/labour-cost.ts — forslag 2026-10-14).
 *   npx tsx scripts/labour-cost-test.ts
 */
import { resolveLabourCostRate, labourCostFor, FALLBACK_LABOUR_COST_RATE } from '../src/lib/labour/labour-cost'
import { FALLBACK_COST_RATE } from '../src/lib/services/rates'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const r = resolveLabourCostRate

ok(FALLBACK_LABOUR_COST_RATE === FALLBACK_COST_RATE, 'én fallback-værdi (modellen = services/rates.ts)', `${FALLBACK_LABOUR_COST_RATE} vs ${FALLBACK_COST_RATE}`)
ok(r({}).rate === 400 && r({}).source === 'fallback', 'intet sat → central fallback 400')
ok(r({ companyStandardRate: 420 }).source === 'company_standard' && r({ companyStandardRate: 420 }).rate === 420, 'firmaets standard-timekost før fallback')
ok(r({ snapshotRate: 512, explicit: { rate: 295, label: 'apprentice' }, employee: { realHourlyCost: 480 }, companyStandardRate: 420 }).source === 'snapshot', 'frosset faktisk kost vinder over alt')
ok(r({ explicit: { rate: 295, label: 'apprentice' }, employee: { realHourlyCost: 480 } }).rate === 295, '295 kun når lærlingesats er eksplicit valgt')
ok(r({ employee: { realHourlyCost: 480, internalCostRate: 450 } }).rate === 480, 'basis real_hourly_cost: reel timekost først')
ok(r({ basis: 'internal_cost_rate', employee: { realHourlyCost: 480, internalCostRate: 450 } }).rate === 450, 'basis internal_cost_rate: intern sats først')
ok(r({ basis: 'fixed_standard_rate', employee: { realHourlyCost: 480, internalCostRate: 450 }, companyStandardRate: 420 }).rate === 420, 'basis fixed_standard_rate: standard-timekost')
ok(r({ employee: { realHourlyCost: 0, internalCostRate: null } }).source === 'fallback', 'real_hourly_cost = 0 (tom løn) tælles IKKE som kost 0 → fallback')
ok(r({ snapshotRate: 0, companyStandardRate: 420 }).rate === 420, 'snapshot 0 = mangler (ikke frosset 0)')
ok(r({ explicit: { rate: NaN, label: 'manual' } }).source === 'fallback', 'ugyldig eksplicit sats ignoreres')
const c = labourCostFor(2.5, { employee: { realHourlyCost: 401.33 } })
ok(c.amount === 1003.33 && c.source === 'employee_real', 'kost for timer afrundes til øre', `${c.amount}`)
ok(labourCostFor(-3, {}).amount === 0, 'negative timer giver 0 kost')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ arbejdskost-model ok')
process.exitCode = bad ? 1 : 0
