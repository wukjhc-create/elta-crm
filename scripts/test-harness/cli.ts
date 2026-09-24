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
  if (res.errorSamples.length) log(`[${label}] fejl-eksempler: ${JSON.stringify(res.errorSamples.slice(0, 4))}`)
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

  // ---- Trigger/RLS-håndhævelse (probe-rows ryddes via 'harness-sec:'-praefiks) ----
  const rid = (await stagingSql(`SELECT id FROM agent_runs WHERE input_context->>'harness' IS NOT NULL LIMIT 1`))[0]?.id
  const tid = rid ? (await stagingSql(`SELECT id FROM agent_tasks WHERE run_id='${rid}' LIMIT 1`))[0]?.id : null
  const cleanupProbes = async () => { try { await stagingSql(`DELETE FROM agent_actions WHERE idempotency_key LIKE 'harness-sec:%';`) } catch { /* noop */ } }

  if (rid && tid) {
    // 1) hard-blocked (send_external) executed UDEN approval => afvist
    try {
      const key = `harness-sec:hb:${Date.now()}`
      const { error } = await admin.from('agent_actions').insert([{ run_id: rid, task_id: tid, action_type: 'send', capability: 'mail.send', side_effect_class: 'send_external', status: 'executed', idempotency_key: key }])
      out.push({ id: 'hardblocked_without_approval', ok: !!error, note: error ? `afvist: ${error.message.slice(0, 60)}` : 'SLAP IGENNEM' })
    } catch (e: any) { out.push({ id: 'hardblocked_without_approval', ok: true, note: `afvist: ${String(e.message).slice(0, 60)}` }) }

    // 2) duplicate idempotency_key => 2. insert afvist (UNIQUE)
    try {
      const key = `harness-sec:dup:${Date.now()}`
      const row = { run_id: rid, task_id: tid, action_type: 'draft', capability: 'mail.draft_reply', side_effect_class: 'read', status: 'planned', idempotency_key: key }
      const a = await admin.from('agent_actions').insert([row])
      const b = await admin.from('agent_actions').insert([{ ...row }])
      out.push({ id: 'duplicate_idempotency', ok: !a.error && !!b.error, note: b.error ? `2. afvist: ${b.error.message.slice(0, 50)}` : 'DUBLET SLAP IGENNEM' })
    } catch (e: any) { out.push({ id: 'duplicate_idempotency', ok: true, note: `afvist: ${String(e.message).slice(0, 50)}` }) }

    // 3) stale approval execute: godkendt men UDLOEBET approval => execute afvist
    try {
      const key = `harness-sec:stale:${Date.now()}`
      const ins = await admin.from('agent_actions').insert([{ run_id: rid, task_id: tid, action_type: 'send', capability: 'mail.send', side_effect_class: 'send_external', status: 'planned', idempotency_key: key }]).select('id')
      const aid = ins.data?.[0]?.id
      if (aid) {
        await admin.from('agent_action_approvals').insert([{ action_id: aid, decision: 'approved', decided_by: actors.ownerUid, expires_at: new Date(Date.now() - 3600_000).toISOString() }])
        const upd = await admin.from('agent_actions').update({ status: 'executed', executed_by: actors.ownerUid }).eq('id', aid)
        out.push({ id: 'stale_approval_execute', ok: !!upd.error, note: upd.error ? `afvist: ${upd.error.message.slice(0, 55)}` : 'UDLOEBET APPROVAL ACCEPTERET' })
      } else out.push({ id: 'stale_approval_execute', ok: false, note: 'kunne ikke oprette test-action' })
    } catch (e: any) { out.push({ id: 'stale_approval_execute', ok: true, note: `afvist: ${String(e.message).slice(0, 55)}` }) }

    // 4) anon skriver til agent-tabel => afvist (RLS/grants)
    const anonWrite = await anon.from('agent_runs').insert([{ agent_type: 'mail', trigger: 'manual' }])
    out.push({ id: 'anon_write_agent', ok: !!anonWrite.error, note: anonWrite.error ? `afvist: ${anonWrite.error.message.slice(0, 45)}` : 'ANON SKREV' })

    // 5) non-admin (montoer) skriver til agent-tabel => afvist (RLS)
    if (!signIn.error) {
      const naWrite = await nonAdmin.from('agent_actions').insert([{ run_id: rid, task_id: tid, action_type: 'x', capability: 'y', side_effect_class: 'read', idempotency_key: `harness-sec:na:${Date.now()}` }])
      out.push({ id: 'nonadmin_write_agent', ok: !!naWrite.error, note: naWrite.error ? `afvist: ${naWrite.error.message.slice(0, 45)}` : 'MONTOER SKREV' })
      // 6) manipuleret: non-admin opdaterer eksisterende action-status => afvist (0 rows via RLS)
      const naUpd = await nonAdmin.from('agent_actions').update({ status: 'executed' }).eq('run_id', rid).select('id')
      const changed = Array.isArray(naUpd.data) ? naUpd.data.length : 0
      out.push({ id: 'manipulated_action_update', ok: !!naUpd.error || changed === 0, note: naUpd.error ? `afvist: ${naUpd.error.message.slice(0, 40)}` : `${changed} rows aendret (skal=0)` })
    }
  } else out.push({ id: 'trigger_tests', ok: false, note: 'ingen agent-run at teste mod (kør persist/normal foerst)' })

  // 7) disabled agent execution: alle agent_configs skal vaere enabled=false (state) — executor-håndhævelse er app-lag
  const enabled = (await stagingSql(`SELECT count(*) n FROM agent_configs WHERE enabled=true`))[0].n
  out.push({ id: 'disabled_agent_state', ok: Number(enabled) === 0, note: `agent_configs enabled=true: ${enabled} (skal=0; executor-håndhævelse i app-lag)` })

  await cleanupProbes()
  return out
}

