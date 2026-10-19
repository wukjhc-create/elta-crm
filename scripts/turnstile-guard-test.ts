/**
 * Unit-test for API-3 (2026-10-19): Turnstile er inaktiv uden konfiguration og fail-closed når den håndhæves (intet netværk).
 *   npx tsx scripts/turnstile-guard-test.ts
 */
import { turnstileEnforced, verifyTurnstileToken } from '../src/lib/security/turnstile'

let bad = 0
const ok = (c: boolean, l: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`) }

async function main() {
  delete process.env.CONTACT_TURNSTILE_ENFORCE
  delete process.env.TURNSTILE_SECRET_KEY
  ok(!turnstileEnforced(), 'uden konfiguration: ikke håndhævet')
  ok(await verifyTurnstileToken(undefined), 'uden konfiguration: henvendelsen accepteres (uændret adfærd)')
  process.env.TURNSTILE_SECRET_KEY = 'x'
  ok(!turnstileEnforced(), 'kun nøgle uden ENFORCE-flag: ikke håndhævet')
  process.env.CONTACT_TURNSTILE_ENFORCE = 'true'
  ok(turnstileEnforced(), 'flag + nøgle: håndhævet')
  ok(!(await verifyTurnstileToken('')), 'håndhævet + tomt token: afvist')
  ok(!(await verifyTurnstileToken('x'.repeat(3000))), 'håndhævet + for langt token: afvist')
  console.log(`\n${bad === 0 ? '✅ ALLE TURNSTILE-TESTS PASS' : `❌ ${bad} FEJL`}`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
