/**
 * Unit-tests for timeregistreringens overlap-regel (src/lib/time-logs/guards.ts). Ingen DB.
 *   npx tsx scripts/time-log-guards-test.ts
 */
import { endDateForClocks, intervalsOverlap, missingSaleRateError } from '../src/lib/time-logs/guards'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
const T = (h: number) => `2026-10-06T${String(h).padStart(2, '0')}:00:00Z`

ok(intervalsOverlap(T(6), T(14), T(6), T(14)), 'samme tidsrum (08–16 to gange) overlapper')
ok(intervalsOverlap(T(6), T(10), T(9), T(12)), 'delvist overlap')
ok(intervalsOverlap(T(6), T(14), T(8), T(9)), 'indeholdt')
ok(!intervalsOverlap(T(6), T(10), T(10), T(12)), 'stød-til-stød (10:00 slut / 10:00 start) er ikke overlap')
ok(!intervalsOverlap(T(6), T(8), T(9), T(12)), 'adskilte')

// #7 nattevagt (pilot-review 2026-10-15)
ok(endDateForClocks('2026-10-15', '08:00', '16:00') === '2026-10-15', 'dagvagt: samme dato')
ok(endDateForClocks('2026-10-15', '22:00', '02:00') === '2026-10-16', 'nattevagt: sluttid næste dag')
ok(endDateForClocks('2026-10-31', '23:00', '01:00') === '2026-11-01', 'nattevagt over månedsskifte')
ok(endDateForClocks('2026-10-15', '08:00', '08:00') === null, 'samme klokkeslæt = fejl (ikke 24 t)')

// PR-4b ingen skjult standardpris (Henrik 2026-10-15)
ok(missingSaleRateError(null) !== null && missingSaleRateError(undefined) !== null, 'uden timepris → blokér')
ok(missingSaleRateError(495) === null && missingSaleRateError('650.00') === null, 'egen timepris → ok (også som tekst fra PostgREST)')
ok(missingSaleRateError(0) === null, 'eksplicit 0 er medarbejderens egen sats (ikke en skjult fallback)')
ok(missingSaleRateError('abc') !== null, 'ugyldig værdi → blokér')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle overlap-tests bestået')
process.exitCode = bad ? 1 : 0