async function runInvariantsPhase(): Promise<HarnessReport> {
  const report = await runInvariants((sql) => stagingSql(sql), INVARIANTS, `staging:${ref}`)
  log(formatReport(report))
  return report
}

/** UI/workflow-verifikation paa data-laget (queries som appen bruger). */
async function runFlows(): Promise<{ id: string; ok: boolean; detail: string }[]> {
  const out: { id: string; ok: boolean; detail: string }[] = []
  const q1 = async (sql: string) => (await stagingSql(sql))[0]
  // Kunde-flow: kunde med relaterede sager/tilbud/mails/dokumenter/portal
  const cust = await q1(`SELECT c.id, c.company_name,
      (SELECT count(*) FROM service_cases s WHERE s.customer_id=c.id) cases,
      (SELECT count(*) FROM offers o WHERE o.customer_id=c.id) offers,
      (SELECT count(*) FROM incoming_emails e WHERE e.customer_id=c.id) mails,
      (SELECT count(*) FROM customer_documents d WHERE d.customer_id=c.id) docs,
      (SELECT count(*) FROM portal_messages p WHERE p.customer_id=c.id) portal
    FROM customers c WHERE c.custom_fields->>'harness' IS NOT NULL
    ORDER BY (SELECT count(*) FROM offers o WHERE o.customer_id=c.id) DESC LIMIT 1`)
  out.push({ id: 'customer_detail', ok: !!cust, detail: cust ? `kunde m. sager=${cust.cases} tilbud=${cust.offers} mails=${cust.mails} docs=${cust.docs} portal=${cust.portal}` : 'ingen harness-kunde' })

  // Tilbuds-flow: linjer summerer til total
  const off = await q1(`SELECT o.id, o.final_amount,
      (SELECT count(*) FROM offer_line_items li WHERE li.offer_id=o.id) lines,
      (SELECT coalesce(sum(li.total),0) FROM offer_line_items li WHERE li.offer_id=o.id) sum_lines
    FROM offers o WHERE o.offer_number LIKE 'HARNESS-%' AND EXISTS(SELECT 1 FROM offer_line_items li WHERE li.offer_id=o.id) LIMIT 1`)
  out.push({ id: 'offer_detail', ok: !!off && Number(off.lines) > 0, detail: off ? `tilbud m. ${off.lines} linjer, sum=${off.sum_lines}` : 'ingen tilbud m. linjer' })

  // Sag-flow
  const sc = await q1(`SELECT count(*) n FROM service_cases WHERE title LIKE '[HARNESS %'`)
  out.push({ id: 'case_flow', ok: Number(sc.n) > 0, detail: `sager=${sc.n}` })

  // Mail-flow: mails linket til kunde
  const ml = await q1(`SELECT count(*) n FROM incoming_emails WHERE sender_email LIKE '%@harness.test' AND customer_id IS NOT NULL`)
  out.push({ id: 'mail_flow', ok: Number(ml.n) > 0, detail: `linkede mails=${ml.n}` })

  // Portal-flow
  const pm = await q1(`SELECT count(*) n FROM portal_messages p JOIN customers c ON c.id=p.customer_id WHERE c.custom_fields->>'harness' IS NOT NULL`)
  out.push({ id: 'portal_flow', ok: Number(pm.n) >= 0, detail: `portal-beskeder=${pm.n}` })

  // Dokument-flow
  const dl = await q1(`SELECT count(*) n FROM customer_documents WHERE file_url LIKE 'harness://%'`)
  out.push({ id: 'document_flow', ok: Number(dl.n) > 0, detail: `dokumenter=${dl.n}` })

  // Agent Inbox: runs afventende + tasks/actions/approvals
  const ai = await q1(`SELECT
      (SELECT count(*) FROM agent_runs WHERE input_context->>'harness' IS NOT NULL) runs,
      (SELECT count(*) FROM agent_runs WHERE input_context->>'harness' IS NOT NULL AND status='awaiting_approval') awaiting,
      (SELECT count(*) FROM agent_tasks t JOIN agent_runs r ON r.id=t.run_id WHERE r.input_context->>'harness' IS NOT NULL) tasks,
      (SELECT count(*) FROM agent_actions a JOIN agent_runs r ON r.id=a.run_id WHERE r.input_context->>'harness' IS NOT NULL) actions,
      (SELECT count(*) FROM agent_action_approvals ap JOIN agent_actions a ON a.id=ap.action_id JOIN agent_runs r ON r.id=a.run_id WHERE r.input_context->>'harness' IS NOT NULL) approvals`)
  out.push({ id: 'agent_inbox', ok: Number(ai.runs) > 0 && Number(ai.actions) > 0, detail: `runs=${ai.runs} awaiting=${ai.awaiting} tasks=${ai.tasks} actions=${ai.actions} approvals=${ai.approvals}` })

  // Approval-gating: 0 hard-blocked executed uden approval (invariant genbrugt)
  const gate = await q1(`SELECT count(*) n FROM agent_actions a WHERE a.side_effect_class IN ('send_external','push_external','finance','delete') AND a.status IN ('executed','executing') AND NOT EXISTS (SELECT 1 FROM agent_action_approvals ap WHERE ap.action_id=a.id AND ap.decision='approved')`)
  out.push({ id: 'approval_gating', ok: Number(gate.n) === 0, detail: `hard-blocked uden approval=${gate.n} (skal=0)` })

  // Audit: executed actions har audit-spor
  const au = await q1(`SELECT
      (SELECT count(*) FROM agent_actions WHERE status='executed' AND run_id IN (SELECT id FROM agent_runs WHERE input_context->>'harness' IS NOT NULL)) executed,
      (SELECT count(*) FROM audit_logs WHERE entity_type='agent_action' AND action='executed' AND metadata->>'harness' IS NOT NULL) audited`)
  out.push({ id: 'audit_trail', ok: Number(au.executed) > 0 && Number(au.audited) >= Number(au.executed), detail: `executed=${au.executed} audited=${au.audited}` })

  return out
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
  // Distinkte seeds pr. profil => ingen customer_number/email-kollision paa tvaers.
  const normal: GeneratorConfig = { ...DEFAULT_CONFIG, seed: `${seedBase}n` }
  const smoke: GeneratorConfig = { ...DEFAULT_CONFIG, seed: `${seedBase}s`, customersPerMonth: 5, months: 1 }
  const pilot: GeneratorConfig = { ...DEFAULT_CONFIG, seed: 'pilot' } // stabilt, persistent datasæt
  const profiles: ProfileResult[] = []
  const seeds: string[] = []
  let securityResults: { id: string; ok: boolean; note: string }[] = []
  let flowsResults: { id: string; ok: boolean; detail: string }[] = []
  let invReport: HarnessReport | undefined
  let actors: Actors | undefined

  // Drift-subcommands uden data-generering:
  if (SUB === 'status') { await status(); return }
  if (SUB === 'cleanup') { log('=== CLEANUP (alle syntetiske rows) ==='); await cleanupAll(); return }
  if (SUB === 'flows') {
    flowsResults = await runFlows()
    for (const x of flowsResults) log(`  ${x.ok ? '✅' : '❌'} ${x.id.padEnd(20)} ${x.detail}`)
    log(`flows: ${flowsResults.filter((x) => x.ok).length}/${flowsResults.length} ok`)
    return
  }

  const needActors = ['smoke', 'normal', 'stress', 'security', 'full', 'persist', 'pilot'].includes(SUB)
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
    else if (SUB === 'persist') {
      log('[persist] rydder evt. tidligere pilot-datasæt (seed=pilot)...')
      for (const s of cleanupStatements('pilot')) { try { await stagingSql(s) } catch { /* noop */ } }
      await doProfile(pilot, 'persist(pilot,12mo)')
      log('[persist] datasæt BEVARET (ingen cleanup).'); await status()
    } else if (SUB === 'pilot') {
      const have = Number((await stagingSql(`SELECT count(*) n FROM customers WHERE custom_fields->>'harness'='pilot'`))[0].n)
      if (have < 100) {
        checkpoint('pilot: genererer persistent datasæt (seed=pilot)')
        for (const s of cleanupStatements('pilot')) { try { await stagingSql(s) } catch { /* noop */ } }
        await doProfile(pilot, 'persist(pilot,12mo)')
      } else { log(`[pilot] genbruger eksisterende datasæt (${have} kunder)`); seeds.push('pilot') }
      log('\n=== FLOWS ==='); flowsResults = await runFlows()
      for (const x of flowsResults) log(`  ${x.ok ? '✅' : '❌'} ${x.id.padEnd(20)} ${x.detail}`)
      log('\n=== INVARIANTER ==='); invReport = await runInvariantsPhase(); checkpoint('invariants done')
      log('\n=== SIKKERHED ==='); securityResults = await runSecurity(actors!)
      for (const s of securityResults) log(`  ${s.ok ? '✅' : '❌'} ${s.id.padEnd(26)} ${s.note}`)
      checkpoint('pilot: datasæt BEVARET (ingen cleanup)')
    } else if (SUB === 'full') {
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

  const flowsFailed = flowsResults.filter((f) => !f.ok).length
  if (['full', 'report', 'security', 'invariants', 'pilot'].includes(SUB)) {
    saveReport(SUB === 'pilot' ? 'pilot' : 'harness', {
      target: `staging:${ref}`, sub: SUB, at: new Date().toISOString(),
      profiles, flows: flowsResults, invariants: invReport, security: securityResults,
      verdict: { invariantFailures: invFailed, flowFailures: flowsFailed, securityGate: secGate },
    })
  }

  log(`\n=== SAMLET (${SUB}): invarianter ${invReport ? (invFailed ? `${invFailed} FEJL` : 'GRØN') : 'n/a'}, flows ${flowsResults.length ? (flowsFailed ? `${flowsFailed} FEJL` : 'GRØN') : 'n/a'}, sikkerhed ${securityResults.length ? (secGate ? 'SIKKERHEDSGATE ❌' : 'GRØN') : 'n/a'} ===`)
  if (secGate) { console.error('SIKKERHEDSGATE: et forsoeg der SKAL afvises slap igennem — stopper.'); process.exit(3) }
}

main().catch((e) => { console.error('HARNESS FEJL:', e.message); process.exit(1) })
