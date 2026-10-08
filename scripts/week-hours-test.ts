/** Unit: ugeoverblik over timer (dansk kalender). Kør: npx tsx scripts/week-hours-test.ts */
import { danishWeekStart, summarizeWeekHours } from '../src/lib/time/week-hours'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`) }
// 2026-10-01 er en torsdag
eq('ugestart torsdag → mandag 28/9', danishWeekStart(new Date('2026-10-01T10:00:00Z')), '2026-09-28')
eq('søndag 23:30 dansk hører til ugen (21:30Z)', danishWeekStart(new Date('2026-10-04T21:30:00Z')), '2026-09-28')
eq('mandag 00:30 dansk = ny uge (søndag 22:30Z)', danishWeekStart(new Date('2026-10-04T22:30:00Z')), '2026-10-05')
eq('forrige uge', danishWeekStart(new Date('2026-10-01T10:00:00Z'), -1), '2026-09-21')
const w = summarizeWeekHours([
  { id: 'a', start_time: '2026-09-28T05:00:00Z', end_time: '2026-09-28T13:00:00Z', hours: 8, billable: true, case_number: 'SVC-1' },
  { id: 'b', start_time: '2026-09-29T22:30:00Z', end_time: '2026-09-30T00:30:00Z', hours: 2, billable: false },
  { id: 'c', start_time: '2026-10-01T06:00:00Z', end_time: null, hours: null },
  { id: 'd', start_time: '2026-10-06T06:00:00Z', end_time: '2026-10-06T08:00:00Z', hours: 2 },
  { id: 'e', start_time: '2026-09-27T21:00:00Z', end_time: '2026-09-27T23:00:00Z', hours: 2 },
], '2026-09-28')
eq('dage man–søn', w.days.map((d) => d.date), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
eq('time kl. 00:30 dansk onsdag tæller onsdag (22:30Z tirsdag)', w.days.map((d) => d.hours), [8, 0, 2, 0, 0, 0, 0])
eq('søndag 23:00 dansk (21:00Z) hører til forrige uge — total 8 + 2', w.total, 10)
eq('fakturerbar total', w.billableTotal, 8)
eq('åben timer markeret', w.openTimer, true)
eq('næste og forrige uges timer udeladt; nyeste først', w.entries.map((e) => e.id), ['c', 'b', 'a'])
// HR-review 2026-10-08 (#5): afviste timer tæller ikke, men vises stadig
const r = summarizeWeekHours([
  { id: 'ok', start_time: '2026-09-28T05:00:00Z', end_time: '2026-09-28T13:00:00Z', hours: 8, billable: true, approval_status: 'approved' },
  { id: 'rej', start_time: '2026-09-29T05:00:00Z', end_time: '2026-09-29T13:00:00Z', hours: 8, billable: true, approval_status: 'rejected' },
], '2026-09-28')
eq('afvist tæller ikke i total/fakturerbar/dag', [r.total, r.billableTotal, r.days[1].hours], [8, 8, 0])
eq('afvist række vises stadig', r.entries.map((e) => e.id).sort(), ['ok', 'rej'])
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle uge-timer-tests PASS')
process.exitCode = fail ? 1 : 0
