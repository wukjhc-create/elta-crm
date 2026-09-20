/**
 * Test af Test Harness credential-design: safety-eval + runtime/bootstrap-opdeling
 * + fail-closed + secret-maskering + invariant-runner.
 *   npx tsx scripts/test-harness-guard-test.ts
 * Ingen DB, ingen prod, ingen rigtige secrets.
 */
import {
  evaluateHarnessTarget, assertRuntimeConfig, assertBootstrapConfig, maskSecret, HARNESS_CONFIRM_TOKEN,
} from './test-harness/env-guard'
import { runInvariants, formatReport } from './test-harness/runner'
import type { InvariantCheck } from './test-harness/types'

let fails = 0
const assert = (cond: boolean, label: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fails++ }
const threw = (fn: () => void) => { try { fn(); return false } catch { return true } }

const PROD = 'https://guhsjwewajyonehivffc.supabase.co'
const STAGING = 'https://elta-staging-test.supabase.co'
const PROD_SVC = 'prod-service-role-key'
const PROD_TOKEN = 'sbp_prod_token'

// Safety-eval (ingen secrets)
const base = { NEXT_PUBLIC_SUPABASE_URL: PROD, HARNESS_CONFIRM: HARNESS_CONFIRM_TOKEN }
assert(!evaluateHarnessTarget({ ...base }).ok, 'safety: HARNESS_SUPABASE_URL ikke sat => blok')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: PROD }).ok, 'safety: == prod URL => blok')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: 'https://guhsjwewajyonehivffc.supabase.co' }).ok, 'safety: samme ref som prod => blok')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: STAGING, HARNESS_CONFIRM: 'nej' }).ok, 'safety: forkert confirm => blok')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: 'https://prod-lignende.supabase.co' }).ok, 'safety: ikke test/staging-lignende => blok')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: STAGING, NODE_ENV: 'production' }).ok, 'safety: NODE_ENV=production => blok')
assert(evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: STAGING }).ok, 'safety: gyldigt staging => ok')

// RUNTIME (ingen management-token kraevet)
const rtBase = { ...base, HARNESS_SUPABASE_URL: STAGING, HARNESS_SUPABASE_ANON_KEY: 'anon', HARNESS_SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_SERVICE_ROLE_KEY: PROD_SVC }
const rt = assertRuntimeConfig(rtBase)
assert(rt.url === STAGING && rt.anonKey === 'anon' && rt.serviceKey === 'svc', 'runtime: gyldig config uden token')
assert(threw(() => assertRuntimeConfig({ ...rtBase, HARNESS_SUPABASE_ANON_KEY: '' })), 'runtime: mangler anon => kaster')
assert(threw(() => assertRuntimeConfig({ ...rtBase, HARNESS_SUPABASE_SERVICE_ROLE_KEY: PROD_SVC })), 'runtime: service == prod service => kaster (fail-closed)')
// runtime kraever IKKE access-token
assert(!('accessToken' in (rt as object)), 'runtime: returnerer intet access-token')

// BOOTSTRAP (kun management-token)
const bsBase = { ...base, HARNESS_SUPABASE_URL: STAGING, HARNESS_SUPABASE_SERVICE_ROLE_KEY: 'svc', HARNESS_SUPABASE_ACCESS_TOKEN: 'sbp_staging', SUPABASE_ACCESS_TOKEN: PROD_TOKEN, SUPABASE_SERVICE_ROLE_KEY: PROD_SVC }
const bs = assertBootstrapConfig(bsBase)
assert(bs.accessToken === 'sbp_staging', 'bootstrap: gyldig config med token')
assert(threw(() => assertBootstrapConfig({ ...bsBase, HARNESS_SUPABASE_ACCESS_TOKEN: '' })), 'bootstrap: mangler token => kaster')
assert(threw(() => assertBootstrapConfig({ ...bsBase, HARNESS_SUPABASE_ACCESS_TOKEN: PROD_TOKEN })), 'bootstrap: token == prod token => kaster (fail-closed)')

// maskSecret afsloerer aldrig indhold
const masked = maskSecret('super-hemmelig-vaerdi-123')
assert(!masked.includes('hemmelig') && masked.startsWith('set(len='), 'maskSecret: intet indhold, kun laengde')
assert(maskSecret(undefined) === '(unset)', 'maskSecret: unset')

// invariant-runner mod mocked query
const checks: InvariantCheck[] = [
  { id: 'a', title: 'A', description: '', severity: 'critical', violationSql: 'SQL_A' },
  { id: 'b', title: 'B', description: '', severity: 'low', violationSql: 'SQL_B' },
]
const mockQuery = async (sql: string) => (sql === 'SQL_A' ? [{ x: 1 }, { x: 2 }] : [])
;(async () => {
  const report = await runInvariants(mockQuery, checks, 'mock-ref')
  assert(report.totalChecks === 2 && report.failed === 1 && report.passed === 1, 'runner: 1 fail (A), 1 pass (B)')
  assert(typeof formatReport(report) === 'string' && formatReport(report).includes('invariant-rapport'), 'formatReport giver rapport-tekst')

  console.log(`\n${fails === 0 ? '✅ ALLE HARNESS-CREDENTIAL-TESTS PASS' : `❌ ${fails} FEJL`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
