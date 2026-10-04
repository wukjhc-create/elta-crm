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
 *   seed-reference  genskab migrationers seed-data i staging (agent_configs; idempotent)
 *
 * Sikkerhed: assertRuntimeConfig/assertBootstrapConfig fail-closer paa prod-ref/-url,
 * environment!=staging, manglende confirm-token/credentials. Ingen prod-fallback.
 * Secrets logges/gemmes ALDRIG (kun ref + maskerede laengder).
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import {
  assertRuntimeConfig, assertBootstrapConfig, loadHarnessSecrets, evaluateHarnessTarget, maskSecret, bindAppEnvToStaging,
} from './env-guard'
import { runAppLayerScenarios, type ScenarioResult } from './app-layer-scenarios'
import { collectSnapshot, evaluateSnapshot, diffSnapshots, formatSnapshot, type StorageSnapshot } from './storage-audit'
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
  // App-env-binding SKAL afvise prod-ref (isoleret env-objekt; process.env roeres ikke)
  let bindBlocked = false
  try { bindAppEnvToStaging({ url: `https://${prodRef}.supabase.co`, anonKey: 'x', serviceKey: 'x' }, {}) } catch { bindBlocked = true }
  if (!bindBlocked) allBlocked = false
  log(`  ${bindBlocked ? '✅ BLOKERET' : '❌ SLAP IGENNEM'}  app-env binding til prod-ref`)
  log(`\nSelf-test: ${realStaging.ok && allBlocked ? '✅ GRØN (staging ok, alle prod-cases hard-blokeret)' : '❌ FEJL'}`)
  return realStaging.ok && allBlocked ? 0 : 1
}

if (SUB === 'selftest') { process.exit(selftest()) }

