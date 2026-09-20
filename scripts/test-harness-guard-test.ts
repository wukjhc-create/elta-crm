/**
 * Test af Test Harness credential-design: identitets-baseret safety + runtime/
 * bootstrap-opdeling + fail-closed + secret-maskering + invariant-runner.
 *   npx tsx scripts/test-harness-guard-test.ts
 * Ingen DB, ingen prod, ingen rigtige secrets, ingen fil-læsning.
 */
import {
  evaluateHarnessTarget, assertRuntimeConfig, assertBootstrapConfig, maskSecret,
  HARNESS_CONFIRM_TOKEN, type HarnessSecrets,
} from './test-harness/env-guard'
import { runInvariants, formatReport } from './test-harness/runner'
import type { InvariantCheck } from './test-harness/types'

let fails = 0
const assert = (cond: boolean, label: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fails++ }
const threw = (fn: () => void) => { try { fn(); return false } catch { return true } }

const PROD_URL = 'https://guhsjwewajyonehivffc.supabase.co' // kendt production-ref
const STAGING_URL = 'https://abcdef123456.supabase.co' // vilkaarlig ref, INTET "staging" i navnet
const PROD_SVC = 'prod-service-role-key'
const PROD_TOKEN = 'sbp_prod_token'
const prodEnv = { NEXT_PUBLIC_SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: PROD_SVC, SUPABASE_ACCESS_TOKEN: PROD_TOKEN }

const ok: HarnessSecrets = { supabaseUrl: STAGING_URL, confirm: HARNESS_CONFIRM_TOKEN, environment: 'staging' }

// Safety (identitets-baseret; INGEN navne-heuristik, INGEN allow-any-bypass)
assert(!evaluateHarnessTarget({ confirm: HARNESS_CONFIRM_TOKEN }, prodEnv).ok, 'safety: manglende url => blok')
assert(!evaluateHarnessTarget({ supabaseUrl: PROD_URL, confirm: HARNESS_CONFIRM_TOKEN }, prodEnv).ok, 'safety: == prod URL => blok')
assert(!evaluateHarnessTarget({ supabaseUrl: 'https://guhsjwewajyonehivffc.supabase.co', confirm: HARNESS_CONFIRM_TOKEN }, {}).ok, 'safety: KENDT prod-ref => hard-blocked (selv uden env)')
assert(!evaluateHarnessTarget({ supabaseUrl: STAGING_URL, confirm: 'nej' }, prodEnv).ok, 'safety: forkert confirm => blok')
assert(!evaluateHarnessTarget({ supabaseUrl: STAGING_URL, confirm: HARNESS_CONFIRM_TOKEN, environment: 'production' }, prodEnv).ok, 'safety: environment=production => blok')
assert(!evaluateHarnessTarget(ok, { ...prodEnv, NODE_ENV: 'production' }).ok, 'safety: NODE_ENV=production => blok')
assert(evaluateHarnessTarget(ok, prodEnv).ok, 'safety: vilkaarlig ikke-prod ref + confirm => OK (ingen navne-krav)')

// RUNTIME (ingen management-token)
const rtOk: HarnessSecrets = { ...ok, anonKey: 'anon', serviceRoleKey: 'svc' }
const rt = assertRuntimeConfig(rtOk, prodEnv)
assert(rt.url === STAGING_URL && rt.anonKey === 'anon' && rt.serviceKey === 'svc', 'runtime: gyldig config uden token')
assert(!('accessToken' in (rt as object)), 'runtime: returnerer intet access-token')
assert(threw(() => assertRuntimeConfig({ ...rtOk, anonKey: '' }, prodEnv)), 'runtime: mangler anon => kaster')
assert(threw(() => assertRuntimeConfig({ ...rtOk, serviceRoleKey: PROD_SVC }, prodEnv)), 'runtime: service == prod => kaster (fail-closed)')

// BOOTSTRAP (kun management-token)
const bsOk: HarnessSecrets = { ...ok, serviceRoleKey: 'svc', managementAccessToken: 'sbp_staging' }
const bs = assertBootstrapConfig(bsOk, prodEnv)
assert(bs.accessToken === 'sbp_staging', 'bootstrap: gyldig config med token')
assert(threw(() => assertBootstrapConfig({ ...bsOk, managementAccessToken: '' }, prodEnv)), 'bootstrap: mangler token => kaster')
assert(threw(() => assertBootstrapConfig({ ...bsOk, managementAccessToken: PROD_TOKEN }, prodEnv)), 'bootstrap: token == prod => kaster (fail-closed)')

// maskSecret
assert(maskSecret('super-hemmelig-123').startsWith('set(len=') && !maskSecret('super-hemmelig-123').includes('hemmelig'), 'maskSecret: intet indhold')
assert(maskSecret(undefined) === '(unset)', 'maskSecret: unset')

// invariant-runner
const checks: InvariantCheck[] = [
  { id: 'a', title: 'A', description: '', severity: 'critical', violationSql: 'SQL_A' },
  { id: 'b', title: 'B', description: '', severity: 'low', violationSql: 'SQL_B' },
]
;(async () => {
  const report = await runInvariants(async (sql) => (sql === 'SQL_A' ? [{ x: 1 }] : []), checks, 'mock')
  assert(report.failed === 1 && report.passed === 1, 'runner: 1 fail, 1 pass')
  assert(formatReport(report).includes('invariant-rapport'), 'formatReport ok')
  console.log(`\n${fails === 0 ? '✅ ALLE HARNESS-CREDENTIAL-TESTS PASS' : `❌ ${fails} FEJL`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
