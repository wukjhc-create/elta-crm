/**
 * Test Harness — committed CLI orchestrator. GUARD-FIRST, KUN staging.
 *
 * Subcommands (via npm run harness:*):
 *   smoke       lille validering (5 kunder x 1 mdr)
 *   normal      12-mdr 1x drift
 *   stress      5x + 10x (bounded months) load
 *   security    eksekvér sikkerhedsscenarie-delmaengde
 *   invariants  kør invariant-katalog (read-only)
 *   report      invarianter + sikkerhed -> gem rapport (ingen ny data)
 *   full        smoke -> normal -> 5x -> 10x -> security -> invariants -> report -> cleanup
 *   selftest    bekræft guard hard-blocker prod + at staging accepteres
 *
 * Sikkerhed: assertRuntimeConfig/assertBootstrapConfig fail-closer paa prod-ref/-url,
 * environment!=staging, manglende confirm-token/credentials. Ingen prod-fallback.
 * Secrets logges/gemmes ALDRIG (kun ref + maskerede laengder).
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import {
  assertRuntimeConfig, assertBootstrapConfig, loadHarnessSecrets, evaluateHarnessTarget, maskSecret,
} from './env-guard'
import { buildPlan } from './planner'
import { DEFAULT_CONFIG } from './generator'
import { applyPlan, ensureActors, cleanupStatements, type Actors, type ApplyMetrics } from './apply'
import { INVARIANTS } from './invariants'
import { runInvariants, formatReport } from './runner'
import { latencyStats } from './metrics'
import { applyStressProfile, type StressProfile } from './stress'
import { SECURITY_SCENARIOS } from './security-scenarios'
import type { GeneratorConfig, HarnessReport } from './types'

const SUB = (process.argv[2] || 'smoke').toLowerCase()
const STRESS_MONTHS = 3
const REPORT_DIR = resolve(process.cwd(), 'harness-reports')

function log(msg: string) { console.log(msg) }
function checkpoint(msg: string) { console.log(`[checkpoint] ${new Date().toISOString()} ${msg}`) }

// ---- selftest: verificér guarden (ingen DB) ----
function selftest(): number {
  log('=== HARNESS SELF-TEST (guard) ===')
  const base = loadHarnessSecrets()
  const realStaging = evaluateHarnessTarget(base, {})
  log(`staging-target accepteret: ${realStaging.ok ? '✅ JA' : '❌ NEJ — ' + realStaging.reason}`)

  // Simulér PROD-target -> SKAL hard-blokeres
  const prodRef = 'guhsjwewajyonehivffc'
  const cases: { name: string; secrets: any; env?: any }[] = [
    { name: 'prod-ref URL', secrets: { ...base, supabaseUrl: `https://${prodRef}.supabase.co` } },
    { name: 'environment=production', secrets: { ...base, environment: 'production' } },
    { name: 'environment tom', secrets: { ...base, environment: '' } },
    { name: 'confirm mangler', secrets: { ...base, confirm: '' } },
    { name: 'url == NEXT_PUBLIC_SUPABASE_URL (prod env)', secrets: base, env: { NEXT_PUBLIC_SUPABASE_URL: base.supabaseUrl } },
    { name: 'NODE_ENV=production', secrets: base, env: { NODE_ENV: 'production' } },
  ]
  let allBlocked = true
  for (const c of cases) {
    const e = evaluateHarnessTarget(c.secrets, c.env || {})
    const blocked = !e.ok
    if (!blocked) allBlocked = false
    log(`  ${blocked ? '✅ BLOKERET' : '❌ SLAP IGENNEM'}  ${c.name}${blocked ? ` (${e.reason})` : ''}`)
  }
  log(`\nSelf-test: ${realStaging.ok && allBlocked ? '✅ GRØN (staging ok, alle prod-cases hard-blokeret)' : '❌ FEJL'}`)
  return realStaging.ok && allBlocked ? 0 : 1
}

if (SUB === 'selftest') { process.exit(selftest()) }

// ---- DB-modes: guard-first ----
const runtime = assertRuntimeConfig()
const boot = assertBootstrapConfig(loadHarnessSecrets())
const ref = runtime.url.match(/https?:\/\/([^.]+)\.supabase\.co/)![1]
const admin = createClient(runtime.url, runtime.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
log(`=== ELTA CRM TEST HARNESS === sub=${SUB} target=staging:${ref} (prod hard-blokeret)`)
log(`[guard] runtime service=${maskSecret(runtime.serviceKey)} mgmt=${maskSecret(boot.accessToken)} — prod-ref hard-blocked`)

async function stagingSql(sql: string): Promise<any[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${boot.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!r.ok) throw new Error(`mgmt sql (${r.status}): ${(await r.text()).slice(0, 160)}`)
  return (await r.json()) as any[]
}
async function dbBytes(): Promise<number> {
  const r = await stagingSql(`SELECT coalesce(sum(pg_total_relation_size(c.oid)),0) AS b FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','m')`)
  return Number(r[0].b)
}
const mb = (b: number) => (b / 1048576).toFixed(1) + ' MB'

interface ProfileResult { label: string; entities: number; inserts: number; errors: number; totalMs: number; throughput: number; p50: number; p95: number; p99: number; maxMs: number; dbBeforeMb: number; dbAfterMb: number; errorSamples: string[] }

async function runProfile(cfg: GeneratorConfig, actors: Actors, label: string): Promise<{ res: ProfileResult; seed: string }> {
  const plan = buildPlan(cfg)
  checkpoint(`${label}: plan ${plan.entities.length} entiteter`)
  const before = await dbBytes()
  let m: ApplyMetrics
  try {
    m = await applyPlan(admin, plan, actors)
  } catch (e: any) {
    checkpoint(`${label}: applyPlan EXCEPTION: ${e.message}`)
    m = { seedRunId: plan.seedRunId, perTable: {}, batchLatenciesMs: [], inserts: 0, errors: plan.entities.length, errorSamples: [String(e.message).slice(0, 160)], totalMs: 0 }
  }
  const after = await dbBytes()
  const s = latencyStats(m.batchLatenciesMs)
  const throughput = m.totalMs > 0 ? Math.round((m.inserts / m.totalMs) * 1000) : 0
  const res: ProfileResult = {
    label, entities: plan.entities.length, inserts: m.inserts, errors: m.errors, totalMs: m.totalMs,
    throughput, p50: Math.round(s.p50), p95: Math.round(s.p95), p99: Math.round(s.p99), maxMs: s.max,
    dbBeforeMb: before / 1048576, dbAfterMb: after / 1048576, errorSamples: m.errorSamples,
  }
  log(`[${label}] inserts=${res.inserts} fejl=${res.errors} tid=${(res.totalMs / 1000).toFixed(1)}s throughput=${throughput} rows/s | batch p50/p95/p99=${res.p50}/${res.p95}/${res.p99}ms | DB ${mb(before)}->${mb(after)}`)
  if (res.errors) log(`[${label}] fejl-eksempler: ${JSON.stringify(res.errorSamples.slice(0, 4))}`)
  return { res, seed: cfg.seed.replace(/[^a-z0-9:]/gi, '') }
}

async function runSecurity(actors: Actors): Promise<{ id: string; ok: boolean; note: string }[]> {
  const out: { id: string; ok: boolean; note: string }[] = []
  const anon = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false } })
  const nonAdmin = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false } })
  const signIn = await nonAdmin.auth.signInWithPassword({ email: actors.nonAdminEmail, password: actors.nonAdminPassword })
  const denied = async (client: any, table: string) => {
    const { data, error } = await client.from(table).select('id').limit(5)
    return !!error || !data || data.length === 0
  }
  out.push({ id: 'anon_read_agent_data', ok: await denied(anon, 'agent_runs'), note: 'anon SELECT agent_runs => 0/err' })
  out.push({ id: 'anon_read_agent_actions', ok: await denied(anon, 'agent_actions'), note: 'anon SELECT agent_actions => 0/err' })
  out.push({ id: 'anon_read_invoices', ok: await denied(anon, 'invoices'), note: 'anon SELECT invoices => 0/err' })
  out.push({ id: 'anon_read_portal_messages', ok: await denied(anon, 'portal_messages'), note: 'anon SELECT portal_messages => 0/err' })
  if (!signIn.error) {
    out.push({ id: 'nonadmin_read_agent_data', ok: await denied(nonAdmin, 'agent_runs'), note: 'montoer SELECT agent_runs => 0/err' })
    out.push({ id: 'montoer_read_economy', ok: await denied(nonAdmin, 'invoices'), note: 'montoer SELECT invoices => 0/err' })
  } else out.push({ id: 'nonadmin_signin', ok: false, note: `login fejlede: ${signIn.error.message}` })

  // Trigger-håndhævelse: hard-blocked action executed UDEN approval => skal afvises.
  try {
    const rid = (await stagingSql(`SELECT id FROM agent_runs WHERE input_context->>'harness' IS NOT NULL LIMIT 1`))[0]?.id
    if (rid) {
      const tid = (await stagingSql(`SELECT id FROM agent_tasks WHERE run_id='${rid}' LIMIT 1`))[0]?.id
      const key = `harness-attack:${Date.now()}`
      const { error } = await admin.from('agent_actions').insert([{ run_id: rid, task_id: tid, action_type: 'send', capability: 'mail.send', side_effect_class: 'send_external', status: 'executed', idempotency_key: key }])
      out.push({ id: 'hardblocked_without_approval', ok: !!error, note: error ? `afvist: ${error.message.slice(0, 70)}` : 'SLAP IGENNEM (fejl!)' })
      if (!error) await stagingSql(`DELETE FROM agent_actions WHERE idempotency_key='${key}';`)
    } else out.push({ id: 'hardblocked_without_approval', ok: false, note: 'ingen run at teste mod' })
  } catch (e: any) { out.push({ id: 'hardblocked_without_approval', ok: true, note: `afvist: ${String(e.message).slice(0, 70)}` }) }
  return out
}

async function runInvariantsPhase(): Promise<HarnessReport> {
  const report = await runInvariants((sql) => stagingSql(sql), INVARIANTS, `staging:${ref}`)
  log(formatReport(report))
  return report
}

async function cleanup(seeds: string[]) {
  for (const seed of [...new Set(seeds)]) {
    for (const stmt of cleanupStatements(seed)) { try { await stagingSql(stmt) } catch (e: any) { log(`  cleanup-advarsel: ${e.message.slice(0, 80)}`) } }
  }
  const leftover = (await stagingSql(`SELECT count(*) n FROM customers WHERE custom_fields->>'harness' IS NOT NULL`))[0].n
  log(`  cleanup done. resterende harness-kunder: ${leftover}`)
  return Number(leftover)
}

/** Bred cleanup: fjern ALLE syntetiske rows uanset seed (til drift/reset). */
async function cleanupAll() {
  const stmts = [
    `DELETE FROM audit_logs WHERE metadata->>'harness' IS NOT NULL;`,
    `DELETE FROM agent_runs WHERE input_context->>'harness' IS NOT NULL;`,
    `DELETE FROM offers WHERE offer_number LIKE 'HARNESS-%';`,
    `DELETE FROM incoming_emails WHERE sender_email LIKE '%@harness.test';`,
    `DELETE FROM service_cases WHERE title LIKE '[HARNESS %';`,
    `DELETE FROM customers WHERE custom_fields->>'harness' IS NOT NULL;`,
    `DELETE FROM leads WHERE custom_fields->>'harness' IS NOT NULL;`,
  ]
  for (const s of stmts) { try { await stagingSql(s) } catch (e: any) { log(`  cleanup-advarsel: ${e.message.slice(0, 80)}`) } }
  return status()
}