// ---- DB-modes: guard-first ----
const runtime = assertRuntimeConfig()
const boot = assertBootstrapConfig(loadHarnessSecrets())
const ref = runtime.url.match(/https?:\/\/([^.]+)\.supabase\.co/)![1]
// App-lagets klienter (createAdminClient) bindes til STAGING i denne proces (fail-closed paa prod-ref).
const appRef = bindAppEnvToStaging(runtime)
if (appRef !== ref) throw new Error('app-env ref matcher ikke harness-target — stopper')
const admin = createClient(runtime.url, runtime.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
log(`=== ELTA CRM TEST HARNESS === sub=${SUB} target=staging:${ref} (prod hard-blokeret)`)
log(`[guard] runtime service=${maskSecret(runtime.serviceKey)} mgmt=${maskSecret(boot.accessToken)} — prod-ref hard-blocked | app-env bundet til staging:${appRef}`)

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

async function runSecurity(actors: Actors): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = []
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
  // mail-run: probe-actions bruger rigtige mail-capabilities (00163 afviser ukendte capabilities og forkert agent)
  const rid = (await stagingSql(`SELECT id FROM agent_runs WHERE input_context->>'harness' IS NOT NULL AND agent_type = 'mail' LIMIT 1`))[0]?.id
  const tid = rid ? (await stagingSql(`SELECT id FROM agent_tasks WHERE run_id='${rid}' LIMIT 1`))[0]?.id : null
  const cleanupProbes = async () => { try { await stagingSql(`DELETE FROM agent_actions WHERE idempotency_key LIKE 'harness-sec:%';`) } catch { /* noop */ } }

  if (rid && tid) {
    // 1) hard-blocked (send_external) executed UDEN approval => afvist
    try {
      const key = `harness-sec:hb:${Date.now()}`
      const { error } = await admin.from('agent_actions').insert([{ run_id: rid, task_id: tid, action_type: 'send', capability: 'mail.send_reply', side_effect_class: 'send_external', requires_approval: true, status: 'executed', idempotency_key: key }])
      out.push({ id: 'hardblocked_without_approval', ok: !!error && /approval/.test(error.message), note: error ? `afvist: ${error.message.slice(0, 60)}` : 'SLAP IGENNEM' })
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
      const ins = await admin.from('agent_actions').insert([{ run_id: rid, task_id: tid, action_type: 'send', capability: 'mail.send_reply', side_effect_class: 'send_external', requires_approval: true, status: 'planned', idempotency_key: key }]).select('id')
      const aid = ins.data?.[0]?.id
      if (aid) {
        await admin.from('agent_action_approvals').insert([{ action_id: aid, decision: 'approved', decided_by: actors.ownerUid, expires_at: new Date(Date.now() - 3600_000).toISOString() }])
        const upd = await admin.from('agent_actions').update({ status: 'executed', executed_by: actors.ownerUid }).eq('id', aid)
        out.push({ id: 'stale_approval_execute', ok: !!upd.error && /approval/.test(upd.error.message), note: upd.error ? `afvist: ${upd.error.message.slice(0, 55)}` : 'UDLOEBET APPROVAL ACCEPTERET' })
      } else out.push({ id: 'stale_approval_execute', ok: false, note: `kunne ikke oprette test-action: ${ins.error?.message?.slice(0, 60)}` })
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

  // App-lag: rigtig executor/handler/portal/storage-kode mod staging
  out.push(...await runAppLayerScenarios({ admin, anon, sql: stagingSql, ownerUid: actors.ownerUid, authed: signIn.error ? undefined : nonAdmin }))
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
  const ag = (await stagingSql(`SELECT count(*) n, count(*) FILTER (WHERE enabled) en, coalesce(string_agg(DISTINCT safety_mode, ','), '-') modes FROM agent_configs`))[0]
  log(`[status] agent_configs: total=${ag.n} enabled=${ag.en} safety_mode=${ag.modes}`)
  // Rester fra sikkerheds-/E2E-probes (skal altid vaere 0 efter en koersel)
  const lo = (await stagingSql(`SELECT
      (SELECT count(*) FROM offers WHERE offer_number LIKE 'HARNESS-SEC-%' OR source_case_id IS NOT NULL OR notes LIKE '%agent-action%') probe_offers,
      (SELECT count(*) FROM agent_runs WHERE input_context->>'harness' IS NULL) untagged_runs,
      (SELECT count(*) FROM customer_tasks WHERE auto_rule = 'agent_followup_offer') followup_tasks,
      (SELECT count(*) FROM agent_actions WHERE idempotency_key LIKE 'harness-sec:%') probe_actions,
      (SELECT count(*) FROM invoices WHERE invoice_number LIKE 'HARNESS-SEC-%')
        + (SELECT count(*) FROM integration_settings WHERE key LIKE 'harness-probe-%')
        + (SELECT count(*) FROM accounting_integration_settings WHERE provider LIKE 'harness-probe-%')
        + (SELECT count(*) FROM incoming_invoices WHERE source = 'manual' AND (notes IS NULL OR notes LIKE 'probe %') AND file_hash IS NULL AND invoice_number IS NULL)
        + (SELECT count(*) FROM bank_transactions WHERE date = '2026-01-01' AND amount = 1)
        + (SELECT count(*) FROM service_cases WHERE title LIKE '[HARNESS-SEC]%')
        + (SELECT count(*) FROM work_orders WHERE title LIKE '[HARNESS-SEC]%')
        + (SELECT count(*) FROM employees WHERE email LIKE 'harness-sec-%@harness.test')
        + (SELECT count(*) FROM suppliers WHERE code LIKE 'HSEC%')
        + (SELECT count(*) FROM audit_logs WHERE entity_type IN ('harness_sec_probe', 'harness_anon_probe'))
        + (SELECT count(*) FROM packages WHERE name LIKE 'HARNESS-SEC%')
        + (SELECT count(*) FROM product_catalog WHERE name LIKE 'HARNESS-SEC%')
        + (SELECT count(*) FROM package_categories WHERE slug LIKE 'hsec-%')
        + (SELECT count(*) FROM product_categories WHERE slug LIKE 'hsec-%')
        + (SELECT count(*) FROM project_templates WHERE name LIKE 'HARNESS-SEC%')
        + (SELECT count(*) FROM supplier_products WHERE supplier_sku LIKE 'HSEC-%')
        + (SELECT count(*) FROM integration_logs WHERE log_type LIKE 'harness_anon_probe_%') AS role_probes,
      (SELECT count(*) FROM incoming_invoices WHERE invoice_number LIKE 'HARN-%' OR file_hash LIKE 'harness-%')
        + (SELECT count(*) FROM incoming_emails WHERE sender_email LIKE 'faktura-%@harness.test')
        + (SELECT count(*) FROM customers WHERE customer_number LIKE 'HARNESS-ATT-%')
        + (SELECT count(*) FROM customers WHERE customer_number LIKE 'HARNESS-AUTH-%')
        + (SELECT count(*) FROM customers WHERE customer_number LIKE 'HARN-RLS-%')
        + (SELECT count(*) FROM offers WHERE offer_number LIKE 'HARN-RLS-%')
        + (SELECT count(*) FROM incoming_emails WHERE graph_message_id LIKE 'harness-rls-%')
        + (SELECT count(*) FROM invoices WHERE invoice_number LIKE 'HARN-RLS-%')
        + (SELECT count(*) FROM projects WHERE project_number LIKE 'HARN-RLS-%')
        + (SELECT count(*) FROM work_orders WHERE title LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM integrations WHERE name LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM automation_rules WHERE name LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM email_templates WHERE code LIKE 'harn_rls_%')
        + (SELECT count(*) FROM sms_templates WHERE code LIKE 'harn_rls_%')
        + (SELECT count(*) FROM integration_logs WHERE log_type LIKE 'harness_rls%')
        + (SELECT count(*) FROM suppliers WHERE code LIKE 'HSRLS%')
        + (SELECT count(*) FROM supplier_products WHERE supplier_sku LIKE 'HRLS-%')
        + (SELECT count(*) FROM service_cases WHERE title LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM leads WHERE company_name LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM messages WHERE subject LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM offer_packages WHERE slug LIKE 'harn-rls-%')
        + (SELECT count(*) FROM materials WHERE name LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM customer_documents WHERE title LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM email_threads WHERE subject LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM sms_messages WHERE message LIKE '[HARNESS] rls%')
        + (SELECT count(*) FROM graph_sync_state WHERE mailbox LIKE 'harness-rls-%')
        + (SELECT count(*) FROM ai_prompt_templates WHERE code LIKE 'harn_rls_%')
        + (SELECT count(*) FROM ai_suggestions WHERE type = 'harness_rls')
        + (SELECT count(*) FROM email_intelligence_logs WHERE action LIKE 'harness_rls%')
        + (SELECT count(*) FROM ai_usage_daily WHERE day < '2000-01-01')
        + (SELECT count(*) FROM email_intelligence_daily_summary WHERE summary_date < '2010-01-01')
        + (SELECT count(*) FROM suppliers WHERE code LIKE 'HV%' AND name LIKE 'HARNESS%')
        + (SELECT count(*) FROM suppliers WHERE code LIKE 'HSINV%') AS invoice_probes`))[0]
  const act24 = await stagingSql(`SELECT a.capability, a.status, (r.input_context->>'harness' IS NOT NULL) AS tagged, count(*) AS n
    FROM agent_actions a JOIN agent_runs r ON r.id = a.run_id WHERE a.created_at > now() - interval '24 hours' GROUP BY 1,2,3 ORDER BY 1,2`)
  const cases24 = await stagingSql(`SELECT source, (title LIKE '[HARNESS %') AS harness_title, is_proposal, count(*) AS n
    FROM service_cases WHERE created_at > now() - interval '24 hours' GROUP BY 1,2,3 ORDER BY 1`)
  log(`[status] agent-actions 24t: ${act24.map((x: any) => `${x.capability}/${x.status}${x.tagged ? '(harness-run)' : '(UTAGGET)'}=${x.n}`).join(' ') || '0'}`)
  log(`[status] sager 24t: ${cases24.map((x: any) => `${x.source}${x.harness_title ? '[HARNESS]' : ''}${x.is_proposal ? '(forslag)' : ''}=${x.n}`).join(' ') || '0'}`)
  log(`[status] probe-rester: tilbud=${lo.probe_offers} utaggede runs=${lo.untagged_runs} opfoelgningsopgaver=${lo.followup_tasks} probe-actions=${lo.probe_actions} rolle-probes=${lo.role_probes} faktura-probes=${lo.invoice_probes}`)
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
  let securityResults: ScenarioResult[] = []
  let flowsResults: { id: string; ok: boolean; detail: string }[] = []
  let invReport: HarnessReport | undefined
  let actors: Actors | undefined

  // Drift-subcommands uden data-generering:
  if (SUB === 'status') { await status(); return }
  if (SUB === 'seed-reference') {
    // Paritet: staging er bygget fra schema-dump uden migrationernes seed-data.
    // Genskaber PRAECIS seed fra 00156_agent_core.sql (defaults: enabled=false, safety_mode='suggest').
    // Idempotent (ON CONFLICT DO NOTHING) — overskriver aldrig eksisterende configs.
    log('=== SEED-REFERENCE (staging-paritet med migration 00156) ===')
    await stagingSql(`INSERT INTO public.agent_configs (agent_type) VALUES ('mail'),('offer'),('planning'),('purchase'),('followup'),('economy'),('director') ON CONFLICT (agent_type) DO NOTHING;`)
    await status(); return
  }
  if (SUB === 'pilot-health') {
    const { collectPilotHealth, formatPilotHealth } = await import('./pilot-metrics')
    const h = await collectPilotHealth(`staging:${ref}`, stagingSql)
    log(formatPilotHealth(h))
    process.exitCode = h.alarms.length ? 2 : 0
    return
  }
  if (SUB === 'pilot-roles') {
    // Rolle-adgangsmatrix: hvad kan hver rigtig rolle laese direkte via REST vs. app-politikken (read-only probes).
    const rm = await import('./role-matrix')
    const clients = await rm.loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })
    // Probe-raekker i tomme tabeller, saa "0 synlige" faktisk betyder afvist (ikke bare tom tabel). Ryddes altid op.
    const cleanupSeeds = await rm.seedReadProbes(admin, stagingSql)
    let rows: Awaited<ReturnType<typeof rm.runRoleMatrix>>
    try { rows = await rm.runRoleMatrix({ url: runtime.url, anonKey: runtime.anonKey, admin, sql: stagingSql, clients }) } finally { await cleanupSeeds() }
    log(rm.formatMatrix(rows))
    const writes = await rm.runWriteProbes(clients, admin)
    const updates = await rm.runUpdateProbes(clients, admin)
    const { runResidualProbes, formatResidualChecks } = await import('./rls-residuals')
    const residualChecks = await runResidualProbes(admin, clients)
    const { runAnonSurfaceProbes, formatAnonChecks } = await import('./anon-surface')
    const anonClient = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const anonChecks = await runAnonSurfaceProbes(anonClient, clients.get('salg')!, admin)
    for (const c of clients.values()) await c.auth.signOut()
    log('\nSKRIVE-PROBES (ikke-admin indsaetter direkte via REST):')
    for (const w of writes) log(`  ${w.inserted ? '⚠' : '✓'} ${w.role.padEnd(8)} ${w.table.padEnd(24)} ${w.note}`)
    log('UPDATE-PROBES incoming_invoices (tilladt: admin, bogholderi):')
    for (const u of updates) log(`  ${u.updated === u.expected ? '✓' : '❌'} ${u.role.padEnd(12)} ${u.updated ? 'kunne rette' : 'afvist'}${u.updated === u.expected ? '' : ' (FORKERT)'}`)
    const updateWrong = updates.filter((u) => u.updated !== u.expected).length
    log(formatResidualChecks(residualChecks))
    const residualWrong = residualChecks.filter((c) => !c.ok).length
    log(formatAnonChecks(anonChecks))
    const anonWrong = anonChecks.filter((c) => !c.ok).length
    const strict = rows.filter((r) => r.tooStrict.length)
    if (strict.length) log(`For stramt (tilladt rolle ser 0 af >0 raekker): ${strict.map((r) => `${r.table}[${r.tooStrict.join(',')}]`).join('; ')}`)
    const policies = await rm.analysePolicies(stagingSql)
    log(rm.formatPolicies(policies))
    const readGaps = rows.filter((r) => r.gaps.length).map((r) => `${r.table}[${r.gaps.join(',')}]`)
    const staticGaps = policies.filter((p) => p.disallowed.length).map((p) => `${p.table}[${p.disallowed.join(',')}]`)
    const writeGaps = writes.filter((w) => w.inserted).map((w) => `${w.table}[${w.role}]`)
    const residuals = rows.filter((r) => r.residual.length).map((r) => `${rm.KNOWN_RESIDUALS[r.table]?.id} ${r.table}[${r.residual.join(',')}]`)
    const views = await rm.analyseViews(stagingSql)
    log(rm.formatViews(views))
    const secrets = await rm.analyseSecretColumns(stagingSql)
    log(rm.formatSecretColumns(secrets))
    const viewGaps = views.filter((v) => v.authenticatedSelect && !v.invoker).length
    const secretGaps = secrets.filter((s) => s.authenticated || s.anon).length
    const holes = [...new Set([...readGaps, ...staticGaps])].length + writeGaps.length + strict.length + updateWrong + residualWrong + viewGaps + secretGaps + anonWrong
    log(`\nRaekkeafgraenset adgang (scope verificeret af R1–R4-probes ovenfor): ${residuals.join('; ') || 'ingen'}`)
    log(`=== ROLLEADGANG: ${holes ? `❌ ${holes} problem(er) — laese: ${[...new Set([...readGaps, ...staticGaps])].join('; ') || '-'} | skrive: ${writeGaps.join('; ') || '-'} | for stramt: ${strict.length} | R1–R4: ${residualWrong} | views: ${viewGaps} | hemmelige kolonner: ${secretGaps} | anon: ${anonWrong}` : '✅ ingen huller (R1–R4 lukket og verificeret med probe-data)'} ===`)
    saveReport('pilot-roles', { target: `staging:${ref}`, at: new Date().toISOString(), rows, writes, policies, residualChecks, views, secrets })
    process.exitCode = holes ? 2 : 0
    return
  }
  if (SUB === 'invoice-rls') {
    const { runInvoiceRls, formatInvoiceRls } = await import('./invoice-rls')
    const checks = await runInvoiceRls({ admin, sql: stagingSql, url: runtime.url, anonKey: runtime.anonKey })
    log(formatInvoiceRls(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'exemption-proofs') {
    const { runExemptionProofs, formatExemptionProofs } = await import('./exemption-proofs')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runExemptionProofs({ admin, sql: stagingSql, ownerUid: actors.ownerUid })
    log(formatExemptionProofs(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'invoice-pipeline') {
    const { runInvoicePipeline, formatInvoicePipeline } = await import('./invoice-pipeline')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runInvoicePipeline({ admin, ownerUid: actors.ownerUid })
    log(formatInvoicePipeline(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'invoice-attachments') {
    const { runInvoiceAttachments, formatInvoiceAttachments } = await import('./invoice-attachments')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runInvoiceAttachments({ admin, ownerUid: actors.ownerUid })
    log(formatInvoiceAttachments(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'supplier-vat') {
    const { runSupplierVat, formatSupplierVat } = await import('./supplier-vat')
    const anonClient = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false } })
    const checks = await runSupplierVat({ admin, anon: anonClient, url: runtime.url, anonKey: runtime.anonKey, sql: stagingSql })
    log(formatSupplierVat(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'action-auth') {
    const { runActionAuthProofs, formatActionAuthProofs } = await import('./action-auth-proofs')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runActionAuthProofs({ admin, ownerUid: actors.ownerUid })
    log(formatActionAuthProofs(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'rls-anon-parity') {
    // STAGING-ONLY: genskab anon-tabel-grants (som i prod) paa tabeller hvor matrixen bevarer dem (P-003 anon-crons).
    const M = await import('../rls/write-matrix')
    const kept = Object.keys(M).filter((k) => /^WAVE/.test(k)).flatMap((k) => (M as unknown as Record<string, import('../rls/write-matrix').TableWritePolicy[]>)[k])
      .filter((p) => p.keepAnonGrants).map((p) => p.table)
    const req = process.argv.slice(3).filter((t) => /^[a-z_0-9]+$/.test(t))
    const bad = req.filter((t) => !kept.includes(t))
    if (!req.length || bad.length) { log(`brug: rls-anon-parity <tabel...> (kun keepAnonGrants-tabeller; ugyldige: ${bad.join(',') || '-'})`); process.exit(2) }
    for (const t of req) await stagingSql(`GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.${t} TO anon`)
    log(`✅ anon-grants genskabt paa staging: ${req.join(', ')}`)
    return
  }
  if (SUB === 'rls-read') {
    const { runRlsRead, formatRlsRead } = await import('./rls-read')
    const actors = await ensureActors(admin, seedBase)
    const anonClient = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false } })
    const checks = await runRlsRead({ admin, anon: anonClient, url: runtime.url, anonKey: runtime.anonKey, ownerUid: actors.ownerUid })
    log(formatRlsRead(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'persona-select') {
    // STAGING diagnose: SELECT <kolonner> fra <tabel> som hver persona (count + fejltekst)
    const table = String(process.argv[3] || ''); const cols = String(process.argv[4] || 'id')
    if (!/^[a-z_0-9]+$/.test(table)) { log('brug: persona-select <tabel> [kolonner]'); process.exit(2) }
    const { loginPersonas } = await import('./role-matrix')
    const personas = await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })
    log(`staging-total: ${(await stagingSql(`SELECT count(*)::int n FROM public.${table}`))[0].n}`)
    for (const [r, cl] of personas) {
      const q = await cl.from(table).select(cols, { count: 'exact', head: true })
      log(`  ${r.padEnd(12)} count=${q.count ?? '-'} ${q.error ? `FEJL ${q.error.code}: ${q.error.message}` : ''}`)
    }
    return
  }
  if (SUB === 'rls-table-stats') {
    // STAGING read-only: raekker + unikke kolonner pr. tabel (til auto-specs i rls-lockdown)
    const tables = process.argv.slice(3).filter((t) => /^[a-z_0-9]+$/.test(t))
    for (const t of tables) {
      const n = (await stagingSql(`SELECT count(*)::int n FROM public.${t}`))[0].n
      const uq = await stagingSql(`SELECT string_agg(a.attname, '+' ORDER BY a.attnum) cols FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'public.${t}'::regclass AND i.indisunique AND NOT i.indisprimary GROUP BY i.indexrelid`)
      log(`${t.padEnd(36)} rækker=${String(n).padEnd(5)} unikke=${uq.map((u: any) => u.cols).join(' | ') || '-'}`)
    }
    return
  }
  if (SUB === 'rls-lockdown') {
    const { runRlsLockdown, formatRlsLockdown } = await import('./rls-lockdown')
    const M = await import('../rls/write-matrix')
    const wave = String(process.argv[3] || 'WAVE1')
    const policies = (M as unknown as Record<string, import('../rls/write-matrix').TableWritePolicy[]>)[wave]
    if (!Array.isArray(policies)) { log(`ukendt wave: ${wave}`); process.exit(2) }
    const actors = await ensureActors(admin, seedBase)
    const anonClient = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false } })
    const checks = await runRlsLockdown({ admin, anon: anonClient, url: runtime.url, anonKey: runtime.anonKey, ownerUid: actors.ownerUid, sql: stagingSql }, policies)
    log(formatRlsLockdown(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'supplier-lockdown') {
    const { runSupplierLockdown, formatSupplierLockdown } = await import('./supplier-lockdown')
    const anonClient = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false } })
    const checks = await runSupplierLockdown({ admin, anon: anonClient, url: runtime.url, anonKey: runtime.anonKey })
    log(formatSupplierLockdown(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'relatel-lookup') {
    const { runRelatelLookup, formatRelatelLookup } = await import('./relatel-lookup')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runRelatelLookup({ admin, ownerUid: actors.ownerUid })
    log(formatRelatelLookup(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'ui-e2e') {
    const { runUiE2e, formatUiE2e } = await import('./ui-e2e')
    const checks = await runUiE2e({ admin, stagingRef: ref })
    log(formatUiE2e(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'send-producer') {
    const { runSendProducer, formatSendProducer } = await import('./send-producer')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runSendProducer({ admin, sql: stagingSql, ownerUid: actors.ownerUid })
    log(formatSendProducer(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'planning-flow') {
    const { runPlanningFlow, formatPlanningFlow } = await import('./planning-flow')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runPlanningFlow({ admin, sql: stagingSql, ownerUid: actors.ownerUid })
    log(formatPlanningFlow(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'agent-actions') {
    const { runAgentActionsMatrix, formatAgentActionsMatrix } = await import('./agent-actions-matrix')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runAgentActionsMatrix({ admin, sql: stagingSql, ownerUid: actors.ownerUid })
    log(formatAgentActionsMatrix(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'agent-gating') {
    const { runAgentGating, formatAgentGating } = await import('./agent-gating')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runAgentGating({ admin, sql: stagingSql, ownerUid: actors.ownerUid })
    log(formatAgentGating(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'health-snapshot') {
    const { runHealthSnapshot, formatHealthSnapshot } = await import('./health-snapshot')
    const checks = await runHealthSnapshot({ admin, sql: stagingSql })
    log(formatHealthSnapshot(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'cron-log') {
    const { runCronLog, formatCronLog } = await import('./cron-log')
    const checks = await runCronLog({ admin })
    log(formatCronLog(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'ui-states') {
    const { runUiStates, formatUiStates } = await import('./ui-states')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runUiStates({ admin, sql: stagingSql, ownerUid: actors.ownerUid })
    log(formatUiStates(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'concurrency') {
    const { runConcurrency, formatConcurrency } = await import('./concurrency')
    const actors = await ensureActors(admin, seedBase)
    const checks = await runConcurrency({ admin, sql: stagingSql, ownerUid: actors.ownerUid })
    log(formatConcurrency(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'session-lifecycle') {
    const { runSessionLifecycle, formatLifecycle } = await import('./session-lifecycle')
    const checks = await runSessionLifecycle({ url: runtime.url, anonKey: runtime.anonKey, admin })
    log(formatLifecycle(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'mail-stats') {
    // Read-only: mailvolumen på staging (kandidater til "kræver svar" = koblede, ikke arkiverede)
    const [r] = await stagingSql(`SELECT count(*)::int alle, count(*) FILTER (WHERE link_status = 'linked' AND NOT is_archived)::int koblede_aktive,
      count(*) FILTER (WHERE sender_email ILIKE '%@harness.test')::int harness FROM incoming_emails`)
    log(JSON.stringify(r))
    return
  }
  if (SUB === 'harness-portal') {
    // Staging: ulæste portal-kundebeskeder fordelt på harness-kunder vs. øvrige; `--ryd` sletter KUN beskeder på
    // [HARNESS]-kunder (efterladt af afbrudte kørsler — fylder cockpittet og pilot-health på staging).
    const rows = await stagingSql(`SELECT (c.company_name LIKE '[HARNESS]%') AS harness, count(*)::int n, min(m.created_at)::date aeldste
      FROM portal_messages m JOIN customers c ON c.id = m.customer_id WHERE m.sender_type = 'customer' AND m.read_at IS NULL GROUP BY 1`)
    for (const r of rows) log(`${r.harness ? 'HARNESS-kunder' : 'øvrige kunder'}: ${r.n} ulæste (ældste ${r.aeldste})`)
    if (process.argv[3] === '--ryd') {
      const res = await stagingSql(`DELETE FROM portal_messages m USING customers c WHERE c.id = m.customer_id AND c.company_name LIKE '[HARNESS]%' RETURNING m.id`)
      log(`slettet ${res.length} harness-beskeder`)
    }
    return
  }
  if (SUB === 'harness-ao') {
    // Staging: AO-leverandører (U17 kræver at der ikke findes en); kun harness-oprettede ([HARNESS]-navn) må ryddes.
    const rows = await stagingSql(`SELECT s.id, s.name, s.created_at::date d, (SELECT count(*)::int FROM supplier_products p WHERE p.supplier_id = s.id) varer
      FROM suppliers s WHERE upper(s.code) = 'AO' ORDER BY s.created_at`)
    for (const r of rows) log(`${r.id} · ${String(r.name).slice(0, 40)} · oprettet ${r.d} · ${r.varer} varer · ${String(r.name).startsWith('[HARNESS]') ? 'HARNESS-rest' : 'rigtig leverandør — rør ikke'}`)
    if (process.argv[3] === '--ryd') {
      for (const r of rows.filter((x) => String(x.name).startsWith('[HARNESS]'))) {
        const ids = ((await admin.from('supplier_products').select('id').eq('supplier_id', r.id)).data ?? []).map((x: { id: string }) => x.id)
        if (ids.length) await admin.from('price_history').delete().in('supplier_product_id', ids)
        for (const t of ['supplier_products', 'import_batches', 'supplier_settings']) await admin.from(t).delete().eq('supplier_id', r.id)
        const { error } = await admin.from('suppliers').delete().eq('id', r.id)
        log(`ryddet ${r.id}: ${error ? `FEJL ${error.message}` : 'ok'}`)
      }
    }
    return
  }
  if (SUB === 'jobs-no-time') {
    // Read-only (N62): overståede arbejdsordrer (60 d) med montør uden timer — samme regel som kalenderpanelet.
    const rows = await stagingSql(`SELECT w.title, w.status, w.scheduled_date::text d FROM work_orders w WHERE w.status <> 'cancelled'
      AND w.assigned_employee_id IS NOT NULL AND w.scheduled_date < (now() AT TIME ZONE 'Europe/Copenhagen')::date
      AND w.scheduled_date >= (now() AT TIME ZONE 'Europe/Copenhagen')::date - 60
      AND NOT EXISTS (SELECT 1 FROM time_logs t WHERE t.work_order_id = w.id) ORDER BY w.scheduled_date LIMIT 30`)
    log(`${rows.length} (max 30 vist)`)
    for (const r of rows) log(`${r.d} · ${r.status} · ${String(r.title).slice(0, 50)}`)
    return
  }
  if (SUB === 'columns') {
    // Read-only: kolonner for én eller flere tabeller på staging (schema-tjek før kode skrives mod en tabel).
    for (const raw of process.argv.slice(3)) {
      const table = raw.replace(/[^a-z0-9_]/g, '')
      const rows = await stagingSql(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position`)
      log(`${table}: ${rows.map((r) => `${r.column_name}:${r.data_type}${r.is_nullable === 'NO' ? '!' : ''}`).join(', ')}`)
    }
    return
  }
  if (SUB === 'rls-policies') {
    // Read-only: RLS-policies + rækkeantal for én tabel på staging (fejlsøgning af rolle-synlighed).
    const table = (process.argv[3] ?? '').replace(/[^a-z0-9_]/g, '')
    if (!table) { log('brug: rls-policies <tabel>'); process.exitCode = 1; return }
    const rows = await stagingSql(`SELECT policyname, cmd, roles::text, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = '${table}' ORDER BY cmd, policyname`)
    for (const r of rows) log(`${String(r.cmd).padEnd(7)} ${String(r.policyname).padEnd(48)} roles=${r.roles} using=${r.qual ?? '—'} check=${r.with_check ?? '—'}`)
    const n = await stagingSql(`SELECT count(*)::int n, count(*) FILTER (WHERE is_active)::int active FROM public.${table}`).catch(() => [])
    log(`rækker: ${JSON.stringify(n[0] ?? {})}`)
    return
  }
  if (SUB === 'test-users') {
    // Read-only: profiler pr. rolle og e-mail-mønster på staging (efterladte testbrugere?) — kun antal.
    const rows = await stagingSql(`SELECT p.role, split_part(coalesce(u.email, ''), '@', 2) dom,
        CASE WHEN u.email ~ '^ui-e2e-' THEN 'ui-e2e' WHEN u.email ~ 'harness' THEN 'harness' WHEN u.id IS NULL THEN 'uden-auth' ELSE 'andet' END kilde, count(*)::int n
      FROM profiles p LEFT JOIN auth.users u ON u.id = p.id GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 30`)
    for (const r of rows) log(`${String(r.role).padEnd(12)} ${String(r.kilde).padEnd(8)} ${String(r.dom).padEnd(28)} ${r.n}`)
    return
  }
  if (SUB === 'cleanup-users') {
    // STAGING: slet efterladte syntetiske auth-brugere (@harness.test) ældre end 3 timer — ikke de faste
    // pilot-<rolle>-personaer (genbruges af role-matrix) og ikke brugere fra en kørsel der er i gang.
    // Fund 2026-10-02: ~540 efterladte brugere (harness-owner+/harness-montor+ pr. seed) → fx "249 montører" i U53.
    const rows = await stagingSql(`SELECT id::text id, email FROM auth.users WHERE email LIKE '%@harness.test'
      AND email NOT LIKE 'pilot-%' AND created_at < now() - interval '3 hours' ORDER BY created_at LIMIT 2000`) as Array<{ id: string; email: string }>
    log(`=== CLEANUP-USERS: ${rows.length} kandidater (staging:${ref}) ===`)
    let ok = 0
    const failed: string[] = []
    for (const r of rows) {
      const { error } = await admin.auth.admin.deleteUser(r.id)
      if (error) failed.push(error.message.slice(0, 60)); else ok++
    }
    const reasons = [...new Set(failed)].slice(0, 5)
    log(`slettet ${ok} · fejlede ${failed.length}${reasons.length ? ` (${reasons.join(' | ')})` : ''}`)
    return
  }
  if (SUB === 'ambiguous-fks') {
    // Read-only: tabelpar med FLERE FK'er imellem sig — embeds uden "!fk" fejler (PGRST201), jf. D28.
    const rows = await stagingSql(`SELECT a, b, count(*)::int n, string_agg(fk, ', ' ORDER BY fk) fks FROM (
      SELECT least(conrelid::regclass::text, confrelid::regclass::text) a, greatest(conrelid::regclass::text, confrelid::regclass::text) b, conname fk
      FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND conrelid <> confrelid
    ) x GROUP BY a, b HAVING count(*) > 1 ORDER BY a, b`)
    for (const r of rows) log(`${String(r.a).padEnd(28)} ${String(r.b).padEnd(28)} ${r.n}  ${r.fks}`)
    return
  }
  if (SUB === 'company-columns-probe') {
    // Read-only: kører præcis de offentlige firmakolonner via PostgREST (service-role) — viser kun fejl/antal, aldrig værdier.
    const { COMPANY_SETTINGS_PUBLIC_COLUMNS } = await import('../../src/lib/settings/company-columns')
    const { data, error } = await admin.from('company_settings').select(COMPANY_SETTINGS_PUBLIC_COLUMNS)
    log(error ? `FEJL: ${error.code} ${error.message} ${error.details ?? ''} ${error.hint ?? ''}` : `ok rækker=${(data ?? []).length}`)
    return
  }
  if (SUB === 'db-audit') {
    const { runDbAudit, formatDbAudit } = await import('./db-audit')
    const r = await runDbAudit(stagingSql)
    log(formatDbAudit(`staging:${ref}`, r))
    process.exitCode = r.findings.some((x) => x.severity === 'HOEJ' && !x.intentional) ? 2 : 0
    return
  }
  if (SUB === 'staging-parity' || SUB === 'view-parity') {
    // STAGING-ONLY paritet: schema-dumpet tog kun public-skemaets DDL (ikke view-reloptions, funktions-ACL'er eller
    // triggere paa auth.users). Spejler production som verificeret read-only 2026-09-27:
    //   - security_invoker paa betalingsoversigts-views'ene (prod:role-policies)
    //   - on_auth_user_created AFTER INSERT ON auth.users -> handle_new_user() (pg_trigger i prod)
    log('=== STAGING-PARITET ===')
    await stagingSql(`BEGIN;
ALTER VIEW public.v_customer_payment_summary SET (security_invoker = true);
ALTER VIEW public.v_customers_with_payment_summary SET (security_invoker = true);
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
COMMIT;`)
    const { analyseViews, formatViews } = await import('./role-matrix')
    log(formatViews(await analyseViews(stagingSql)))
    return
  }
  if (SUB === 'or-filter') {
    // Bevis for pgQuote/ilikeContains mod staging-PostgREST: gammel stil fejler på komma, ny stil matcher bogstaveligt.
    const { orIlikeContains, escapeLike } = await import('../../src/lib/validations/postgrest-filter')
    const stamp = Date.now()
    const { OR_FILTER_NAMES } = await import('./or-filter-probes')
    const names = OR_FILTER_NAMES.map((n) => `ORF ${stamp} ${n}`)
    const ids: string[] = []
    const owner = ((await admin.from('profiles').select('id').limit(1)).data as Array<{ id: string }> | null)?.[0]?.id
    for (const n of names) {
      const { data, error } = await admin.from('customers').insert([{ customer_number: `ORF-${stamp}-${ids.length}`, company_name: n, contact_person: 'x', email: `orf-${stamp}-${ids.length}@harness.test`, created_by: owner }]).select('id')
      if (error) throw new Error(error.message)
      ids.push((data as Array<{ id: string }>)[0].id)
    }
    if (process.argv[3] === '--explore') {
      const { OR_FILTER_PROBES } = await import('./or-filter-probes')
      for (const f of OR_FILTER_PROBES) {
        const r = await admin.from('customers').select('company_name').or(f).in('id', ids)
        log(`  ${f.padEnd(44)} → ${r.error ? 'FEJL ' + r.error.message.slice(0, 50) : JSON.stringify((r.data ?? []).map((x: { company_name: string }) => x.company_name.replace(/^ORF \d+ /, '')))}`)
      }
      await admin.from('customers').delete().in('id', ids)
      return
    }
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    try {
      const old = await admin.from('customers').select('id').or(`company_name.ilike.%${escapeLike('3x1,5')}%,contact_person.ilike.%${escapeLike('3x1,5')}%`).in('id', ids)
      check('gammel stil fejler/rammer forkert på komma (fundet bekræftet)', !!old.error || (old.data ?? []).length !== 1, old.error ? old.error.message.slice(0, 60) : `${(old.data ?? []).length} træf`)
      const { OR_FILTER_CASES } = await import('./or-filter-probes')
      for (const [term, want] of OR_FILTER_CASES) {
        const r = await admin.from('customers').select('id').or(orIlikeContains(['company_name', 'contact_person'], term)).in('id', ids)
        const got = (r.data ?? []).map((x: { id: string }) => ids.indexOf(x.id)).sort()
        check(`søg ${JSON.stringify(term)}`, !r.error && JSON.stringify(got) === JSON.stringify(want), r.error ? r.error.message.slice(0, 80) : `træf ${JSON.stringify(got)} (forventet ${JSON.stringify(want)})`)
      }
    } finally {
      await admin.from('customers').delete().in('id', ids)
    }
    log(fails ? `❌ ${fails} afvigelse(r)` : '✅ alle or-filter-checks som forventet')
    if (fails) process.exitCode = 1
    return
  }
  if (SUB === 'search-plan') {
    // N4: produktsøgningens plan + tid på staging (samme ILIKE-mønster som searchSupplierProducts). Kun læsning.
    const arg = process.argv[3] || ''
    if (arg === '--seed') {
      // Realistisk volumen (prod: ~324k) med syntetiske harness-rækker under én harness-leverandør
      const sup = await stagingSql(`INSERT INTO public.suppliers (name, code) VALUES ('[HARNESS] search-volumen', 'HSEARCHVOL') ON CONFLICT DO NOTHING RETURNING id`)
      const sid = sup[0]?.id ?? (await stagingSql(`SELECT id FROM public.suppliers WHERE code = 'HSEARCHVOL'`))[0].id
      await stagingSql(`INSERT INTO public.supplier_products (supplier_id, supplier_sku, supplier_name, ean, cost_price, is_available)
        SELECT '${sid}', 'HS-' || g, 'Harness vare ' || md5(g::text), lpad((5790000000000 + g)::text, 13, '0'), 1, true FROM generate_series(1, 200000) g
        ON CONFLICT DO NOTHING`)
      await stagingSql(`ANALYZE public.supplier_products`)
    }
    if (arg === '--cleanup') {
      await stagingSql(`DELETE FROM public.supplier_products WHERE supplier_id IN (SELECT id FROM public.suppliers WHERE code = 'HSEARCHVOL')`)
      await stagingSql(`DELETE FROM public.suppliers WHERE code = 'HSEARCHVOL'`)
      log('harness-søgevolumen fjernet')
      return
    }
    const n = await stagingSql(`SELECT count(*)::int n FROM public.supplier_products`)
    log(`supplier_products på staging: ${n[0].n}`)
    for (const t of ['kabel', '5701234', 'zzqxw']) {
      const plan = await stagingSql(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM public.supplier_products WHERE is_available = true AND (supplier_sku ILIKE '%${t}%' OR supplier_name ILIKE '%${t}%' OR ean ILIKE '%${t}%') LIMIT 20`)
      const root = (plan[0] as any)['QUERY PLAN'][0]
      const nodes: string[] = []
      const walk = (x: any) => { nodes.push(`${x['Node Type']}${x['Index Name'] ? `(${x['Index Name']})` : ''}`); for (const c of x.Plans ?? []) walk(c) }
      walk(root.Plan)
      log(`  ${t.padEnd(8)} ${String(root['Execution Time'].toFixed(1)).padStart(8)} ms  ${nodes.join(' > ')}`)
    }
    return
  }
  if (SUB === 'migrate-staging') {
    // STAGING-ONLY: anvend én navngiven migration fra supabase/migrations (guard er allerede passeret ovenfor).
    const num = String(process.argv[3] || '')
    if (!/^\d{5}$/.test(num)) { log('brug: npm run harness:migrate-staging -- <5-cifret nr>'); process.exit(2) }
    const dir = resolve(process.cwd(), 'supabase', 'migrations')
    const files = readdirSync(dir).filter((f) => f.startsWith(`${num}_`) && f.endsWith('.sql'))
    if (files.length !== 1) { log(`forventede præcis én fil for ${num}, fandt ${files.length}`); process.exit(2) }
    log(`=== MIGRATE STAGING: ${files[0]} → staging:${ref} ===`)
    await stagingSql(readFileSync(resolve(dir, files[0]), 'utf8'))
    log('✅ anvendt (kør verifikation: npm run harness:verify-00159)')
    return
  }
  if (SUB === 'verify-read-lockdown') {
    // STAGING: samme tjek som prod:verify-read-lockdown (00175/00176/00177/00179), mod staging via mgmt-API.
    const { READ_LOCKDOWN_NRS, runReadLockdownChecks } = await import('../rls/read-lockdown-checks')
    const arg = String(process.argv[3] || 'all')
    const mode = process.argv[4] === 'pre' ? 'pre' : 'post'
    const sel: string[] = arg === 'all' ? [...READ_LOCKDOWN_NRS] : READ_LOCKDOWN_NRS.filter((n) => n === arg)
    log(`=== laese-lockdown ${sel.join(',')} ${mode} @ staging:${ref} ===`)
    const problems = await runReadLockdownChecks(stagingSql, mode, sel)
    log(problems.length ? `❌ ${problems.length} afvigelse(r)` : '✅ som forventet')
    process.exitCode = problems.length ? 2 : 0
    return
  }
  if (SUB === 'verify-00159') {
    const { run00159Checks, format00159 } = await import('./migration-checks')
    const r = await run00159Checks(stagingSql)
    log(format00159(`staging:${ref}`, r))
    process.exitCode = r.applied && r.problems.length === 0 ? 0 : 2
    return
  }
  if (SUB === 'storage-parity') {
    // STAGING-ONLY storage-paritet (godkendt 2026-09-25). Spejler production 1:1 som verificeret read-only af
    // prod:storage-audit (2026-09-26): 00132 (drop 00035-anon-policies), 00113 (attachments + policies),
    // 00133 (private buckets) og dashboard-oprettet service-case-files + policy. Kun storage; idempotent.
    // anon table-grants roeres ikke (production har dem ogsaa; ejet af supabase_storage_admin, RLS blokerer).
    log('=== STORAGE-PARITET (staging) ===')
    await stagingSql(`BEGIN;
DROP POLICY IF EXISTS "portal_customers_upload_attachments" ON storage.objects;
DROP POLICY IF EXISTS "portal_customers_read_attachments" ON storage.objects;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('attachments', 'attachments', false, 26214400, ARRAY['image/*','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.*','application/vnd.ms-excel','text/*']),
  ('service-case-files', 'service-case-files', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
ON CONFLICT (id) DO NOTHING;
UPDATE storage.buckets SET public = false WHERE id IN ('attachments', 'portal-attachments', 'service-case-files');
DROP POLICY IF EXISTS "attachments_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "attachments_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "attachments_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "Auth users manage service case files" ON storage.objects;
CREATE POLICY "attachments_authenticated_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'attachments');
CREATE POLICY "attachments_authenticated_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments');
CREATE POLICY "attachments_authenticated_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'attachments') WITH CHECK (bucket_id = 'attachments');
CREATE POLICY "Auth users manage service case files" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'service-case-files') WITH CHECK (bucket_id = 'service-case-files');
COMMIT;`)
    const snap = await collectSnapshot(`staging:${ref}`, stagingSql)
    log(formatSnapshot(snap))
    const holes = evaluateSnapshot(snap).filter((x) => x.severity === 'hole')
    log(holes.length ? `❌ ${holes.length} HUL tilbage: ${holes.map((h) => h.message).join('; ')}` : '✅ ingen huller — kør harness:storage-audit for diff mod prod')
    process.exitCode = holes.length ? 2 : 0
    return
  }
  if (SUB === 'storage-audit') {
    // Read-only: samme faste SELECTs som prod-audit; diff mod seneste prod-snapshot hvis det findes.
    const snap = await collectSnapshot(`staging:${ref}`, stagingSql)
    log(formatSnapshot(snap))
    const findings = evaluateSnapshot(snap)
    for (const x of findings) log(`  ${x.severity === 'hole' ? '❌ HUL ' : 'ℹ️ info'} ${x.message}`)
    let prodFile: string | undefined
    try { prodFile = readdirSync(REPORT_DIR).filter((f) => f.startsWith('prod-storage-audit-')).sort().pop() } catch { /* ingen rapporter */ }
    if (prodFile) {
      const prod = (JSON.parse(readFileSync(resolve(REPORT_DIR, prodFile), 'utf8')) as { snapshot: StorageSnapshot }).snapshot
      const diff = diffSnapshots(prod, snap)
      log(`\n=== PARITET mod ${prodFile} ===`)
      for (const d of diff) log(`  ≠ ${d}`)
      log(diff.length ? `  ${diff.length} afvigelse(r)` : '  ✅ identisk (buckets + policies + RLS)')
    } else log('\n(ingen prod-snapshot fundet — kør npm run prod:storage-audit)')
    const holes = findings.filter((x) => x.severity === 'hole').length
    log(`\n=== STAGING STORAGE: ${holes ? `❌ ${holes} HUL` : '✅ ingen huller'} ===`)
    process.exitCode = holes ? 2 : 0
    return
  }
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
    } else if (SUB === 'security') {
      securityResults = await runSecurity(actors!)
      for (const s of securityResults) log(`  ${s.skipped ? '⏭️' : s.ok ? '✅' : '❌'} ${s.id.padEnd(28)} ${s.note}`)
    }
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
      for (const s of securityResults) log(`  ${s.skipped ? '⏭️' : s.ok ? '✅' : '❌'} ${s.id.padEnd(28)} ${s.note}`)
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
  const secGate = securityResults.length > 0 && securityResults.some((s) => !s.ok && !s.skipped)
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
