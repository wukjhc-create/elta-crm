/**
 * Test af Test Harness fundament: env-guard (safeguards) + invariant-runner.
 *   npx tsx scripts/test-harness-guard-test.ts
 * Ingen DB, ingen prod.
 */
import { evaluateHarnessTarget, assertSafeHarnessTarget, HARNESS_CONFIRM_TOKEN } from './test-harness/env-guard'
import { runInvariants, formatReport } from './test-harness/runner'
import type { InvariantCheck } from './test-harness/types'

let fails = 0
const assert = (cond: boolean, label: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fails++ }

const PROD = 'https://guhsjwewajyonehivffc.supabase.co'
const STAGING = 'https://elta-staging-test.supabase.co'
const base = { NEXT_PUBLIC_SUPABASE_URL: PROD, HARNESS_SUPABASE_SERVICE_ROLE_KEY: 'k', HARNESS_CONFIRM: HARNESS_CONFIRM_TOKEN }

// BLOKERING
assert(!evaluateHarnessTarget({ ...base }).ok, 'blok: HARNESS_SUPABASE_URL ikke sat')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: PROD }).ok, 'blok: harness == production URL')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: 'https://guhsjwewajyonehivffc.supabase.co' }).ok, 'blok: samme ref som prod')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: STAGING, HARNESS_CONFIRM: 'nej' }).ok, 'blok: forkert HARNESS_CONFIRM')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: 'https://prod-lignende.supabase.co' }).ok, 'blok: URL ligner ikke test/staging')
assert(!evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: STAGING, NODE_ENV: 'production' }).ok, 'blok: NODE_ENV=production')

// TILLADELSE
const okEval = evaluateHarnessTarget({ ...base, HARNESS_SUPABASE_URL: STAGING })
assert(okEval.ok && okEval.url === STAGING, 'tillad: gyldigt staging-target med confirm')

// assertSafeHarnessTarget kaster mod prod-lignende
let threw = false
try { assertSafeHarnessTarget({ NEXT_PUBLIC_SUPABASE_URL: PROD }) } catch { threw = true }
assert(threw, 'assertSafeHarnessTarget kaster naar target ikke er sikkert')

// invariant-runner mod mocked query
const checks: InvariantCheck[] = [
  { id: 'a', title: 'A', description: '', severity: 'critical', violationSql: 'SQL_A' },
  { id: 'b', title: 'B', description: '', severity: 'low', violationSql: 'SQL_B' },
]
const mockQuery = async (sql: string) => (sql === 'SQL_A' ? [{ x: 1 }, { x: 2 }] : [])
;(async () => {
  const report = await runInvariants(mockQuery, checks, 'mock-ref')
  assert(report.totalChecks === 2 && report.failed === 1 && report.passed === 1, 'runner: 1 fail (A), 1 pass (B)')
  assert(report.bySeverity.critical.failed === 1, 'runner: critical fail talt')
  assert(typeof formatReport(report) === 'string' && formatReport(report).includes('invariant-rapport'), 'formatReport giver rapport-tekst')

  console.log(`\n${fails === 0 ? '✅ ALLE HARNESS-FUNDAMENT-TESTS PASS' : `❌ ${fails} FEJL`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
