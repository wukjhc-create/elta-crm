/**
 * API-3 (review 2026-10-17): safeEqual kaster aldrig (ikke-ASCII med samme tegn-længde) og sammenligner korrekt.
 *   npx tsx scripts/safe-equal-test.ts
 */
import { timingSafeEqual } from 'crypto'
import { safeEqual } from '../src/lib/security/safe-equal'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — fik ${String(got)}, ville have ${String(want)}`}`)
}
const expected = 'Bearer abcdef'
const attack = 'Bearer ææææææ' // samme tegn-længde, flere bytes
let oldThrew = false
try { if (attack.length === expected.length) timingSafeEqual(Buffer.from(attack), Buffer.from(expected)) } catch { oldThrew = true }
eq('gammelt mønster kastede (reproduceret)', oldThrew, true)
let threw = false
let res: boolean | null = null
try { res = safeEqual(attack, expected) } catch { threw = true }
eq('safeEqual kaster ikke', threw, false)
eq('safeEqual afviser angreb', res, false)
eq('safeEqual accepterer rigtig værdi', safeEqual(expected, 'Bearer abcdef'), true)
eq('safeEqual afviser anden længde', safeEqual('Bearer abc', expected), false)
eq('safeEqual afviser tom', safeEqual('', expected), false)
console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
process.exitCode = bad ? 1 : 0
