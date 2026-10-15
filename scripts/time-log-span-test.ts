/**
 * Unit-test (ingen DB) for PL-6 fornuftsgrænse på manuel tid (lib/time-logs/guards.ts timeLogSpanError).
 *   npx tsx scripts/time-log-span-test.ts
 */
import { timeLogSpanError } from '../src/lib/time-logs/guards'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const now = new Date('2026-10-14T21:30:00Z') // 23:30 dansk tid
ok(timeLogSpanError('2026-10-14T05:00:00Z', '2026-10-14T13:00:00Z', now) === null, '8 timer i dag: ok')
ok(timeLogSpanError('2026-10-14T05:00:00Z', '2026-10-14T21:00:00Z', now) === null, '16 timer: ok (grænsen)')
ok(!!timeLogSpanError('2026-10-14T05:00:00Z', '2026-10-17T13:00:00Z', now), '"80" timer i stedet for 8,0: afvist')
ok(timeLogSpanError('2026-10-15T05:00:00Z', '2026-10-15T13:00:00Z', now) === null, 'i morgen (dansk dato 15/10): ok')
ok(!!timeLogSpanError('2026-10-16T05:00:00Z', '2026-10-16T13:00:00Z', now), 'i overmorgen: afvist')
ok(timeLogSpanError('2026-10-14T22:30:00Z', '2026-10-14T23:30:00Z', now) === null, '15/10 kl. 00:30 dansk tid (22:30Z d. 14.) er "i morgen"')
ok(!!timeLogSpanError('2026-10-15T22:30:00Z', '2026-10-15T23:30:00Z', now), '16/10 kl. 00:30 dansk tid (22:30Z d. 15.) er overmorgen: afvist')
console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ tidsgrænser ok')
process.exitCode = bad ? 1 : 0
