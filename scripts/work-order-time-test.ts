/**
 * Unit-tests for tidspunkt/varighed på arbejdsordrer (src/lib/planning/work-order-time.ts, 00227). Ingen DB.
 *   npx tsx scripts/work-order-time-test.ts
 */
import { compareByStartTime, formatWorkOrderTime, parseEstimatedHours, parseStartTime, workOrdersOverlap } from '../src/lib/planning/work-order-time'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const v = <T,>(r: { ok: boolean; value?: T }) => (r.ok ? r.value : 'ERR')

ok(v(parseStartTime('')) === null && v(parseStartTime(null)) === null, 'tomt tidspunkt = null (intet gæt)')
ok(v(parseStartTime('8:05')) === '08:05' && v(parseStartTime('07:30:00')) === '07:30', 'normaliserer TT:MM')
ok(!parseStartTime('24:00').ok && !parseStartTime('kl 8').ok && !parseStartTime('12:60').ok, 'ugyldige tider afvises')
ok(v(parseEstimatedHours('')) === null && v(parseEstimatedHours(undefined)) === null, 'tom varighed = null')
ok(v(parseEstimatedHours('3,5')) === 3.5 && v(parseEstimatedHours(4)) === 4, 'dansk decimal')
ok(!parseEstimatedHours('0').ok && !parseEstimatedHours('25').ok && !parseEstimatedHours('abc').ok, '0, >24 og tekst afvises')
ok(formatWorkOrderTime('08:00:00', 4) === '08:00–12:00', 'tid + varighed', formatWorkOrderTime('08:00:00', 4))
ok(formatWorkOrderTime('22:00', 4) === '22:00 (4 t)', 'over midnat vises som varighed')
ok(formatWorkOrderTime(null, '2.5') === '2,5 t' && formatWorkOrderTime('09:15', null) === '09:15' && formatWorkOrderTime(null, null) === '', 'delvise værdier')
const sorted = [{ start_time: null, created_at: '1' }, { start_time: '10:00', created_at: '2' }, { start_time: '07:30', created_at: '3' }].sort(compareByStartTime)
ok(sorted.map((x) => x.start_time ?? '-').join(',') === '07:30,10:00,-', 'sortering: med tid først, stigende')
ok(workOrdersOverlap({ start_time: '08:00', estimated_hours: 4 }, { start_time: '11:00', estimated_hours: 2 }), 'overlap 08–12 / 11–13')
ok(!workOrdersOverlap({ start_time: '08:00', estimated_hours: 4 }, { start_time: '12:00', estimated_hours: 2 }), 'stød-til-stød er ikke overlap')
ok(!workOrdersOverlap({ start_time: '08:00', estimated_hours: null }, { start_time: '08:00', estimated_hours: 2 }), 'uden varighed: intet overlap-gæt')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
