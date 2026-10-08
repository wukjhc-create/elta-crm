/**
 * Unit-tests for timeregistreringens overlap-regel (src/lib/time-logs/guards.ts). Ingen DB.
 *   npx tsx scripts/time-log-guards-test.ts
 */
import { intervalsOverlap } from '../src/lib/time-logs/guards'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
const T = (h: number) => `2026-10-06T${String(h).padStart(2, '0')}:00:00Z`

ok(intervalsOverlap(T(6), T(14), T(6), T(14)), 'samme tidsrum (08–16 to gange) overlapper')
ok(intervalsOverlap(T(6), T(10), T(9), T(12)), 'delvist overlap')
ok(intervalsOverlap(T(6), T(14), T(8), T(9)), 'indeholdt')
ok(!intervalsOverlap(T(6), T(10), T(10), T(12)), 'stød-til-stød (10:00 slut / 10:00 start) er ikke overlap')
ok(!intervalsOverlap(T(6), T(8), T(9), T(12)), 'adskilte')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle overlap-tests bestået')
process.exitCode = bad ? 1 : 0
