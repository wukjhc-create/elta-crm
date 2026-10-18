/**
 * Unit-test (ingen DB) for normalizeApprovedTimeLogPatch — EM-2 + TT-1.
 *   npx tsx scripts/approved-time-patch-test.ts
 */
import { normalizeApprovedTimeLogPatch } from '../src/lib/time-logs/approved-patch'

let bad = 0
const ok = (c: boolean, label: string, got?: unknown) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && got !== undefined ? '  → ' + JSON.stringify(got) : ''}`) }

const cur = { start_time: '2026-10-01T06:00:00Z', end_time: '2026-10-01T14:00:00Z', pay_rate_type: 'normal', employee_rate_id: null }

let p = normalizeApprovedTimeLogPatch({ start_time: '2026-10-01T06:00:00.000Z', end_time: '2026-10-01T14:00:00+00:00', description: 'x' }, cur)
ok(!('start_time' in p) && !('end_time' in p) && p.description === 'x', 'EM-2: uændrede tider udelades (ingen omprisning)', p)

p = normalizeApprovedTimeLogPatch({ start_time: '2026-10-01T08:00:00Z', end_time: '2026-10-01T14:00:00Z' }, cur)
ok(p.start_time === '2026-10-01T08:00:00Z' && 'end_time' in p, 'TT-1: kun starttid ændret → end_time bliver i SET-listen', p)

p = normalizeApprovedTimeLogPatch({ start_time: '2026-10-01T08:00:00Z' }, cur)
ok(p.end_time === cur.end_time, 'TT-1: starttid uden end_time i patch → nuværende end_time tilføjes', p)

p = normalizeApprovedTimeLogPatch({ end_time: '2026-10-01T15:00:00Z' }, cur)
ok(p.end_time === '2026-10-01T15:00:00Z' && !('start_time' in p), 'ændret sluttid bevares', p)

p = normalizeApprovedTimeLogPatch({ pay_rate_type: 'normal', employee_rate_id: null }, cur)
ok(Object.keys(p).length === 0, 'uændret sats/satsrække udelades', p)

p = normalizeApprovedTimeLogPatch({ pay_rate_type: 'ot50' }, cur)
ok(p.pay_rate_type === 'ot50', 'ændret satstype bevares', p)

p = normalizeApprovedTimeLogPatch({ start_time: '2026-10-01T08:00:00Z' }, { ...cur, end_time: null })
ok(!('end_time' in p), 'kørende registrering (ingen sluttid) får ikke end_time=null tilføjet', p)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ godkendt-patch ok')
process.exitCode = bad ? 1 : 0