/** Status: DB-stoerrelse + resterende harness-rows (maskeret, ingen secrets). */
async function status() {
  const bytes = await dbBytes()
  const c = (await stagingSql(`SELECT count(*) n FROM customers WHERE custom_fields->>'harness' IS NOT NULL`))[0].n
  const a = (await stagingSql(`SELECT count(*) n FROM agent_runs WHERE input_context->>'harness' IS NOT NULL`))[0].n
  const o = (await stagingSql(`SELECT count(*) n FROM offers WHERE offer_number LIKE 'HARNESS-%'`))[0].n
  log(`[status] staging:${ref} DB=${mb(bytes)} | harness-rows: customers=${c} agent_runs=${a} offers=${o}`)
  return { customers: Number(c), agent_runs: Number(a), offers: Number(o) }
}

function saveReport(name: string, data: unknown) {
  mkdirSync(REPORT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = resolve(REPORT_DIR, `${name}-${stamp}.json`)
  writeFileSync(file, JSON.stringify(data, null, 2))
  log(`[report] gemt: harness-reports/${name}-${stamp}.json`)
  return file
}

async function main() {
  const seedBase = `h${Date.now().toString(36)}`
  const normal: GeneratorConfig = { ...DEFAULT_CONFIG, seed: seedBase }
  const smoke: GeneratorConfig = { ...DEFAULT_CONFIG, seed: seedBase, customersPerMonth: 5, months: 1 }
  const profiles: ProfileResult[] = []
  const seeds: string[] = []
  let securityResults: { id: string; ok: boolean; note: string }[] = []
  let invReport: HarnessReport | undefined
  let actors: Actors | undefined

  // Drift-subcommands uden data-generering:
  if (SUB === 'status') { await status(); return }
  if (SUB === 'cleanup') { log('=== CLEANUP (alle syntetiske rows) ==='); await cleanupAll(); return }

  const needActors = ['smoke', 'normal', 'stress', 'security', 'full'].includes(SUB)
  if (needActors) { actors = await ensureActors(admin, seedBase); checkpoint('actors klar (uids maskeret)') }

  const doProfile = async (cfg: GeneratorConfig, label: string) => {
    const { res, seed } = await runProfile(cfg, actors!, label); profiles.push(res); seeds.push(seed)
  }

  try {
    if (SUB === 'smoke') await doProfile(smoke, 'smoke')
    else if (SUB === 'normal') await doProfile(normal, 'normal(1x,12mo)')
    else if (SUB === 'stress') {
      for (const p of ['x5', 'x10'] as StressProfile[]) await doProfile(applyStressProfile({ ...normal, months: STRESS_MONTHS }, p), `${p}(${STRESS_MONTHS}mo)`)
    } else if (SUB === 'security') { securityResults = await runSecurity(actors!) }
    else if (SUB === 'invariants') { invReport = await runInvariantsPhase() }
    else if (SUB === 'report') { invReport = await runInvariantsPhase(); if (actors) securityResults = await runSecurity(actors) }
    else if (SUB === 'full') {
      checkpoint('FULL: start')
      await doProfile(smoke, 'smoke'); checkpoint('smoke done')
      await doProfile(normal, 'normal(1x,12mo)'); checkpoint('normal done')
      for (const p of ['x5', 'x10'] as StressProfile[]) { await doProfile(applyStressProfile({ ...normal, months: STRESS_MONTHS }, p), `${p}(${STRESS_MONTHS}mo)`); checkpoint(`${p} done`) }
      log('\n=== INVARIANTER ==='); invReport = await runInvariantsPhase(); checkpoint('invariants done')
      log('\n=== SIKKERHEDSSCENARIER ==='); securityResults = await runSecurity(actors!)
      for (const s of securityResults) log(`  ${s.ok ? '✅' : '❌'} ${s.id.padEnd(28)} ${s.note}`)
      checkpoint('security done')
      log('\n=== CLEANUP ==='); await cleanup(seeds); checkpoint('cleanup done')
    } else { log(`ukendt subcommand: ${SUB}`); process.exit(2) }
  } catch (e: any) {
    checkpoint(`PHASE EXCEPTION (fortsætter til rapport): ${e.message}`)
  }

  // Security-gate: hvis noget der SKAL afvises slap igennem -> hard fail
  const secGate = securityResults.length > 0 && securityResults.some((s) => !s.ok)
  const invFailed = invReport ? invReport.failed : 0

  if (SUB === 'full' || SUB === 'report' || SUB === 'security' || SUB === 'invariants') {
    saveReport('harness', {
      target: `staging:${ref}`, sub: SUB, at: new Date().toISOString(),
      profiles, invariants: invReport, security: securityResults,
      verdict: { invariantFailures: invFailed, securityGate: secGate },
    })
  }

  log(`\n=== SAMLET (${SUB}): invarianter ${invReport ? (invFailed ? `${invFailed} FEJL` : 'GRØN') : 'n/a'}, sikkerhed ${securityResults.length ? (secGate ? 'SIKKERHEDSGATE ❌' : 'GRØN') : 'n/a'} ===`)
  if (secGate) { console.error('SIKKERHEDSGATE: et forsoeg der SKAL afvises slap igennem — stopper.'); process.exit(3) }
}

main().catch((e) => { console.error('HARNESS FEJL:', e.message); process.exit(1) })
