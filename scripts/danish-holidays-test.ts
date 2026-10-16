/**
 * Unit-tests for danske helligdage (src/lib/planning/danish-holidays.ts). Ingen DB.
 *   npx tsx scripts/danish-holidays-test.ts
 */
import { danishHolidays, easterSunday, holidayName } from '../src/lib/planning/danish-holidays'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

ok(easterSunday(2026) === '2026-04-05' && easterSunday(2027) === '2027-03-28' && easterSunday(2024) === '2024-03-31', 'påskedag 2024/2026/2027')
const h26 = danishHolidays(2026)
ok(h26.get('2026-04-02') === 'Skærtorsdag' && h26.get('2026-04-03') === 'Langfredag' && h26.get('2026-04-06') === '2. påskedag', 'påskens helligdage 2026')
ok(h26.get('2026-05-14') === 'Kristi himmelfartsdag' && h26.get('2026-05-24') === 'Pinsedag' && h26.get('2026-05-25') === '2. pinsedag', 'himmelfart/pinse 2026')
ok(h26.size === 10 && ![...h26.values()].includes('Store bededag'), 'store bededag afskaffet fra 2024 (10 dage)')
ok(danishHolidays(2023).get('2023-05-05') === 'Store bededag', 'store bededag 2023')
ok(holidayName('2026-12-25') === 'Juledag' && holidayName('2026-12-24') === null && holidayName('2026-06-05') === null, 'juleaften/grundlovsdag er ikke officielle')
ok(holidayName('2026-10-15') === null && holidayName('ugyldig') === null, 'almindelig dag / ugyldig')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
