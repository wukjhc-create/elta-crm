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
  if (SUB === 'page-within-ids-check') {
    // pageWithinIds mod RIGTIG PostgREST (tidsstempel-formater, sortering): >200 id'er → side 1/2/3 skal være identiske
    // med én direkte sorteret forespørgsel (uden id-filter, samme rækker). Read-only.
    const { pageWithinIds } = await import('../../src/lib/supabase/in-chunks')
    const { fetchAllRows } = await import('../../src/lib/supabase/fetch-all')
    const rows = await fetchAllRows<{ id: string; received_at: string }>((f, t) => admin.from('incoming_emails').select('id, received_at').order('id').range(f, t))
    const ids = rows.slice(0, 650).map((r) => r.id)
    const idSet = new Set(ids)
    let fails = 0
    for (const asc of [false, true]) {
      const truth = rows.filter((r) => idSet.has(r.id)).sort((a, b) => {
        const ta = Date.parse(a.received_at), tb = Date.parse(b.received_at)
        return ta !== tb ? (asc ? ta - tb : tb - ta) : a.id < b.id ? -1 : 1
      }).map((r) => r.id)
      for (const page of [0, 1, 7]) {
        const r = await pageWithinIds<{ id: string }>(ids, { sortKey: 'received_at', ascending: asc, offset: page * 25, pageSize: 25 },
          (chunk) => admin.from('incoming_emails').select('id, received_at').in('id', chunk).order('id'),
          (pageIds) => admin.from('incoming_emails').select('id, subject').in('id', pageIds))
        const same = JSON.stringify(r.rows.map((x) => x.id)) === JSON.stringify(truth.slice(page * 25, page * 25 + 25)) && r.count === truth.length
        if (!same) fails++
        log(`${same ? 'PASS' : 'FAIL'}  ${asc ? 'ældste' : 'nyeste'} først, side ${page + 1}: ${r.rows.length} rækker, antal ${r.count}/${truth.length}`)
      }
    }
    log(`${ids.length} id'er testet`)
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'portal-fuldmagt-leak-check') {
    // S1 (portal-review 2026-10-07): fuldmagt oprettet på betalerens kort (A) for en sag hvor B er anlægsejer.
    // B (tiltænkt underskriver) skal se CPR/underskrift/PDF; A må KUN se status — hverken i fuldmagt-sektionen eller
    // som dokument. Rydder op. Ingen mail.
    const { getPortalFuldmagter } = await import('../../src/lib/actions/fuldmagt')
    const { getPortalDocuments } = await import('../../src/lib/actions/portal')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const mkCust = async (tag: string) => ((await admin.from('customers').insert({ customer_number: `FL${tag}-${stamp}`, company_name: `[HARNESS] fuldmagt ${tag} ${stamp}`, contact_person: tag, email: `fl${tag.toLowerCase()}-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const a = await mkCust('A'), b = await mkCust('B')
    const caseIds: string[] = []
    try {
      const tokA = randomBytes(32).toString('hex'), tokB = randomBytes(32).toString('hex')
      await admin.from('portal_access_tokens').insert([{ customer_id: a, token: tokA, email: `fla-${stamp}@harness.test`, is_active: true, created_by: owner },
        { customer_id: b, token: tokB, email: `flb-${stamp}@harness.test`, is_active: true, created_by: owner }])
      const { data: sc, error: scErr } = await admin.from('service_cases').insert({ case_number: `SVC-9${String(stamp).slice(-6)}`, customer_id: a, end_customer_id: b, title: '[HARNESS] fuldmagt', status: 'new', created_by: owner }).select('id').single()
      if (scErr) throw new Error(scErr.message)
      caseIds.push((sc as { id: string }).id)
      const desc = JSON.stringify({ type: 'fuldmagt', status: 'signed', order_number: `H-${stamp}`, customer_name: 'B', foedselsdato_cvr: 'HARNESS-CPR', signature_data: 'data:image/png;base64,HARNESS', signed_at: new Date().toISOString() })
      const { error: dErr } = await admin.from('customer_documents').insert({ customer_id: a, service_case_id: caseIds[0], title: 'Fuldmagt [HARNESS]', description: desc, document_type: 'contract', file_url: 'harness://none', storage_path: `harness/${stamp}.pdf`, file_name: 'fuldmagt.pdf', mime_type: 'application/pdf' })
      if (dErr) throw new Error(dErr.message)

      const fa = await getPortalFuldmagter(tokA), fb = await getPortalFuldmagter(tokB)
      const ra = fa.success ? fa.data?.[0] : undefined, rb = fb.success ? fb.data?.[0] : undefined
      check('A (betaler) ser fuldmagten som ikke-underskriver', !!ra && ra.is_intended_signer === false, JSON.stringify({ ok: fa.success, n: fa.data?.length }))
      check('A får INGEN CPR/underskrift/PDF', !!ra && ra.foedselsdato_cvr === null && ra.signature_data === null && ra.pdf_url === null && ra.pdf_storage_path === null)
      check('B (anlægsejer) er underskriver og får sine data', !!rb && rb.is_intended_signer === true && rb.foedselsdato_cvr === 'HARNESS-CPR' && rb.signature_data !== null)
      const da = await getPortalDocuments(tokA)
      check('A\'s dokumentliste indeholder ikke fuldmagten', da.success && !(da.data ?? []).some((d) => d.title === 'Fuldmagt [HARNESS]'), JSON.stringify({ ok: da.success, n: da.data?.length }))
    } finally {
      await admin.from('customer_documents').delete().in('customer_id', [a, b])
      if (caseIds.length) await admin.from('service_cases').delete().in('id', caseIds)
      await admin.from('portal_access_tokens').delete().in('customer_id', [a, b])
      await admin.from('customers').delete().in('id', [a, b])
    }
    log(fails ? `❌ ${fails} fejl` : '✅ fuldmagt-læk lukket')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'cost-lockdown-check') {
    // Kost-lockdown bølge 2 (00200/00201): RIGTIGE persona-sessioner læser hver kost-tabel direkte via REST.
    // Kost-roller (admin/serviceleder/bogholderi) skal se alle rækker (= service-role-antal); salg/montør 0.
    // Tabeller uden rækker på staging kan ikke bevise afvisning → markeres "uden data" (ikke PASS).
    const rm = await import('./role-matrix')
    const clients = await rm.loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })
    const TABLES = (process.argv[3] ?? 'price_history,supplier_product_cache,customer_product_prices,supplier_margin_rules,materials_catalog,material_price_history,calc_components,calc_component_materials,kalkia_nodes,kalkia_variant_materials,package_items,calculation_rows,kalkia_calculations,calibration_presets,quick_jobs').split(',')
    const COST = new Set(['admin', 'serviceleder', 'bogholderi'])
    let fails = 0, nodata = 0
    // 1) user_role() pr. persona-session (politikkernes prædikat)
    for (const [role, cl] of clients) {
      const { data, error } = await cl.rpc('user_role')
      const ok = !error && data === role
      if (!ok) fails++
      log(`${ok ? 'PASS' : 'FAIL'}  user_role() som ${role} = ${error ? 'FEJL ' + error.message : String(data)}`)
    }
    // 2) probe-rækker i tomme tabeller uden FK-kæder (ryddes op)
    const stampP = Date.now()
    const seeded: Array<{ t: string; id: string }> = []
    const seed = async (t: string, row: Record<string, unknown>) => {
      if (((await admin.from(t).select('*', { count: 'exact', head: true })).count ?? 0) > 0) return
      const { data, error } = await admin.from(t).insert([row]).select('id')
      if (error) { log(`  (seed ${t} sprunget over: ${error.message.slice(0, 80)})`); return }
      seeded.push({ t, id: (data?.[0] as { id: string }).id })
    }
    const sup = ((await admin.from('suppliers').select('id').limit(1)).data as Array<{ id: string }> | null)?.[0]?.id
    await seed('quick_jobs', { code: `PROBE-${stampP}`, name: '[HARNESS] probe' })
    await seed('calibration_presets', { code: `PROBE-${stampP}`, name: '[HARNESS] probe' })
    await seed('materials_catalog', { name: `[HARNESS] probe ${stampP}` })
    await seed('calc_components', { name: `[HARNESS] probe ${stampP}` })
    if (sup) await seed('supplier_margin_rules', { supplier_id: sup, rule_type: 'supplier', margin_percentage: 10 })
    try {
    for (const t of TABLES) {
      const total = (await admin.from(t).select('*', { count: 'exact', head: true })).count ?? 0
      const parts: string[] = []
      let ok = true
      for (const [role, cl] of clients) {
        const { count, error } = await cl.from(t).select('*', { count: 'exact', head: true })
        const n = error ? -1 : count ?? 0
        const want = COST.has(role) ? total : 0
        if (n !== want) ok = false
        parts.push(`${role}=${error ? 'FEJL' : n}`)
      }
      if (total === 0) nodata++
      if (!ok) fails++
      log(`${!ok ? 'FAIL' : total === 0 ? 'NODATA' : 'PASS'}  ${t.padEnd(26)} service=${total}  ${parts.join(' ')}`)
    }
    } finally {
      for (const x of seeded) await admin.from(x.t).delete().eq('id', x.id)
    }
    log(`${fails ? '❌' : '✅'} ${fails} fejl · ${TABLES.length - nodata}/${TABLES.length} tabeller med data bevist · ${nodata} uden data (dækket af politik + user_role())`)
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'login-toggle-check') {
    // setProfileLoginActive false → true på en rigtig auth-bruger (staging): ban + is_active op/ned.
    const { setProfileLoginActive } = await import('../../src/lib/auth/login-access')
    const stamp = Date.now()
    const { data: cu, error: ce } = await admin.auth.admin.createUser({ email: `ltc-${stamp}@harness.test`, password: `L-${stamp}-x!Aa`, email_confirm: true })
    if (ce || !cu?.user) throw new Error(ce?.message ?? 'createUser')
    const uid = cu.user.id
    try {
      await admin.from('profiles').update({ role: 'montør', is_active: true }).eq('id', uid)
      const off = await setProfileLoginActive(uid, false)
      const p1 = (await admin.from('profiles').select('is_active').eq('id', uid).single()).data as { is_active: boolean }
      const on = await setProfileLoginActive(uid, true)
      const p2 = (await admin.from('profiles').select('is_active').eq('id', uid).single()).data as { is_active: boolean }
      log(`deaktivér: ${JSON.stringify(off)} → is_active=${p1.is_active}`)
      log(`genaktivér: ${JSON.stringify(on)} → is_active=${p2.is_active}`)
      process.exitCode = off.ok && on.ok && p1.is_active === false && p2.is_active === true ? 0 : 1
    } finally {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined)
    }
    return
  }
  if (SUB === 'cost-lockdown-2b-check') {
    // 00201 med RIGTIGE persona-sessioner: product_catalog.cost_price utilgængelig for ALLE bruger-sessioner (kost via
    // admin-klient bag gate), offentlige kolonner læsbare; customer_supplier_prices + calculations kun kost-roller.
    const rm = await import('./role-matrix')
    const { PRODUCT_PUBLIC_COLUMNS } = await import('../../src/lib/products/product-columns')
    const clients = await rm.loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })
    const COST = new Set(['admin', 'serviceleder', 'bogholderi'])
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const sup = ((await admin.from('suppliers').select('id').limit(1)).data as Array<{ id: string }>)[0].id
    const { data: cu } = await admin.from('customers').insert({ customer_number: `CL2B-${stamp}`, company_name: `[HARNESS] cl2b ${stamp}`, contact_person: 'X', email: `cl2b-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    const prod = (await admin.from('product_catalog').insert({ name: `[HARNESS] cl2b ${stamp}`, list_price: 100, cost_price: 61.23 }).select('id').single()).data as { id: string }
    const csp = (await admin.from('customer_supplier_prices').insert({ customer_id: custId, supplier_id: sup, discount_percentage: 7 }).select('id').single()).data as { id: string }
    const calc = (await admin.from('calculations').insert({ name: `[HARNESS] cl2b ${stamp}`, created_by: owner }).select('id').single()).data as { id: string }
    try {
      for (const [role, cl] of clients) {
        const cost = await cl.from('product_catalog').select('cost_price').eq('id', prod.id)
        const pub = await cl.from('product_catalog').select(PRODUCT_PUBLIC_COLUMNS).eq('id', prod.id)
        check(`${role}: product_catalog.cost_price afvist, offentlige kolonner læsbare`, !!cost.error && !pub.error && (pub.data ?? []).length === 1, cost.error ? '' : 'kost LÆSBAR')
        const want = COST.has(role) ? 1 : 0
        const c1 = (await cl.from('customer_supplier_prices').select('id').eq('id', csp.id)).data?.length ?? -1
        const c2 = (await cl.from('calculations').select('id').eq('id', calc.id)).data?.length ?? -1
        check(`${role}: kundeaftale ${want ? 'synlig' : 'skjult'}, kalkulation ${want ? 'synlig' : 'skjult'}`, c1 === want && c2 === want, `aftale=${c1} kalk=${c2}`)
      }
    } finally {
      await admin.from('calculations').delete().eq('id', calc.id)
      await admin.from('customer_supplier_prices').delete().eq('id', csp.id)
      await admin.from('product_catalog').delete().eq('id', prod.id)
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ bølge 2b ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'lead-pipeline-check') {
    // Leads-review #1/#9: accept markerer kun tilbuddets eget lead vundet (ikke alle kundens); uden lead_id kun ved
    // præcis ét åbent konverteret lead; afsendelse → "Tilbud sendt"; vundet kan genåbnes.
    const { markLeadsWonForAcceptedOffer, markLeadProposalForSentOffer } = await import('../../src/lib/services/lead-won')
    const { isValidLeadTransition } = await import('../../src/types/leads.types')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `LP-${stamp}`, company_name: `[HARNESS] lp ${stamp}`, contact_person: 'X', email: `lp-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const mkLead = async (tag: string, status: string) => ((await admin.from('leads').insert({ company_name: `[HARNESS] lp ${tag}`, contact_person: 'x', email: `lp-${tag}-${stamp}@harness.test`, status, source: 'website', created_by: owner, custom_fields: { customer_id: cust } }).select('id').single()).data as { id: string }).id
    const mkOffer = async (tag: string, leadId: string | null) => ((await admin.from('offers').insert({ offer_number: `LP-${tag}-${stamp}`, title: '[HARNESS] lp', created_by: owner, customer_id: cust, lead_id: leadId, status: 'sent' }).select('id').single()).data as { id: string }).id
    const st = async (id: string) => ((await admin.from('leads').select('status').eq('id', id).single()).data as { status: string }).status
    const offerIds: string[] = []
    try {
      const l1 = await mkLead('1', 'qualified'), l2 = await mkLead('2', 'qualified')
      const o1 = await mkOffer('1', l1); offerIds.push(o1)
      await markLeadProposalForSentOffer(admin, o1, owner)
      check('afsendelse → eget lead "Tilbud sendt"', (await st(l1)) === 'proposal')
      check('afsendelse rører ikke kundens andet lead', (await st(l2)) === 'qualified')
      await markLeadsWonForAcceptedOffer(admin, o1, owner)
      check('accept → eget lead vundet', (await st(l1)) === 'won')
      check('accept rører IKKE kundens andet åbne lead', (await st(l2)) === 'qualified')
      const l3 = await mkLead('3', 'qualified')
      const o2 = await mkOffer('2', null); offerIds.push(o2)
      await markLeadsWonForAcceptedOffer(admin, o2, owner)
      check('tilbud uden lead_id + flere åbne leads → intet ændret', (await st(l2)) === 'qualified' && (await st(l3)) === 'qualified')
      await admin.from('leads').update({ status: 'lost' }).eq('id', l3)
      await markLeadsWonForAcceptedOffer(admin, o2, owner)
      check('tilbud uden lead_id + præcis ét åbent → det vindes', (await st(l2)) === 'won')
      check('vundet kan genåbnes (won → negotiation)', isValidLeadTransition('won', 'negotiation'))
    } finally {
      const { data: ls } = await admin.from('leads').select('id').like('email', `lp-%-${stamp}@harness.test`)
      const ids = ((ls ?? []) as Array<{ id: string }>).map((r) => r.id)
      if (offerIds.length) await admin.from('offers').delete().in('id', offerIds)
      if (ids.length) { await admin.from('lead_activities').delete().in('lead_id', ids); await admin.from('leads').delete().in('id', ids) }
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ lead-pipeline ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'public-contact-limit-check') {
    // Partner-review #3: /api/public/contact — honeypot, dublet inden for 10 min, timegrænse. Test-nøgle sættes kun i
    // denne proces. Rydder op (leads/aktiviteter/kunder med harness-e-mails).
    const testKey = `harness-contact-${Date.now()}`
    process.env.CONTACT_FORM_API_KEY = testKey
    const { POST } = await import('../../src/app/api/public/contact/route')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const mail = (t: string) => `pc-${t}-${stamp}@harness.test`
    const call = async (body: Record<string, unknown>) => {
      const res = await POST(new Request('http://localhost/api/public/contact', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': testKey }, body: JSON.stringify(body) }) as never)
      return { status: res.status, json: (await res.json()) as { success: boolean; leadId?: string } }
    }
    const form = (t: string) => ({ name: `Harness ${t}`, email: mail(t), phone: '12345678', zip: '8000', address: 'Testvej 1', inquiry_type: 'Solceller', message: 'harness' })
    const leadCount = async (t: string) => (await admin.from('leads').select('id', { count: 'exact', head: true }).eq('email', mail(t))).count ?? 0
    const fillerIds: string[] = []
    try {
      const hp = await call({ ...form('hp'), _honey: 'http://spam' })
      check('honeypot udfyldt → 200 men intet gemt', hp.status === 200 && (await leadCount('hp')) === 0, `status=${hp.status}`)
      const a1 = await call(form('a'))
      const a2 = await call(form('a'))
      check('første henvendelse opretter lead', a1.status === 200 && !!a1.json.leadId, JSON.stringify(a1))
      check('samme e-mail inden for 10 min → samme lead, ingen ny række', a2.status === 200 && a2.json.leadId === a1.json.leadId && (await leadCount('a')) === 1)
      const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
      const { count: already } = await admin.from('leads').select('id', { count: 'exact', head: true }).eq('source', 'website').gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
      const need = Math.max(0, 30 - (already ?? 0))
      if (need) {
        const { data: f } = await admin.from('leads').insert(Array.from({ length: need }, (_, i) => ({ company_name: '[HARNESS] fyld', contact_person: 'x', email: mail(`fill${i}`), status: 'new', source: 'website', created_by: owner }))).select('id')
        fillerIds.push(...((f ?? []) as Array<{ id: string }>).map((r) => r.id))
      }
      const b = await call(form('b'))
      check('timegrænse nået → 429 og intet gemt', b.status === 429 && (await leadCount('b')) === 0, `status=${b.status}`)
    } finally {
      if (fillerIds.length) await admin.from('leads').delete().in('id', fillerIds)
      const { data: ls } = await admin.from('leads').select('id').like('email', `pc-%-${stamp}@harness.test`)
      const ids = ((ls ?? []) as Array<{ id: string }>).map((r) => r.id)
      if (ids.length) { await admin.from('lead_activities').delete().in('lead_id', ids); await admin.from('leads').delete().in('id', ids) }
      await admin.from('customers').delete().like('email', `pc-%-${stamp}@harness.test`)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ kontaktformular-grænser ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'confirmation-expiry-check') {
    // Partner-review #5: bekræftet link efter udløb → kun kvittering (ingen PDF/navn/e-mail/sag/bemærkning)
    const { getConfirmationContext } = await import('../../src/lib/actions/document-confirmations')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `DC-${stamp}`, company_name: `[HARNESS] dc ${stamp}`, contact_person: 'X', email: `dc-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    try {
      const { data: d, error: dErr } = await admin.from('customer_documents').insert({ customer_id: cust, title: 'Besigtigelse [HARNESS]', document_type: 'other', file_url: 'harness://none', storage_path: `harness/${stamp}.pdf`, file_name: 'rapport.pdf', mime_type: 'application/pdf' }).select('id').single()
      if (dErr) throw new Error(dErr.message)
      const mk = async (expiresAt: string) => {
        const token = randomBytes(32).toString('hex')
        const { error } = await admin.from('document_confirmations').insert({ customer_document_id: (d as { id: string }).id, token, recipient_type: 'manual', recipient_email: `dc-${stamp}@harness.test`, recipient_name: 'Hemmelig Navn', recipient_role: 'manual', status: 'confirmed', expires_at: expiresAt, confirmed_at: new Date().toISOString(), confirmed_by_name: 'Hemmelig Navn', confirmed_by_email: `dc-${stamp}@harness.test`, confirmation_note: 'privat note' })
        if (error) throw new Error(error.message)
        return token
      }
      const live = await getConfirmationContext(await mk(new Date(Date.now() + 86_400_000).toISOString()))
      check('bekræftet + ikke udløbet → fuld kvittering', live.success && live.data?.state === 'already_confirmed' && live.data.documentTitle === 'Besigtigelse [HARNESS]' && live.data.confirmedByName === 'Hemmelig Navn')
      const old = await getConfirmationContext(await mk(new Date(Date.now() - 86_400_000).toISOString()))
      const o = old.data
      check('bekræftet + udløbet → kun kvittering', old.success && o?.state === 'already_confirmed' && !!o.confirmedAt)
      check('udløbet: ingen PDF/navn/e-mail/sag/bemærkning/titel', !!o && o.pdfUrl === null && !o.confirmedByName && !o.confirmedByEmail && !o.confirmationNote && !o.recipientEmail && !o.recipientName && o.serviceCase === null && !o.documentTitle, JSON.stringify(o))
    } finally {
      await admin.from('customer_documents').delete().eq('customer_id', cust)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ bekræftelses-udløb ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'fuldmagt-sign-race-check') {
    // Partner-review #2: to samtidige underskrifter → kun ét krav; fejl før gem giver kravet tilbage; en igangværende
    // underskrivning afviser. PDF-kaldet stubbes (500 efter 300 ms) → ingen PDF, ingen upload, ingen mail.
    const { submitSignedFuldmagt, getPortalFuldmagter } = await import('../../src/lib/actions/fuldmagt')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input instanceof Request ? input.url : input).includes('/api/fuldmagt/pdf')) {
        await new Promise((r) => setTimeout(r, 300))
        return new Response('stub', { status: 500 })
      }
      return realFetch(input, init)
    }) as typeof fetch
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `FS-${stamp}`, company_name: `[HARNESS] fm-race ${stamp}`, contact_person: 'X', email: `fs-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const tok = randomBytes(32).toString('hex')
    try {
      await admin.from('portal_access_tokens').insert({ customer_id: cust, token: tok, email: `fs-${stamp}@harness.test`, is_active: true, created_by: owner })
      const origDesc = JSON.stringify({ type: 'fuldmagt', status: 'pending', order_number: `H-${stamp}`, customer_name: 'X', expected_signer_customer_id: cust })
      const { data: d } = await admin.from('customer_documents').insert({ customer_id: cust, title: 'Fuldmagt [HARNESS]', description: origDesc, document_type: 'contract', file_url: 'harness://none', file_name: 'fuldmagt.pdf', mime_type: 'application/pdf' }).select('id').single()
      const docId = (d as { id: string }).id
      const input = { foedselsdato_cvr: 'HARNESS', marketing_samtykke: false, signature_data: 'data:image/png;base64,HARNESS', signer_name: 'X' }
      const [r1, r2] = await Promise.all([submitSignedFuldmagt(tok, docId, input), submitSignedFuldmagt(tok, docId, input)])
      const errs = [r1, r2].map((r) => (r.success ? 'OK' : r.error ?? ''))
      check('samtidige underskrifter: præcis én får kravet (den anden afvises)', errs.filter((e) => e.includes('ved at blive underskrevet')).length === 1 && errs.some((e) => e === 'Kunne ikke generere PDF'), JSON.stringify(errs))
      const after = ((await admin.from('customer_documents').select('description').eq('id', docId).single()).data as { description: string }).description
      check('PDF-fejl → kravet frigives (beskrivelsen er uændret)', after === origDesc)
      const fresh = JSON.stringify({ ...JSON.parse(origDesc), status: 'signing', signing_started_at: new Date().toISOString() })
      await admin.from('customer_documents').update({ description: fresh }).eq('id', docId)
      const r3 = await submitSignedFuldmagt(tok, docId, input)
      check('igangværende underskrivning (<10 min) afviser ny', !r3.success && (r3.error ?? '').includes('ved at blive underskrevet'), r3.success ? 'OK' : r3.error)
      const pf = await getPortalFuldmagter(tok)
      check("portalen viser 'signing' som ventende", pf.success && pf.data?.[0]?.status === 'pending', JSON.stringify(pf.data?.[0]?.status))
      const stale = JSON.stringify({ ...JSON.parse(origDesc), status: 'signing', signing_started_at: new Date(Date.now() - 11 * 60_000).toISOString() })
      await admin.from('customer_documents').update({ description: stale }).eq('id', docId)
      const r4 = await submitSignedFuldmagt(tok, docId, input)
      check('afbrudt krav (>10 min) kan genoptages', !r4.success && r4.error === 'Kunne ikke generere PDF', r4.success ? 'OK' : r4.error)
    } finally {
      globalThis.fetch = realFetch
      await admin.from('customer_documents').delete().eq('customer_id', cust)
      await admin.from('portal_access_tokens').delete().eq('customer_id', cust)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ fuldmagt-underskrift atomisk')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'integration-webhook-check') {
    // Partner-review 2026-10-08: integrations-webhook — kun egne external_references, ingen kladde/accept via webhook,
    // gyldige overgange virker, fejlet godkendelse skriver ikke integration_logs. Route-handleren kaldes direkte.
    const { POST } = await import('../../src/app/api/integrations/webhook/[integrationId]/route')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const key = `hk-${stamp}-${Math.random().toString(36).slice(2)}`
    const { data: integ, error: iErr } = await admin.from('integrations').insert({ name: `[HARNESS] webhook ${stamp}`, is_active: true, api_key: key }).select('id').single()
    if (iErr) throw new Error(`integration: ${iErr.message}`)
    const integId = (integ as { id: string }).id
    const { data: cu } = await admin.from('customers').insert({ customer_number: `WH-${stamp}`, company_name: `[HARNESS] wh ${stamp}`, contact_person: 'X', email: `wh-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    const mkOffer = async (tag: string, status: string) => ((await admin.from('offers').insert([{ offer_number: `WH-${tag}-${stamp}`, title: '[HARNESS] webhook', created_by: owner, customer_id: custId, status }]).select('id').single()).data as { id: string }).id
    const accepted = await mkOffer('acc', 'accepted'), sent = await mkOffer('sent', 'sent'), foreign = await mkOffer('foreign', 'sent')
    await admin.from('external_references').insert([{ integration_id: integId, entity_type: 'offer', entity_id: accepted, external_id: `ext-acc-${stamp}` },
      { integration_id: integId, entity_type: 'offer', entity_id: sent, external_id: `ext-sent-${stamp}` }])
    const call = async (body: Record<string, unknown>, apiKey = key) => {
      const req = new Request(`http://localhost/api/integrations/webhook/${integId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify(body) })
      return POST(req as never, { params: Promise.resolve({ integrationId: integId }) })
    }
    const st = async (id: string) => ((await admin.from('offers').select('status').eq('id', id).single()).data as { status: string }).status
    try {
      const logsBefore = (await admin.from('integration_logs').select('id', { count: 'exact', head: true }).eq('integration_id', integId)).count ?? 0
      const bad = await call({ external_id: `ext-sent-${stamp}`, status: 'rejected' }, 'forkert-nøgle')
      const logsAfter = (await admin.from('integration_logs').select('id', { count: 'exact', head: true }).eq('integration_id', integId)).count ?? 0
      check('forkert nøgle → 401 og INGEN log-række i DB', bad.status === 401 && logsAfter === logsBefore, `status=${bad.status} logs ${logsBefore}→${logsAfter}`)
      await call({ offer_number: `WH-foreign-${stamp}`, status: 'rejected' })
      check('tilbud uden egen external_reference røres ikke (rå offer_number ignoreres)', (await st(foreign)) === 'sent')
      await call({ external_id: `ext-acc-${stamp}`, status: 'pending' })
      check("'pending'/kladde kan ikke genåbne accepteret tilbud", (await st(accepted)) === 'accepted')
      await call({ external_id: `ext-sent-${stamp}`, status: 'accepted' })
      check("'accepted' via webhook afvises (kræver underskrift)", (await st(sent)) === 'sent')
      await call({ external_id: `ext-sent-${stamp}`, status: 'declined' })
      check('gyldig overgang (sendt → afvist) via egen reference virker', (await st(sent)) === 'rejected')
    } finally {
      await admin.from('integration_logs').delete().eq('integration_id', integId)
      await admin.from('external_references').delete().eq('integration_id', integId)
      await admin.from('offers').delete().in('id', [accepted, sent, foreign])
      await admin.from('integrations').delete().eq('id', integId)
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ webhook-sikring ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'reminder-reconcile-check') {
    // R-MAIL-B #8: afbrudt rykker-krav (reminder_count hævet, ingen log) genoprettes efter 15 min; 'sent' og ukendt
    // udfald (uncertain_timeout) tæller som brugt; friskt krav røres ikke. Kunden har en .local-pladsholder → afsendelse
    // afvises lokalt efter afstemningen (ingen mail sendes).
    const { sendInvoiceReminder } = await import('../../src/lib/services/invoices')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: cu, error: cErr } = await admin.from('customers').insert({ customer_number: `RR-${stamp}`, company_name: `[HARNESS] rr ${stamp}`, contact_person: 'X', email: `auto+rr${stamp}@elta-crm.local`, created_by: owner }).select('id').single()
    if (cErr) throw new Error(`kunde: ${cErr.message}`)
    const custId = (cu as { id: string }).id
    const invIds: string[] = []
    const mk = async (tag: string, claimAgoMin: number, logRow: null | { status: string; reason: string | null }) => {
      const due = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      const { data, error } = await admin.from('invoices').insert({ invoice_number: `H-RR-${tag}-${stamp}`, customer_id: custId, status: 'sent', sent_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
        due_date: due, total_amount: 80, tax_amount: 20, final_amount: 100, reminder_count: 1, last_reminder_at: new Date(Date.now() - claimAgoMin * 60_000).toISOString() }).select('id').single()
      if (error) throw new Error(`faktura ${tag}: ${error.message}`)
      const id = (data as { id: string }).id
      invIds.push(id)
      if (logRow) await admin.from('invoice_reminder_log').insert({ invoice_id: id, level: 1, status: logRow.status, reason: logRow.reason })
      await sendInvoiceReminder(id).catch(() => undefined)
      return ((await admin.from('invoices').select('reminder_count').eq('id', id).single()).data as { reminder_count: number }).reminder_count
    }
    try {
      check('afbrudt krav (1 t, ingen log) → niveau genoprettet (0)', (await mk('orphan', 60, null)) === 0)
      check("krav med 'sent'-log bevares (1)", (await mk('sent', 60, { status: 'sent', reason: null })) === 1)
      check('krav med ukendt udfald (uncertain_timeout) bevares — ingen genafsendelse (1)', (await mk('uncertain', 60, { status: 'failed', reason: 'uncertain_timeout' })) === 1)
      check('frisk krav (5 min — kørsel i gang) røres ikke (1)', (await mk('fresh', 5, null)) === 1)
      check('krav med in_flight-log (dræbt under afsendelse) bevares — ingen dublet (1)', (await mk('inflight', 60, { status: 'failed', reason: 'in_flight' })) === 1)
      check('eskalering (manual_review) bevares — rulles ikke tilbage (1)', (await mk('manual', 60, { status: 'manual_review', reason: 'escalated' })) === 1)
    } finally {
      for (const id of invIds) { await admin.from('invoice_reminder_log').delete().eq('invoice_id', id); await admin.from('invoices').delete().eq('id', id) }
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ rykker-afstemning ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'automation-claim-check') {
    // R-MAIL-B #11: regelmotoren kræver (rule, entitet) FØR handlingen. 3 samtidige hændelser → præcis én udførelse;
    // fejlende handling → 'failed' (pladsen frigives). Handling create_task (ingen mail). Unik trigger → kun testreglen.
    const { evaluateAndRunAutomations } = await import('../../src/lib/automation/rule-engine')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: cu } = await admin.from('customers').insert({ customer_number: `AC-${stamp}`, company_name: `[HARNESS] ac ${stamp}`, contact_person: 'X', email: `ac-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    const trigger = `harness_claim_${stamp}`
    const { data: ru, error: rErr } = await admin.from('automation_rules').insert({ name: `[HARNESS] claim ${stamp}`, trigger, condition_json: {}, action: 'create_task',
      action_config: { title: `[HARNESS] claim ${stamp}` }, active: true, dry_run: false }).select('id').single()
    if (rErr) throw new Error(`regel: ${rErr.message}`)
    const ruleId = (ru as { id: string }).id
    try {
      const ev = { trigger, entityType: 'customer', entityId: custId, payload: { customer_id: custId } } as never
      await Promise.all([evaluateAndRunAutomations(ev), evaluateAndRunAutomations(ev), evaluateAndRunAutomations(ev)])
      const ex = (await admin.from('automation_executions').select('status').eq('rule_id', ruleId)).data as Array<{ status: string }>
      const tasks = (await admin.from('customer_tasks').select('id', { count: 'exact', head: true }).eq('customer_id', custId).eq('title', `[HARNESS] claim ${stamp}`)).count
      check('3 samtidige hændelser → præcis én udførelse', ex.filter((e) => e.status === 'executed').length === 1, JSON.stringify(ex.map((e) => e.status)))
      check('præcis én opgave oprettet', tasks === 1, String(tasks))
      // fejlende handling (ingen kunde) → failed, ingen 'executed'-række tilbage
      const ev2 = { trigger, entityType: 'offer', entityId: crypto.randomUUID(), payload: {} } as never
      await evaluateAndRunAutomations(ev2)
      const ex2 = (await admin.from('automation_executions').select('status').eq('rule_id', ruleId).eq('entity_type', 'offer')).data as Array<{ status: string }>
      check('fejlende handling → failed (pladsen frigivet)', ex2.length === 1 && ex2[0].status === 'failed', JSON.stringify(ex2))
    } finally {
      await admin.from('automation_executions').delete().eq('rule_id', ruleId)
      await admin.from('automation_rules').delete().eq('id', ruleId)
      await admin.from('customer_tasks').delete().eq('customer_id', custId)
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ regelmotor-krav ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'offer-revisions-check') {
    // 00203 (STAGING): revisioner — snapshot ved afsendelse, ny revision, afløsning, uforanderligt snapshot (RLS),
    // portal viser gældende revision, afløst kan ikke accepteres (afvises FØR underskrift/mail), accepteret kan ikke
    // revideres. Ingen mail sendes. Alt seedet ryddes.
    process.env.OFFER_REVISIONS_ENABLED = 'true'
    const rv = await import('../../src/lib/offers/revisions')
    const { getPortalOffers, getPortalOffer, acceptOffer } = await import('../../src/lib/actions/portal')
    const rm = await import('./role-matrix')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: cu } = await admin.from('customers').insert({ customer_number: `REV-${stamp}`, company_name: `[HARNESS] rev ${stamp}`, contact_person: 'Kunde', email: `rev-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    const tok = randomBytes(32).toString('hex')
    await admin.from('portal_access_tokens').insert({ customer_id: custId, token: tok, email: `rev-${stamp}@harness.test`, is_active: true, created_by: owner })
    const offerIds: string[] = []
    try {
      const { data: o1 } = await admin.from('offers').insert([{ offer_number: `REV-${stamp}`, title: '[HARNESS] revision', created_by: owner, customer_id: custId, status: 'draft' }]).select('id').single()
      const r1 = (o1 as { id: string }).id; offerIds.push(r1)
      await admin.from('offer_line_items').insert([{ offer_id: r1, position: 1, description: 'Linje', quantity: 1, unit: 'stk', unit_price: 1000, sale_price: 1000, total: 1000 }])
      await admin.from('offers').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', r1)
      await rv.recordOfferSent(r1, owner)
      const s1 = (await admin.from('offer_snapshots').select('id, revision_number, snapshot').eq('offer_id', r1)).data as Array<{ id: string; revision_number: number; snapshot: { lines: Array<{ unit_price: number }> } }>
      check('afsendelse gemmer snapshot (rev 1)', s1.length === 1 && s1[0].revision_number === 1 && Number(s1[0].snapshot.lines[0]?.unit_price) === 1000)

      const nr = await rv.createOfferRevision(r1, owner)
      const r2 = nr.ok ? nr.id : ''
      if (r2) offerIds.push(r2)
      const r2row = r2 ? ((await admin.from('offers').select('status, revision_of, revision_number, offer_number').eq('id', r2).single()).data as { status: string; revision_of: string; revision_number: number; offer_number: string }) : null
      const r2lines = r2 ? (await admin.from('offer_line_items').select('id', { count: 'exact', head: true }).eq('offer_id', r2)).count : 0
      check('ny revision = kladde R2 med kæde og kopierede linjer', !!r2row && r2row.status === 'draft' && r2row.revision_of === r1 && r2row.revision_number === 2 && r2row.offer_number.endsWith('-R2') && r2lines === 1, nr.ok ? r2row?.offer_number ?? '' : nr.error)
      const dup = await rv.createOfferRevision(r1, owner)
      check('kun én åben revision ad gangen', !dup.ok)

      await admin.from('offer_line_items').update({ unit_price: 1200, sale_price: 1200, total: 1200 }).eq('offer_id', r2)
      await admin.from('offers').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', r2)
      await rv.recordOfferSent(r2, owner)
      const r1after = (await admin.from('offers').select('superseded_by').eq('id', r1).single()).data as { superseded_by: string | null }
      check('R1 afløst af R2 ved afsendelse af R2', r1after.superseded_by === r2)
      const s1again = (await admin.from('offer_snapshots').select('snapshot').eq('offer_id', r1).single()).data as { snapshot: { lines: Array<{ unit_price: number }> } }
      check('R1-snapshot uændret (1.000) trods ny pris i R2', Number(s1again.snapshot.lines[0]?.unit_price) === 1000)

      // uforanderligt: ingen bruger-rolle kan ændre/slette snapshots
      const clients = await rm.loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })
      for (const [role, cl] of clients) {
        const up = await cl.from('offer_snapshots').update({ revision_number: 99 }).eq('offer_id', r1).select('id')
        const del = await cl.from('offer_snapshots').delete().eq('offer_id', r1).select('id')
        check(`${role}: snapshot kan ikke ændres/slettes`, (up.data ?? []).length === 0 && (del.data ?? []).length === 0, up.error?.message ?? '')
      }
      const still = (await admin.from('offer_snapshots').select('revision_number').eq('offer_id', r1).single()).data as { revision_number: number }
      check('snapshot stadig rev 1 efter forsøg', still.revision_number === 1)

      // portal
      const list = await getPortalOffers(tok)
      const ids = (list.data ?? []).map((x) => (x as { id: string }).id)
      check('portal viser kun gældende revision (R2)', list.success && ids.includes(r2) && !ids.includes(r1), JSON.stringify(ids.length))
      const old = await getPortalOffer(tok, r1)
      check('afløst revision i portal → henvisning til ny version', !old.success && /erstattet/.test(old.error ?? ''), old.error ?? '')
      const acc = await acceptOffer(tok, { offer_id: r1, signer_name: 'Test', signer_email: `rev-${stamp}@harness.test`, signature_data: 'data:image/png;base64,AA' } as never)
      check('afløst revision kan ikke accepteres (afvist før underskrift/mail)', !acc.success && /erstattet/.test(acc.error ?? ''), acc.error ?? '')
      const sigs = (await admin.from('offer_signatures').select('id', { count: 'exact', head: true }).eq('offer_id', r1)).count
      check('ingen underskrift gemt på afløst revision', sigs === 0)
      const snap2 = await rv.latestSnapshotId(r2)
      const s2 = (await admin.from('offer_snapshots').select('id, revision_number').eq('offer_id', r2).single()).data as { id: string; revision_number: number }
      check('underskrift på R2 bindes til R2-snapshot (latestSnapshotId)', snap2 === s2.id && s2.revision_number === 2)

      await admin.from('offers').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', r2)
      const accRev = await rv.createOfferRevision(r2, owner)
      check('accepteret tilbud kan ikke revideres', !accRev.ok)
      const hist = await rv.getRevisionHistory(r2)
      check('historik viser kæden R1 → R2 med sendetidspunkter', hist.length === 2 && hist[0].id === r1 && hist[1].id === r2 && !!hist[0].snapshot_sent_at && !!hist[0].superseded_at)
    } finally {
      for (const id of offerIds.reverse()) {
        await admin.from('offer_activities').delete().eq('offer_id', id)
        await admin.from('offer_snapshots').delete().eq('offer_id', id)
        await admin.from('offer_line_items').delete().eq('offer_id', id)
      }
      for (const id of offerIds) await admin.from('offers').update({ revision_of: null, superseded_by: null }).eq('id', id)
      for (const id of offerIds) await admin.from('offers').delete().eq('id', id)
      await admin.from('portal_access_tokens').delete().eq('customer_id', custId)
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ revisioner ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'portal-limits-check') {
    // R-PRT-B (Henrik 2026-10-07): portal-grænser. Kun AFVISNINGS-stierne testes — de returnerer før indsættelse og
    // før notifikationsmailen (ingen mail sendes). Seed: 20 kundebeskeder seneste time + 20 filer i dag. Ryddes op.
    const { sendPortalMessage, uploadPortalAttachment } = await import('../../src/lib/actions/portal')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: cu } = await admin.from('customers').insert({ customer_number: `PL-${stamp}`, company_name: `[HARNESS] pl ${stamp}`, contact_person: 'Kunde', email: `pl-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    const tok = randomBytes(32).toString('hex')
    await admin.from('portal_access_tokens').insert({ customer_id: custId, token: tok, email: `pl-${stamp}@harness.test`, is_active: true, created_by: owner })
    const paths: string[] = []
    try {
      const long = await sendPortalMessage(tok, { customer_id: custId, message: 'x'.repeat(5001) } as never)
      check('besked > 5.000 tegn afvises', !long.success && /for lang/.test(long.error ?? ''), long.error ?? '')
      const att = Array.from({ length: 11 }, () => ({ url: 'x', name: 'x', size: 1, type: 'text/plain' }))
      const many = await sendPortalMessage(tok, { customer_id: custId, message: 'hej', attachments: att } as never)
      check('> 10 vedhæftninger afvises', !many.success && /vedhæftninger/.test(many.error ?? ''), many.error ?? '')
      await admin.from('portal_messages').insert(Array.from({ length: 20 }, (_, i) => ({ customer_id: custId, sender_type: 'customer', sender_name: 'Kunde', message: `seed ${i}`, attachments: [] })))
      const rate = await sendPortalMessage(tok, { customer_id: custId, message: 'en mere' } as never)
      check('21. besked inden for en time afvises', !rate.success && /mange beskeder/.test(rate.error ?? ''), rate.error ?? '')
      for (let i = 0; i < 20; i++) {
        const pth = `${custId}/${Date.now()}-${i}-seed.txt`
        const { error } = await admin.storage.from('portal-attachments').upload(pth, new Blob(['seed'], { type: 'text/plain' }), { upsert: false })
        if (!error) paths.push(pth)
      }
      const fd = new FormData()
      fd.append('file', new File(['hej'], 'test.txt', { type: 'text/plain' }))
      const up = await uploadPortalAttachment(tok, fd)
      check('21. upload samme døgn afvises', !up.success && /mange filer/.test(up.error ?? ''), up.error ?? `seedede filer=${paths.length}`)
    } finally {
      if (paths.length) await admin.storage.from('portal-attachments').remove(paths)
      await admin.from('portal_messages').delete().eq('customer_id', custId)
      await admin.from('portal_access_tokens').delete().eq('customer_id', custId)
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ portal-grænser ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'offer-invoice-unit-price-check') {
    // 00198 (STAGING): create_invoice_from_offer prissætter med unit_price — en linje med sale_price 0 (manuel linje før
    // rettelsen) faktureres til tilbudsprisen, ikke 0 kr. RPC kaldes direkte (uden app-værnet). Ingen mail.
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: cu } = await admin.from('customers').insert({ customer_number: `OIU-${stamp}`, company_name: `[HARNESS] oiu ${stamp}`, contact_person: 'X', email: `oiu-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    const { data: of, error: oErr } = await admin.from('offers').insert([{ offer_number: `UI-E2E-OIU-${stamp}`, title: '[HARNESS] 00198', created_by: owner, customer_id: custId, status: 'accepted', accepted_at: new Date().toISOString() }]).select('id').single()
    if (oErr) throw new Error(oErr.message)
    const offerId = (of as { id: string }).id
    let invId: string | null = null
    try {
      await admin.from('offer_line_items').insert([{ offer_id: offerId, position: 1, description: 'Manuel linje', quantity: 2, unit: 'stk', unit_price: 1000, sale_price: 0, total: 2000 }])
      const { data, error } = await admin.rpc('create_invoice_from_offer', { p_offer_id: offerId, p_due_days: 14 })
      invId = data ? String(data) : null
      const inv = invId ? ((await admin.from('invoices').select('total_amount, final_amount').eq('id', invId).single()).data as { total_amount: number; final_amount: number }) : null
      const lines = invId ? ((await admin.from('invoice_lines').select('unit_price, total_price').eq('invoice_id', invId)).data as Array<{ unit_price: number; total_price: number }>) : []
      check('faktura = tilbudspris (2 × 1.000 = 2.000 ekskl. moms), ikke 0 kr', !error && Number(inv?.total_amount) === 2000 && Number(lines[0]?.unit_price) === 1000, error?.message ?? JSON.stringify({ inv, lines }))
      check('moms 25 % → 2.500 inkl. moms', Number(inv?.final_amount) === 2500, String(inv?.final_amount))
    } finally {
      if (invId) { await admin.from('invoice_lines').delete().eq('invoice_id', invId); await admin.from('invoices').delete().eq('id', invId) }
      await admin.from('offer_line_items').delete().eq('offer_id', offerId)
      await admin.from('offers').delete().eq('id', offerId)
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ 00198 ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'rejected-hours-check') {
    // Henrik 2026-10-07 (00202 + app-filtre): én godkendt (2 t) og én AFVIST (3 t) time på samme arbejdsordre →
    // avance-funktion, faktura fra arbejdsordre og faktura fra sag tæller kun 2 t. Alt seedet ryddes.
    const { createInvoiceDraftFromCase } = await import('../../src/lib/services/invoice-from-case')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const ids: Record<string, string> = {}
    const ins = async (t: string, row: Record<string, unknown>) => {
      const { data, error } = await admin.from(t).insert([row]).select('id').single()
      if (error) throw new Error(`seed ${t}: ${error.message}`)
      return (data as { id: string }).id
    }
    const invoiceIds: string[] = []
    try {
      ids.cust = await ins('customers', { customer_number: `RH-${stamp}`, company_name: `[HARNESS] rh ${stamp}`, contact_person: 'X', email: `rh-${stamp}@harness.test`, created_by: owner })
      ids.case = await ins('service_cases', { case_number: `SVC-6${String(stamp).slice(-6)}`, customer_id: ids.cust, title: '[HARNESS] afviste timer', status: 'in_progress', created_by: owner })
      ids.emp = await ins('employees', { name: `[HARNESS] rh ${stamp}`, email: `rhe-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 500 })
      ids.wo = await ins('work_orders', { title: '[HARNESS] rh', case_id: ids.case, customer_id: ids.cust, status: 'done', assigned_employee_id: ids.emp })
      const day = new Date(Date.now() - 2 * 86_400_000)
      const at = (h: number) => new Date(day.getTime() + h * 3_600_000).toISOString()
      ids.ok = await ins('time_logs', { employee_id: ids.emp, work_order_id: ids.wo, start_time: at(0), end_time: at(2), billable: true, approval_status: 'approved' })
      ids.rej = await ins('time_logs', { employee_id: ids.emp, work_order_id: ids.wo, start_time: at(3), end_time: at(6), billable: true, approval_status: 'rejected', rejection_reason: 'harness' })
      const st = (await admin.from('time_logs').select('id, approval_status, hours').in('id', [ids.ok, ids.rej])).data as Array<{ id: string; approval_status: string; hours: number }>
      check('seed: 1 godkendt (2 t) + 1 afvist (3 t)', st.length === 2 && st.some((r) => r.approval_status === 'rejected'), JSON.stringify(st.map((r) => [r.approval_status, r.hours])))
      // 1) avance-funktion
      const { data: prof, error: pErr } = await admin.rpc('calculate_work_order_profit', { p_work_order_id: ids.wo })
      const p = prof as Record<string, unknown> | null
      check('calculate_work_order_profit: kun 2 t (afvist udeladt)', !pErr && Number(p?.total_hours) === 2, pErr?.message ?? `timer=${p?.total_hours} logs=${p?.time_log_count}`)
      // 2) faktura fra sag (app) — begge timer vælges, den afviste springes over
      const res = await createInvoiceDraftFromCase(ids.case, owner, { time_log_ids: [ids.ok, ids.rej] })
      if (res.invoice_id) invoiceIds.push(res.invoice_id)
      check('faktura fra sag: afvist time sprunget over (reason=rejected)', res.skipped_lines.some((x) => x.source_id === ids.rej && x.reason === 'rejected') && res.created_lines.some((x) => x.source_id === ids.ok), res.message)
      // frigiv den godkendte igen og ryd fakturaen, så arbejdsordre-fakturaen kan testes
      for (const iid of invoiceIds.splice(0)) { await admin.from('time_logs').update({ invoice_line_id: null }).eq('work_order_id', ids.wo); await admin.from('invoice_lines').delete().eq('invoice_id', iid); await admin.from('invoices').delete().eq('id', iid) }
      // 3) faktura fra arbejdsordre (SQL)
      const { data: woInv, error: wErr } = await admin.rpc('create_invoice_from_work_order', { p_work_order_id: ids.wo, p_due_days: 14, p_default_hourly_rate: 495 })
      if (woInv) invoiceIds.push(String(woInv))
      const lines = woInv ? ((await admin.from('invoice_lines').select('quantity, unit').eq('invoice_id', String(woInv))).data as Array<{ quantity: number; unit: string }>) : []
      const hrs = lines.filter((l) => l.unit === 'time').reduce((a, l) => a + Number(l.quantity), 0)
      const rejLeft = ((await admin.from('time_logs').select('invoice_line_id').eq('id', ids.rej).single()).data as { invoice_line_id: string | null }).invoice_line_id
      check('faktura fra arbejdsordre: 2 t faktureret, afvist time ikke bundet', !wErr && hrs === 2 && rejLeft === null, wErr?.message ?? `timer=${hrs}`)
    } finally {
      for (const iid of invoiceIds) { await admin.from('time_logs').update({ invoice_line_id: null }).eq('work_order_id', ids.wo); await admin.from('invoice_lines').delete().eq('invoice_id', iid); await admin.from('invoices').delete().eq('id', iid) }
      if (ids.wo) { await admin.from('work_order_profit').delete().eq('work_order_id', ids.wo); await admin.from('time_logs').delete().eq('work_order_id', ids.wo); await admin.from('work_orders').delete().eq('id', ids.wo) }
      if (ids.emp) await admin.from('employees').delete().eq('id', ids.emp)
      if (ids.case) await admin.from('service_cases').delete().eq('id', ids.case)
      if (ids.cust) await admin.from('customers').delete().eq('id', ids.cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ afviste timer udeladt overalt')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'function-acl') {
    // Read-only: funktions-ACL + EXECUTE pr. rolle på staging (spejler scripts/prod-fn-acl.ts)
    const name = process.argv[3]
    if (!/^[a-z_]+$/.test(name ?? '')) throw new Error('brug: function-acl <navn>')
    const rows = (await stagingSql(`SELECT p.oid::regprocedure::text sig, p.proacl::text acl,
      has_function_privilege('service_role', p.oid, 'EXECUTE') service_role, has_function_privilege('authenticated', p.oid, 'EXECUTE') authenticated
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${name}'`)) as Array<Record<string, unknown>>
    for (const r of rows) log(JSON.stringify(r))
    return
  }
  if (SUB === 'function-def') {
    // Read-only: aktuel funktionsdefinition på staging → fil (grundlag for CREATE OR REPLACE-migrationer)
    const name = process.argv[3]
    const out = process.argv[4]
    if (!/^[a-z_]+$/.test(name ?? '') || !out) throw new Error('brug: function-def <navn> <fil>')
    const rows = (await stagingSql(`SELECT pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = '${name}'`)) as Array<{ def: string }>
    writeFileSync(out, rows.map((r) => r.def + ';\n').join('\n'))
    log(`${rows.length} definition(er) → ${out}`)
    return
  }
  if (SUB === 'select-policies') {
    // Read-only: SELECT-politikker (navn, roller, USING) for de angivne tabeller på staging — grundlag for lockdowns.
    const tables = process.argv.slice(3)
    const rows = (await stagingSql(`SELECT tablename, policyname, cmd, roles::text, coalesce(qual, '-') qual FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY(ARRAY[${tables.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[])
        AND cmd IN ('SELECT', 'ALL') ORDER BY 1, 2`)) as Array<{ tablename: string; policyname: string; cmd: string; roles: string; qual: string }>
    for (const r of rows) log(`${r.tablename.padEnd(30)} ${r.cmd.padEnd(6)} ${r.roles.padEnd(18)} ${r.policyname}  [${r.qual.slice(0, 90)}]`)
    return
  }
  if (SUB === 'user-delete-cascade-check') {
    // 00199 (STAGING): sletning af en bruger må aldrig slette kunder/data. Opretter en rigtig auth-bruger, en kunde den
    // har oprettet + kontakt + opgave, sletter brugeren via admin-API og kontrollerer at alt består (created_by = NULL).
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const cascades = (await stagingSql(`SELECT c.conrelid::regclass::text tbl, a.attname col FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass) AND c.confdeltype = 'c'
        AND c.conrelid::regclass::text NOT LIKE 'auth.%'`)) as Array<{ tbl: string; col: string }>
    // brugerens EGNE personlige data må gå med brugeren (Telegram-kobling, personlige påmindelser) — ikke forretningsdata
    const PERSONAL = ['profiles', 'assistant_links', 'personal_reminders']
    check('kun profil + brugerens personlige data kaskade-slettes fra profiles/auth.users', cascades.every((r) => PERSONAL.includes(r.tbl)), cascades.map((r) => `${r.tbl}.${r.col}`).join(', '))
    const { data: created, error: uErr } = await admin.auth.admin.createUser({ email: `ucd-${stamp}@harness.test`, password: `H-${stamp}-x!Aa`, email_confirm: true })
    if (uErr || !created?.user) throw new Error(uErr?.message ?? 'createUser')
    const uid = created.user.id
    let custId: string | null = null
    try {
      const { data: cu, error: cErr } = await admin.from('customers').insert({ customer_number: `UCD-${stamp}`, company_name: `[HARNESS] ucd ${stamp}`, contact_person: 'X', email: `ucdk-${stamp}@harness.test`, created_by: uid }).select('id').single()
      if (cErr) throw new Error(cErr.message)
      custId = (cu as { id: string }).id
      const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
      const ic = await admin.from('customer_contacts').insert({ customer_id: custId, name: 'Kontakt', email: `ucdc-${stamp}@harness.test` })
      const it = await admin.from('customer_tasks').insert({ customer_id: custId, title: '[HARNESS] ucd opgave', status: 'pending', priority: 'normal', created_by: owner })
      if (ic.error || it.error) throw new Error(`seed: ${ic.error?.message ?? it.error?.message}`)
      const { error: dErr } = await admin.auth.admin.deleteUser(uid)
      check('brugeren kan slettes', !dErr, dErr?.message ?? '')
      const c = (await admin.from('customers').select('id, created_by').eq('id', custId).maybeSingle()).data as { id: string; created_by: string | null } | null
      check('kunden består efter brugersletning', !!c)
      check('created_by sat til NULL', c?.created_by === null, JSON.stringify(c))
      const nC = (await admin.from('customer_contacts').select('id', { count: 'exact', head: true }).eq('customer_id', custId)).count
      const nT = (await admin.from('customer_tasks').select('id', { count: 'exact', head: true }).eq('customer_id', custId)).count
      check('kontakt og opgave består', nC === 1 && nT === 1, `kontakter=${nC} opgaver=${nT}`)
    } finally {
      if (custId) {
        await admin.from('customer_tasks').delete().eq('customer_id', custId)
        await admin.from('customer_contacts').delete().eq('customer_id', custId)
        await admin.from('customers').delete().eq('id', custId)
      }
      await admin.auth.admin.deleteUser(uid).catch(() => undefined)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ brugersletning bevarer kunder')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'invoice-send-claim-check') {
    // Mail-review 2026-10-07: sendInvoiceEmail kræver fakturaen (sent_at betinget) før afsendelse og frigiver kravet,
    // når den ikke ender i 'sent'. Faktura UDEN kunde → 'skipped' FØR enhver mail (ingen afsendelse i testen).
    const { sendInvoiceEmail } = await import('../../src/lib/services/invoices')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const { data: inv, error } = await admin.from('invoices').insert({ invoice_number: `H-CLAIM-${stamp}`, status: 'draft' }).select('id').single()
    if (error) throw new Error(error.message)
    const id = (inv as { id: string }).id
    try {
      const [a, b] = await Promise.all([sendInvoiceEmail(id), sendInvoiceEmail(id)])
      const statuses = [a.status, b.status].sort().join(',')
      check('to samtidige kald: højst ét kommer forbi kravet', statuses === 'already_sent,skipped' || statuses === 'skipped,skipped', statuses)
      const after = (await admin.from('invoices').select('sent_at, status').eq('id', id).single()).data as { sent_at: string | null; status: string }
      check('kravet frigives efter skipped (sent_at null, stadig kladde)', after.sent_at === null && after.status === 'draft', JSON.stringify(after))
      await admin.from('invoices').update({ sent_at: new Date().toISOString() }).eq('id', id)
      const c = await sendInvoiceEmail(id)
      check('allerede krævet/sendt → already_sent', c.status === 'already_sent', c.status)
    } finally {
      await admin.from('invoices').delete().eq('id', id)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ send-krav ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'find-or-create-customer-check') {
    // Kunde-/leads-review 2026-10-07: mail-automatikkens kundeopslag — telefon i andet format og afsender-e-mail skal
    // finde den eksisterende kunde (ingen dublet). Opretter ALDRIG (data uden adresse/gyldig telefon i negativ-casen).
    const { findOrCreateCustomer } = await import('../../src/lib/services/email-intelligence')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const digits = String(stamp).slice(-8)
    const spaced = digits.replace(/(\d{2})(?=\d)/g, '$1 ')
    const email = `foc-${stamp}@harness.test`
    const { data: cu } = await admin.from('customers').insert({ customer_number: `FOC-${stamp}`, company_name: `[HARNESS] foc ${stamp}`, contact_person: 'Foc Test', email, phone: spaced, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    try {
      for (const variant of [`+45${digits}`, `+45 ${spaced}`, digits]) {
        const r = await findOrCreateCustomer({ name: null, phone: variant, address: null })
        check(`telefon "${variant}" finder kunden (gemt som "${spaced}")`, r.customerId === custId && !r.created)
      }
      const r2 = await findOrCreateCustomer({ name: null, phone: null, address: null, fallbackEmail: email.toUpperCase() })
      check('afsender-e-mail (anden casing) finder kunden', r2.customerId === custId && !r2.created)
      const r3 = await findOrCreateCustomer({ name: null, phone: '12', address: null, fallbackEmail: `ukendt-${stamp}@harness.test` })
      check('ukendt e-mail + ugyldig telefon → intet match, ingen oprettelse', r3.customerId === null && !r3.created)
      // navne-match: entydigt navn + postnr.
      const nm = `Navnetest ${stamp}`
      await admin.from('customers').update({ contact_person: nm, billing_postal_code: '8000' }).eq('id', custId)
      const n1 = await findOrCreateCustomer({ name: nm, phone: null, address: null })
      check('entydigt navn uden adresse → match', n1.customerId === custId)
      const n2 = await findOrCreateCustomer({ name: nm, phone: null, address: 'Vej 1, 8000 Aarhus C' })
      check('entydigt navn + samme postnr. → match', n2.customerId === custId)
      const n3 = await findOrCreateCustomer({ name: nm, phone: null, address: null })
      const { data: twin } = await admin.from('customers').insert({ customer_number: `FOC2-${stamp}`, company_name: `[HARNESS] foc2 ${stamp}`, contact_person: nm, email: `foc2-${stamp}@harness.test`, created_by: owner }).select('id').single()
      const n4 = await findOrCreateCustomer({ name: nm, phone: null, address: null })
      await admin.from('customers').delete().eq('id', (twin as { id: string }).id)
      check('to kunder med samme navn → intet navne-match (tvetydigt)', n3.customerId === custId && n4.customerId === null && !n4.created)
      const n5 = await findOrCreateCustomer({ name: nm, phone: null, address: 'Vej 1, 5000 Odense C' })
      check('entydigt navn men andet postnr. → intet navne-match', n5.customerId !== custId)
      if (n5.created && n5.customerId) await admin.from('customers').delete().eq('id', n5.customerId)
    } finally {
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ kundeopslag ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'affected-offers-query-check') {
    // getAffectedOffers' to forespørgsler (aktive tilbudslinjer m. leverandørprodukt → deres prishistorik) mod rigtig
    // PostgREST: ingen fejl, og linjerne er kun aktive tilbud. Read-only.
    const { fetchAllRows } = await import('../../src/lib/supabase/fetch-all')
    const lines = await fetchAllRows<{ id: string; supplier_product_id: string; offers: { status: string } | Array<{ status: string }> }>((f, t) => admin
      .from('offer_line_items').select('id, supplier_product_id, offers!inner(id, status)')
      .in('offers.status', ['draft', 'sent', 'viewed']).not('supplier_product_id', 'is', null).order('id').range(f, t))
    const badStatus = lines.filter((l) => { const o = Array.isArray(l.offers) ? l.offers[0] : l.offers; return !['draft', 'sent', 'viewed'].includes(o?.status ?? '') }).length
    const ids = [...new Set(lines.map((l) => l.supplier_product_id))]
    let changes = 0
    for (let k = 0; k < ids.length; k += 200) {
      changes += (await fetchAllRows((f, t) => admin.from('price_history').select('id, supplier_product_id').in('supplier_product_id', ids.slice(k, k + 200))
        .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()).order('id').range(f, t))).length
    }
    log(`${badStatus ? 'FAIL' : 'PASS'}  ${lines.length} aktive linjer m. leverandørprodukt (${ids.length} produkter), ${badStatus} med forkert status; prisændringer 30 d: ${changes}`)
    process.exitCode = badStatus ? 1 : 0
    return
  }
  if (SUB === 'cache-count-check') {
    // Leverandør-cache-tal via join (supplier-health/-fallback) = SQL-optælling pr. leverandør. Read-only.
    const sql = (await stagingSql(`SELECT p.supplier_id, c.is_stale, count(*)::int n FROM supplier_product_cache c
      JOIN supplier_products p ON p.id = c.supplier_product_id GROUP BY 1, 2`)) as Array<{ supplier_id: string; is_stale: boolean; n: number }>
    const { data: sups } = await admin.from('suppliers').select('id')
    let fails = 0
    for (const s of (sups ?? []) as Array<{ id: string }>) {
      for (const stale of [false, true]) {
        const { count, error } = await admin.from('supplier_product_cache')
          .select('id, supplier_products!inner(supplier_id)', { count: 'exact', head: true })
          .eq('supplier_products.supplier_id', s.id).eq('is_stale', stale)
        const want = sql.find((r) => r.supplier_id === s.id && r.is_stale === stale)?.n ?? 0
        if (error || (count ?? 0) !== want) { fails++; log(`FAIL  leverandør ${s.id.slice(0, 8)} stale=${stale}: join=${count} sql=${want} ${error?.message ?? ''}`) }
      }
    }
    log(`${fails ? 'FAIL' : 'PASS'}  ${(sups ?? []).length} leverandører × (frisk, forældet); cache-rækker i alt ${sql.reduce((a, r) => a + r.n, 0)}`)
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'lead-phone-dupe-probe') {
    // Leads-review #10: telefonmønstret i checkDuplicateLead (cifre i rækkefølge, vilkårlige skilletegn) via PostgREST .or()
    const { pgQuote } = await import('../../src/lib/validations/postgrest-filter')
    const stamp = Date.now()
    const digits = `9${String(stamp).slice(-7)}`
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: l } = await admin.from('leads').insert({ company_name: '[HARNESS] dupe', contact_person: 'x', email: `dp-${stamp}@harness.test`, phone: `+45 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`, status: 'new', source: 'other', created_by: owner }).select('id').single()
    try {
      const { data, error } = await admin.from('leads').select('id').or(`company_name.ilike.${pgQuote('ingen-match-xyz')},phone.ilike.${pgQuote(`%${digits.split('').join('%')}%`)}`).limit(5)
      const ok = !error && (data ?? []).some((r: { id: string }) => r.id === (l as { id: string }).id)
      log(`  ${ok ? '✓' : '❌'} "${digits}" finder lead gemt som "+45 xx xx xx xx"${error ? ` — ${error.message}` : ''}`)
      process.exitCode = ok ? 0 : 1
    } finally {
      await admin.from('leads').delete().eq('id', (l as { id: string }).id)
    }
    return
  }
  if (SUB === 'in-list-limit') {
    // Hvor mange UUID'er tåler én .in() (GET-URL) før gatewayen afviser? Read-only mod customers med tilfældige id'er.
    const { randomUUID } = await import('crypto')
    for (const n of [100, 200, 300, 400, 500, 700, 1000]) {
      const ids = Array.from({ length: n }, () => randomUUID())
      const { error } = await admin.from('customers').select('id').in('id', ids)
      log(`${error ? 'FEJL' : 'OK  '}  ${String(n).padStart(4)} id'er (~${Math.round((n * 37) / 1024)} KB)${error ? ` → ${String(error.message ?? error.code ?? '').slice(0, 80)}` : ''}`)
    }
    return
  }
  if (SUB === 'coverage-check') {
    // Fakturakontrol-dækning: loaderen (side for side) skal se ALLE linjer/fakturaer — sammenlignes med SQL-optælling.
    const { loadAndMeasureCoverage } = await import('../../src/lib/invoice-control/coverage')
    const cov = await loadAndMeasureCoverage(admin)
    const [cnt] = (await stagingSql(`SELECT (SELECT count(*) FROM incoming_invoices WHERE status <> 'cancelled')::int invs,
      (SELECT count(*) FROM incoming_invoice_lines l JOIN incoming_invoices i ON i.id = l.incoming_invoice_id WHERE i.status <> 'cancelled')::int lines`)) as Array<{ invs: number; lines: number }>
    const okInv = cov.invoices === cnt.invs, okLines = cov.lines === cnt.lines
    log(`${okInv ? 'PASS' : 'FAIL'}  fakturaer: loader=${cov.invoices} sql=${cnt.invs}`)
    log(`${okLines ? 'PASS' : 'FAIL'}  linjer: loader=${cov.lines} sql=${cnt.lines}`)
    log(`dækning ${cov.coveragePct} % · afvigende linjer ${cov.deviatingLines}`)
    process.exitCode = okInv && okLines ? 0 : 1
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
  if (SUB === 'offer-recompute') {
    // Salgs-review T3 (staging): recomputeOfferTotals skal give PRÆCIS DB-triggerens totaler (update_offer_totals).
    // Før: rabatten blev trukket fra to gange og total_amount gemt som netto.
    const mod = await import(process.env.OUT_MOD || '../../src/lib/services/offer-pricing')
    const actors = await ensureActors(admin, seedBase)
    const cust = (await stagingSql(`SELECT id FROM customers WHERE custom_fields->>'harness' IS NOT NULL LIMIT 1`))[0]
    const { data, error } = await admin.from('offers').insert([{ offer_number: `UI-E2E-RC-${Date.now()}`, title: '[HARNESS] recompute',
      created_by: actors.ownerUid, customer_id: cust.id, status: 'draft', discount_percentage: 10, tax_percentage: 25 }]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (!id) throw new Error(`seed: ${error?.message}`)
    try {
      await admin.from('offer_line_items').insert([
        { offer_id: id, position: 1, description: 'A', quantity: 3, unit: 'stk', unit_price: 333.33 },
        { offer_id: id, position: 2, description: 'B', quantity: 1, unit: 'stk', unit_price: 1000.01 },
      ])
      const read = async () => (await stagingSql(`SELECT total_amount::float t, discount_amount::float d, tax_amount::float x, final_amount::float f FROM offers WHERE id = '${id}'`))[0]
      const byTrigger = await read()
      await mod.recomputeOfferTotals(id)
      const byRecompute = await read()
      const same = JSON.stringify(byTrigger) === JSON.stringify(byRecompute)
      log(`${same ? 'PASS' : 'FAIL'}  recompute = trigger  trigger=${JSON.stringify(byTrigger)} recompute=${JSON.stringify(byRecompute)}`)
      process.exitCode = same ? 0 : 2
    } finally {
      await admin.from('offer_line_items').delete().eq('offer_id', id)
      await admin.from('offers').delete().eq('id', id)
    }
    return
  }
  if (SUB === 'offer-invoice-discount') {
    // Faktura-review (HØJ): faktura fra tilbud ignorerede rabat → rabat-tilbud afvises (negativ) ; uden rabat oprettes
    // fakturaen stadig (positiv kontrol). Staging; alt seedet ryddes. Ingen mail (kun createInvoiceFromOffer, ikke "send").
    const { createInvoiceFromOffer } = await import('../../src/lib/services/invoices')
    const actors = await ensureActors(admin, seedBase)
    const cust = (await stagingSql(`SELECT id FROM customers WHERE custom_fields->>'harness' IS NOT NULL LIMIT 1`))[0]
    const stamp = Date.now()
    const offerIds: string[] = []
    const mk = async (tag: string, offerDisc: number, lineDisc: number, salePrice: number = 1000) => {
      const { data, error } = await admin.from('offers').insert([{ offer_number: `UI-E2E-DISC-${tag}-${stamp}`, title: `[HARNESS] rabat ${tag}`,
        created_by: actors.ownerUid, customer_id: cust.id, status: 'accepted', accepted_at: new Date().toISOString(), discount_percentage: offerDisc }]).select('id')
      const id = (data?.[0] as { id?: string } | undefined)?.id
      if (!id) throw new Error(`seed: ${error?.message}`)
      offerIds.push(id)
      await admin.from('offer_line_items').insert([{ offer_id: id, position: 1, description: 'Linje', quantity: 1, unit: 'stk', unit_price: 1000, sale_price: salePrice, discount_percentage: lineDisc, total: 1000 * (1 - lineDisc / 100) }])
      return id
    }
    const res: Array<[string, boolean]> = []
    try {
      for (const [tag, od, ld] of [['tilbudsrabat', 10, 0], ['linjerabat', 0, 15]] as Array<[string, number, number]>) {
        const id = await mk(tag, od, ld)
        const err = await createInvoiceFromOffer(id).then(() => '', (e: Error) => e.message)
        const n = (await stagingSql(`SELECT count(*)::int n FROM invoices WHERE offer_id = '${id}'`))[0].n
        res.push([`${tag}_afvist`, /rabat/.test(err) && n === 0])
      }
      // S1 (2026-10-07): linje med sale_price 0 (manuelt oprettet før rettelsen) → ville faktureres til 0 kr → afvises
      const zero = await mk('salgspris0', 0, 0, 0)
      const zErr = await createInvoiceFromOffer(zero).then(() => '', (e: Error) => e.message)
      const zN = (await stagingSql(`SELECT count(*)::int n FROM invoices WHERE offer_id = '${zero}'`))[0].n
      res.push(['salgspris_0_afvist', /fakturaprisen/.test(zErr) && zN === 0])
      const plain = await mk('uden', 0, 0)
      const invId = await createInvoiceFromOffer(plain).catch(() => '')
      res.push(['uden_rabat_oprettes', !!invId])
    } finally {
      for (const id of offerIds) {
        const inv = await stagingSql(`SELECT id FROM invoices WHERE offer_id = '${id}'`)
        for (const i of inv) { await admin.from('invoice_lines').delete().eq('invoice_id', i.id); await admin.from('invoices').delete().eq('id', i.id) }
        await admin.from('offer_line_items').delete().eq('offer_id', id)
        await admin.from('offers').delete().eq('id', id)
      }
    }
    for (const [k, v] of res) log(`${v ? 'PASS' : 'FAIL'}  ${k}`)
    process.exitCode = res.every(([, v]) => v) ? 0 : 2
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
  if (SUB === 'cost-columns-check') {
    // STAGING: 00192 verificeret med RIGTIGE rolle-sessioner (persona-login via Auth). Forventet efter migrationen:
    //  - ingen persona kan læse kost-/løn-kolonnerne direkte (42501), ikke-kost-kolonner virker uændret
    //  - work_order_profit: kun admin/serviceleder/bogholderi ser rækker
    //  - calculate_work_order_profit kan ikke kaldes af brugere
    //  - en bruger kan ikke selv PATCH'e profiles.email / avatar_storage_path (men full_name virker)
    const { loginPersonas } = await import('./role-matrix')
    const personas = await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })
    const res: Array<[string, boolean, string]> = []
    const COST: Array<[string, string, string]> = [
      ['offer_line_items', 'cost_price, supplier_cost_price_at_creation, supplier_margin_applied, margin_percentage', 'id, description, unit_price, total'],
      ['supplier_products', 'cost_price, margin_percentage', 'id, supplier_sku, list_price'],
      ['time_logs', 'cost_amount, cost_rate_snapshot', 'id, hours, sale_amount'],
    ]
    for (const [role, cl] of personas) {
      for (const [t, costCols, publicCols] of COST) {
        for (const col of costCols.split(', ')) {
          const { error } = await cl.from(t).select(col).limit(1)
          res.push([`${role} ${t}.${col} nægtet`, !!error && /permission denied/i.test(error.message), error ? error.code ?? '' : 'LÆSBAR'])
        }
        const ok = await cl.from(t).select(publicCols).limit(1)
        res.push([`${role} ${t} ikke-kost læsbar`, !ok.error, ok.error?.message ?? ''])
      }
      const rpc = await cl.rpc('calculate_work_order_profit', { p_work_order_id: '00000000-0000-0000-0000-000000000000' })
      res.push([`${role} calculate_work_order_profit nægtet`, !!rpc.error && /permission denied/i.test(rpc.error.message), rpc.error?.code ?? 'KALDBAR'])
    }
    // work_order_profit: seed én række (staging er tom), tjek synlighed pr. rolle, ryd op
    const wo = (await stagingSql(`SELECT id FROM work_orders LIMIT 1`))[0]
    let profitId: string | null = null
    if (wo) {
      const ins = await admin.from('work_order_profit').insert({ work_order_id: wo.id, revenue: 1000, labor_cost: 400, material_cost: 100, total_cost: 500, profit: 500, margin_percentage: 50, source: 'manual' }).select('id').single()
      profitId = (ins.data as { id?: string } | null)?.id ?? null
      if (!profitId) res.push(['seed work_order_profit', false, ins.error?.message ?? ''])
    }
    if (profitId) {
      for (const [role, cl] of personas) {
        const { data } = await cl.from('work_order_profit').select('id').eq('id', profitId)
        const sees = (data ?? []).length > 0
        const shouldSee = ['admin', 'serviceleder', 'bogholderi'].includes(role)
        res.push([`${role} work_order_profit ${shouldSee ? 'synlig' : 'skjult'}`, sees === shouldSee, sees ? 'ser' : 'ser ikke'])
      }
      await admin.from('work_order_profit').delete().eq('id', profitId)
    }
    // P2: egen profil — e-mail/avatar-sti må ikke kunne sættes direkte; navn må
    for (const [role, cl] of personas) {
      const { data: me } = await cl.auth.getUser()
      const uid = me.user?.id
      if (!uid) continue
      const before = (await stagingSql(`SELECT email, avatar_storage_path, full_name FROM profiles WHERE id = '${uid}'`))[0]
      const e1 = await cl.from('profiles').update({ email: `x-${Date.now()}@harness.test` }).eq('id', uid)
      const e2 = await cl.from('profiles').update({ avatar_storage_path: 'customer-documents/x/y.pdf' }).eq('id', uid)
      const n1 = await cl.from('profiles').update({ full_name: before?.full_name ?? 'Harness' }).eq('id', uid)
      const after = (await stagingSql(`SELECT email, avatar_storage_path FROM profiles WHERE id = '${uid}'`))[0]
      res.push([`${role} kan ikke sætte egen profil-e-mail/avatar-sti`, after?.email === before?.email && after?.avatar_storage_path === before?.avatar_storage_path, `${e1.error?.code ?? 'ok'}/${e2.error?.code ?? 'ok'}`])
      res.push([`${role} kan opdatere eget navn`, !n1.error, n1.error?.message ?? ''])
      if (after?.email !== before?.email || after?.avatar_storage_path !== before?.avatar_storage_path) {
        await admin.from('profiles').update({ email: before?.email ?? null, avatar_storage_path: before?.avatar_storage_path ?? null }).eq('id', uid)
      }
    }
    for (const [k, v, note] of res) log(`${v ? 'PASS' : 'FAIL'}  ${k}${note ? `  (${note})` : ''}`)
    const bad = res.filter(([, v]) => !v).length
    log(bad ? `❌ ${bad} af ${res.length} ikke som forventet` : `✅ alle ${res.length} som forventet`)
    process.exitCode = bad ? 2 : 0
    return
  }
  if (SUB === 'table-policies') {
    // Staging (read-only): SELECT-policies + rettigheder for én tabel
    const t = String(process.argv[3] || '')
    if (!/^[a-z_0-9]+$/.test(t)) { log('brug: table-policies <tabel>'); process.exit(2) }
    const pols = await stagingSql(`SELECT policyname, cmd, roles::text, left(qual, 160) q FROM pg_policies WHERE schemaname = 'public' AND tablename = '${t}' ORDER BY cmd`)
    for (const p of pols) log(`${p.cmd.padEnd(7)} ${p.policyname}  roles=${p.roles}  USING ${p.q}`)
    const [g] = await stagingSql(`SELECT has_table_privilege('authenticated', 'public.${t}', 'SELECT') auth_select, has_table_privilege('anon', 'public.${t}', 'SELECT') anon_select`)
    log(JSON.stringify(g))
    return
  }
  if (SUB === 'system-alerts-check') {
    // STAGING: 00194 system_alerts med RIGTIGE rolle-sessioner + app-stierne (portal-hændelse → klokke, læst/afvis,
    // natlig intelligence-check to gange → dubletsikring). Rydder egne rækker op.
    const { loginPersonas } = await import('./role-matrix')
    const personas = await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const SEE = ['admin', 'serviceleder', 'bogholderi']
    const ids: string[] = []
    try {
      // 1. Kunde-hændelse → advarsel (samme funktion som fuldmagt/besigtigelse i portalen kalder)
      const { createSystemAlertAdmin } = await import('../../src/lib/actions/system-alerts-admin')
      const ok = await createSystemAlertAdmin({ alert_type: 'fuldmagt_signed' as never, severity: 'info', title: `Fuldmagt underskrevet ${stamp}`, message: 'Harness Kunde har underskrevet fuldmagten for ordre H-1.', entity_type: 'customer' })
      const { data: ev } = await admin.from('system_alerts').select('id, is_read, is_dismissed').eq('title', `Fuldmagt underskrevet ${stamp}`)
      check('portal-hændelse opretter advarsel (createSystemAlertAdmin)', ok && (ev ?? []).length === 1, JSON.stringify(ev))
      const alertId = (ev ?? [])[0]?.id as string
      if (alertId) ids.push(alertId)

      // 2. Rollematrix
      for (const [role, cl] of personas) {
        const { data, error } = await cl.from('system_alerts').select('id').eq('id', alertId)
        const sees = (data ?? []).length > 0
        check(`${role} ${SEE.includes(role) ? 'ser' : 'ser IKKE'} advarslen`, !error && sees === SEE.includes(role), error?.message ?? (sees ? 'ser' : 'ser ikke'))
        const ins = await cl.from('system_alerts').insert({ alert_type: 'x', title: 'x', message: 'x' })
        check(`${role} kan ikke oprette`, !!ins.error, ins.error?.code ?? 'OPRETTET')
        const upT = await cl.from('system_alerts').update({ title: 'ændret' }).eq('id', alertId).select('id')
        check(`${role} kan ikke ændre titel`, !!upT.error || (upT.data ?? []).length === 0, upT.error?.code ?? `${(upT.data ?? []).length} rækker`)
        const del = await cl.from('system_alerts').delete().eq('id', alertId).select('id')
        check(`${role} kan ikke slette`, !!del.error || (del.data ?? []).length === 0, del.error?.code ?? `${(del.data ?? []).length} rækker`)
        if (!SEE.includes(role)) {
          const upR = await cl.from('system_alerts').update({ is_read: true }).eq('id', alertId).select('id')
          check(`${role} kan ikke markere læst`, !!upR.error || (upR.data ?? []).length === 0, upR.error?.code ?? `${(upR.data ?? []).length} rækker`)
        }
      }
      const still = (await admin.from('system_alerts').select('title, is_read').eq('id', alertId).single()).data as { title: string; is_read: boolean } | null
      check('  advarslen uændret efter forsøgene', still?.title === `Fuldmagt underskrevet ${stamp}` && still?.is_read === false, JSON.stringify(still))

      // 3. Læst/afvis som bogholderi (den rolle der før kunne se men ikke markere)
      const bog = Array.from(personas).find(([r]) => r === 'bogholderi')?.[1]
      if (bog) {
        const r1 = await bog.from('system_alerts').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', alertId).select('id')
        check('bogholderi markerer læst', !r1.error && (r1.data ?? []).length === 1, r1.error?.message ?? '')
        const r2 = await bog.from('system_alerts').update({ is_dismissed: true, dismissed_at: new Date().toISOString() }).eq('id', alertId).select('id')
        check('bogholderi afviser', !r2.error && (r2.data ?? []).length === 1, r2.error?.message ?? '')
        const open = await bog.from('system_alerts').select('id').eq('is_dismissed', false).eq('id', alertId)
        check('  afvist advarsel forsvinder fra klokkens liste', (open.data ?? []).length === 0)
      } else check('bogholderi-persona findes', false)

      // 4. Natlig intelligence-check to gange: hvad oprettes, og dubletsikring
      process.env.CRON_SECRET = process.env.CRON_SECRET || `harness-${stamp}`
      const { GET } = await import('../../src/app/api/cron/intelligence-check/route')
      const since = new Date().toISOString()
      const runOnce = async () => {
        const res = await GET(new Request('http://localhost/api/cron/intelligence-check', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }) as never)
        return (await (res as Response).json()) as Record<string, unknown>
      }
      const run1 = await runOnce()
      const { data: created1 } = await admin.from('system_alerts').select('id, alert_type, severity, title').gte('created_at', since).neq('alert_type', 'fuldmagt_signed')
      const run2 = await runOnce()
      const { data: created2 } = await admin.from('system_alerts').select('id').gte('created_at', since).neq('alert_type', 'fuldmagt_signed')
      const byType: Record<string, number> = {}
      for (const a of created1 ?? []) byType[`${a.alert_type}/${a.severity}`] = (byType[`${a.alert_type}/${a.severity}`] ?? 0) + 1
      log(`  kørsel 1: ${JSON.stringify(run1.results ?? run1)}`)
      log(`  oprettet ved kørsel 1 pr. type: ${JSON.stringify(byType)}`)
      for (const a of (created1 ?? []).slice(0, 6)) log(`    · ${a.alert_type} ${a.severity}: ${String(a.title).slice(0, 70)}`)
      log(`  kørsel 2: ${JSON.stringify(run2.results ?? run2)}`)
      check('2. kørsel opretter ingen dubletter', (created2 ?? []).length === (created1 ?? []).length, `${(created1 ?? []).length} → ${(created2 ?? []).length}`)
      for (const a of created2 ?? []) ids.push(a.id as string)
    } finally {
      if (ids.length) await admin.from('system_alerts').delete().in('id', ids)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ system_alerts-tjek bestået')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'elta-components-compare') {
    // S2 (staging, read-only): AI-projektmotoren FØR (indbyggede standardværdier) og EFTER (ELTAs calc_components)
    // for faste eksempelprojekter. Ingen skrivning; flaget sættes kun i denne proces.
    const { matchComponents, toCalculationComponents, toCalculationMaterials } = await import('../../src/lib/ai/componentMatcher')
    const { calculateProject } = await import('../../src/lib/ai/calculationEngine')
    const { ELTA_COMPONENT_MAP, ELTA_UNMAPPED } = await import('../../src/lib/ai/elta-components')
    type Interp = import('../../src/types/auto-project.types').ProjectInterpretation
    const base = (id: string, raw: string, points: Interp['electrical_points'], cable: Partial<Interp['cable_requirements']>, panel: Partial<Interp['panel_requirements']> = {}): Interp => ({
      id, raw_description: raw, building_type: 'house' as Interp['building_type'], building_size_m2: 140, building_age_years: 20, rooms: [],
      electrical_points: points,
      cable_requirements: { nym_1_5mm: 0, nym_2_5mm: 0, nym_4mm: 0, nym_6mm: 0, nym_10mm: 0, outdoor_cable: 0, data_cable: 0, ...cable },
      panel_requirements: { upgrade_needed: false, required_groups: 0, required_amperage: 25, new_panel_needed: false, ...panel },
      complexity_score: 3, complexity_factors: [], risk_score: 2, risk_factors: [], ai_model: 'harness', ai_confidence: 1, interpretation_time_ms: 0, created_at: new Date().toISOString(),
    })
    // 10 realistiske opgavetyper (samme interpretation FØR/EFTER; kun komponentkilden skifter)
    // charger: 'valgt' = en konkret ladeboks er valgt i produktkataloget; 'ingen' = ikke valgt (→ "Ikke prissat")
    type Case = { it: Interp; charger?: 'valgt' | 'ingen' }
    const cases: Case[] = [
      { it: base('e1', 'Køkkenrenovering: 6 dobbelte stik, 2 enkelte, 4 spots, 1 dæmper, 1 afbryder, +2 grupper', { double_outlets: 6, outlets: 2, spots: 4, dimmers: 1, switches: 1 }, { nym_1_5mm: 30, nym_2_5mm: 40 }, { upgrade_needed: true, current_groups: 8, required_groups: 10 }) },
      { it: base('e2', 'Stue + kontor: 8 stik, 3 afbrydere, 2 korrespondance, 2 loftudtag, 4 netværk, 1 TV', { outlets: 8, switches: 3, multi_switches: 2, ceiling_lights: 2, data_outlets: 4, tv_outlets: 1 }, { nym_1_5mm: 40, nym_2_5mm: 50, data_cable: 80 }) },
      { it: base('e3', 'Carport: elbillader (ikke valgt), 2 udendørs lamper, 1 kraftstik 16A, +2 grupper, 20 m jordkabel', { ev_charger: 1, outdoor_lights: 2, power_16a: 1 }, { nym_6mm: 25, outdoor_cable: 20 }, { upgrade_needed: true, current_groups: 10, required_groups: 12 }), charger: 'ingen' },
      { it: base('e4', 'Elbillader alene: Zaptec Go 2 valgt, 15 m 6 mm² (egen gruppe)', { ev_charger: 1 }, { nym_6mm: 15 }), charger: 'valgt' },
      { it: base('e5', 'Badeværelse: 10 spots, 1 dæmper, 2 stik, 1 afbryder', { spots: 10, dimmers: 1, outlets: 2, switches: 1 }, { nym_1_5mm: 25, nym_2_5mm: 10 }) },
      { it: base('e6', 'Værksted/garage: 1 kraftstik 32A, 2 kraftstik 16A, 4 dobbelte stik, 2 loftudtag, +3 grupper', { power_32a: 1, power_16a: 2, double_outlets: 4, ceiling_lights: 2 }, { nym_2_5mm: 40, nym_4mm: 20, nym_6mm: 15 }, { upgrade_needed: true, current_groups: 8, required_groups: 11 }) },
      { it: base('e7', 'Nyt hus 140 m² komplet + ny tavle (16 grupper)', { outlets: 30, double_outlets: 10, switches: 15, multi_switches: 4, spots: 12, ceiling_lights: 10, data_outlets: 4, tv_outlets: 2 }, { nym_1_5mm: 250, nym_2_5mm: 300, data_cable: 120 }, { new_panel_needed: true, required_groups: 16 }) },
      { it: base('e8', 'Tavleudskiftning: ny tavle (12 grupper)', {}, {}, { new_panel_needed: true, required_groups: 12 }) },
      { it: base('e9', 'Udendørs belysning: 6 udendørs lamper, 1 afbryder', { outdoor_lights: 6, switches: 1 }, { outdoor_cable: 40 }) },
      { it: base('e10', 'Hjemmekontor: 4 dobbelte stik, 2 netværk, 1 loftudtag, 1 afbryder, +1 gruppe', { double_outlets: 4, data_outlets: 2, ceiling_lights: 1, switches: 1 }, { nym_1_5mm: 10, nym_2_5mm: 20, data_cable: 30 }, { upgrade_needed: true, current_groups: 9, required_groups: 10 }) },
    ]
    const { PROPOSED_PANEL_SIZE_RULES, PANEL_SIZE_RULES } = await import('../../src/lib/ai/panel-size')
    let chargerId: string | null = null
    const runCase = async (it: Interp, opts: { chargerProductId?: string | null; panelRules?: import('../../src/lib/ai/panel-size').PanelSizeRule[] } = {}) => {
      const m = await matchComponents(it, opts)
      const comps = toCalculationComponents(m.components)
      const calc = calculateProject(it.id, comps, toCalculationMaterials(m.materials), it, {})
      return { m, comps, calc: calc as unknown as { time: { total_hours: number }; price: { material_cost: number; total_price: number } } }
    }
    const fmt = (n: number) => Math.round(n).toLocaleString('da-DK')
    const gapsShort = (g: string[]) => g.map((x) => x.replace(/^Ikke prissat: /, '').split(' — ')[0].split(' (')[0].split('. ')[0]).join('; ') || '—'
    log(`koblinger: ${Object.entries(ELTA_COMPONENT_MAP).map(([k, v]) => `${k}→${v.firstCode ? v.firstCode + '/' : ''}${v.code}`).join(', ')}`)
    log(`bevidst ikke koblet (standard): ${ELTA_UNMAPPED.join(', ')}`)
    log(`godkendte tavleregler: ${PANEL_SIZE_RULES.length ? JSON.stringify(PANEL_SIZE_RULES) : 'INGEN (ny tavle = Ikke prissat)'} · forslag: ${JSON.stringify(PROPOSED_PANEL_SIZE_RULES)}`)
    const { loadEltaComponents } = await import('../../src/lib/ai/elta-components')
    // Staging har ingen calc_components → seed ELTA-komponenter med prod-katalogværdierne (læst read-only 2026-10-07 via
    // scripts/prod-calc-components.ts / prod-calc-component-detail.ts; ingen personværdier) og fjern dem igen bagefter
    const PROD_CATALOG: Array<[string, string, number, number, number]> = [
      ['STIK-1-NY', 'Stikkontakt enkelt - ny', 495, 35, 185], ['STIK-2-NY', 'Stikkontakt dobbelt - ny', 595, 45, 225],
      ['AFB-1P-NY', 'Afbryder 1-pol - ny', 445, 30, 155], ['AFB-KORR-NY', 'Korrespondanceafbryder - ny', 545, 40, 195],
      ['DIM-NY', 'Lysdæmper - ny', 645, 35, 265], ['SPOT-IND-1', 'Indbygningsspot - første', 595, 30, 245],
      ['SPOT-IND-X', 'Indbygningsspot - ekstra', 445, 18, 185], ['LOFT-NY', 'Loftudtag - ny', 495, 35, 175],
      ['NET-CAT6-NY', 'Netværksudtag Cat6', 595, 40, 245], ['STIK-ANTENNE', 'Antenne-udtag', 175, 15, 45],
      ['TAVLE-GRP', 'Ekstra gruppe i tavle', 395, 25, 145], ['MONT-LADESTAND', 'Montering ladestander', 2495, 90, 0],
      ['TAVLE-LILLE', 'Undertavle 6-12 moduler', 3495, 150, 1450], ['TAVLE-S', 'Tavle (lille)', 2500, 120, 800],
      ['TAVLE-NY', 'Ny gruppetavle 12 modul', 2800, 120, 1200], ['TAVLE-L', 'Tavle (stor)', 6500, 240, 2500],
    ]
    const existingCodes = new Set(((await admin.from('calc_components').select('code').in('code', PROD_CATALOG.map((r) => r[0]))).data ?? []).map((r: { code: string }) => r.code))
    for (const [code, name, sale, min, cost] of PROD_CATALOG) {
      if (existingCodes.has(code)) continue
      const { error } = await admin.from('calc_components').insert({ code, name, default_sale_price: sale, default_cost_price: cost, base_time_minutes: min, is_active: true, notes: '[HARNESS] S2 elta-components-compare' })
      if (error) throw new Error(`seed ${code}: ${error.message}`)
    }
    // Ladeboks: Zaptec Go 2 med prod-katalogets værdier (Lemvigh-Müller 7811301069, kost 4.795 kr) som harness-produkt
    const { data: anySupplier } = await admin.from('suppliers').select('id').limit(1).single()
    const { data: ch, error: chErr } = await admin.from('supplier_products').insert({ supplier_id: (anySupplier as { id: string }).id, supplier_sku: `HARNESS-7811301069-${Date.now()}`, supplier_name: 'Zaptec Go 2 - Asphalt Black', manufacturer: 'Zaptec', cost_price: 4795, list_price: 4795, is_available: true, data_source: 'manual', external_id: 'harness-s2' }).select('id').single()
    if (chErr) {
      await admin.from('calc_components').delete().eq('notes', '[HARNESS] S2 elta-components-compare')
      throw new Error(`seed lader: ${chErr.message}`)
    }
    chargerId = (ch as { id: string }).id
    const cleanup = async () => {
      await admin.from('calc_components').delete().eq('notes', '[HARNESS] S2 elta-components-compare')
      await admin.from('supplier_products').delete().eq('external_id', 'harness-s2')
    }

    const [cc] = await stagingSql(`SELECT count(*)::int total FROM calc_components`)
    log(`staging calc_components: ${cc.total} · indlæste ELTA-koblinger: ${(await loadEltaComponents()).size}`)
    let fails = 0
    try {
      const rows: string[] = []
      const proposalRows: string[] = []
      for (const { it, charger } of cases) {
        const opts = { chargerProductId: charger === 'valgt' ? chargerId : null }
        delete process.env.AI_PROJECT_ELTA_COMPONENTS
        const before = await runCase(it, opts)
        process.env.AI_PROJECT_ELTA_COMPONENTS = 'true'
        const after = await runCase(it, opts)
        const isPanel = it.panel_requirements.new_panel_needed
        const proposed = isPanel ? await runCase(it, { ...opts, panelRules: PROPOSED_PANEL_SIZE_RULES }) : null
        delete process.env.AI_PROJECT_ELTA_COMPONENTS
        const b = before.calc
        const a = after.calc
        const pct = b.price.total_price ? ((a.price.total_price - b.price.total_price) / b.price.total_price) * 100 : 0
        const elta = after.m.components.filter((c) => c.source === 'database').map((c) => `${c.quantity}× ${c.name}`)
        const fallback = after.m.components.filter((c) => c.source !== 'database').map((c) => `${c.quantity}× ${c.name}`)
        const hw = after.m.materials.filter((m) => m.source === 'database' && !m.name.endsWith('(materiel)')).map((m) => `${m.quantity}× ${m.name} (kost ${fmt(m.unit_cost)})`)
        log(`\n■ ${it.raw_description}`)
        log(`  materialer ${fmt(b.price.material_cost)} → ${fmt(a.price.material_cost)} kr · timer ${b.time.total_hours} → ${a.time.total_hours} · salgspris ${fmt(b.price.total_price)} → ${fmt(a.price.total_price)} kr (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`)
        log(`  fra ELTA: ${elta.join(', ') || '—'}${hw.length ? ` · hardware fra katalog: ${hw.join(', ')}` : ''}`)
        log(`  standard (fallback): ${fallback.join(', ') || '—'}`)
        if (after.m.pricingGaps.length) log(`  ikke prissat: ${after.m.pricingGaps.join(' | ')}`)
        rows.push(`| ${it.raw_description} | ${fmt(b.price.material_cost)} → ${fmt(a.price.material_cost)} | ${b.time.total_hours} → ${a.time.total_hours} | ${fmt(b.price.total_price)} → ${fmt(a.price.total_price)} | ${pct >= 0 ? '+' : ''}${pct.toFixed(1)} % | ${[...elta, ...hw].join(', ') || '—'} | ${fallback.join(', ') || '—'} | ${gapsShort(after.m.pricingGaps)} |`)
        if (proposed) {
          const p = proposed.calc
          const board = proposed.m.components.find((c) => c.code === 'panel_new')
          log(`  MED FORESLÅEDE TAVLEREGLER: tavle = ${board?.source === 'database' ? board.name : 'ikke valgt'} · materialer ${fmt(p.price.material_cost)} kr · timer ${p.time.total_hours} · salgspris ${fmt(p.price.total_price)} kr · ikke prissat: ${gapsShort(proposed.m.pricingGaps)}`)
          proposalRows.push(`| ${it.raw_description} | ${it.panel_requirements.required_groups} | ${board?.source === 'database' ? board.name : '—'} | ${fmt(p.price.material_cost)} | ${p.time.total_hours} | ${fmt(p.price.total_price)} | ${gapsShort(proposed.m.pricingGaps)} |`)
        }
        if (before.m.components.some((c) => c.source === 'database')) { fails++; log('  ❌ FØR brugte DB-komponenter (flag fra skal give standard)') }
        if (charger === 'ingen' && !after.m.pricingGaps.some((g) => g.includes('ladestanderen'))) { fails++; log('  ❌ lader uden valgt hardware er ikke markeret "Ikke prissat"') }
        if (charger === 'valgt' && !after.m.materials.some((m) => m.supplier_product_id === chargerId)) { fails++; log('  ❌ valgt lader er ikke med som materiale') }
        if (charger === 'valgt' && before.m.materials.some((m) => m.supplier_product_id === chargerId)) { fails++; log('  ❌ lader-hardware brugt med flaget FRA') }
        if (isPanel && PANEL_SIZE_RULES.length === 0 && !after.m.pricingGaps.some((g) => g.includes('ny eltavle'))) { fails++; log('  ❌ ny tavle uden godkendt regel er ikke markeret "Ikke prissat"') }
      }
      const { writeFileSync } = await import('fs')
      writeFileSync('docs/runbooks/s2-elta-components-examples.md', [
        '# S2 — før/efter: AI-auto-tilbud med ELTAs egne komponenter',
        '',
        `Genereret ${new Date().toISOString().slice(0, 10)} af \`npx tsx scripts/test-harness/cli.ts elta-components-compare\` (staging med prod-katalogets`,
        'værdier; standard-timesats 450 kr/t-niveau og -margin). **Flaget `AI_PROJECT_ELTA_COMPONENTS` er FRA i prod.**',
        'FØR = motorens indbyggede standardværdier (sådan prod regner i dag). EFTER = ELTAs tider/salgspriser for entydigt koblede',
        'komponenter + ELTA-materiel til tavlegrupper (TAVLE-GRP kost 145 kr) + valgt ladeboks fra produktkataloget.',
        'Ladestander = hardware (valgt produkt) + MONT-LADESTAND (montage) + kabel + egen gruppe (TAVLE-GRP); uden valgt lader',
        'og for ny tavle uden godkendt regel viser motoren "Ikke prissat" (ingen gæt).',
        '',
        `Koblinger: ${Object.entries(ELTA_COMPONENT_MAP).map(([k, v]) => `${k} → ${v.firstCode ? v.firstCode + '/' : ''}${v.code}`).join(', ')}.`,
        `Bevidst ikke koblet (standard, intet entydigt ELTA-modstykke): ${ELTA_UNMAPPED.join(', ')}.`,
        `Godkendte tavleregler: ${PANEL_SIZE_RULES.length ? PANEL_SIZE_RULES.map((r) => `≤ ${r.maxGroups} grupper → ${r.code}`).join(', ') : 'ingen endnu (afventer godkendelse)'}.`,
        '',
        '| Opgave | Materialer kr | Timer | Salgspris kr | Forskel | Fra ELTA / katalog | Standard (fallback) | Ikke prissat (advarsel) |',
        '|---|---|---|---|---|---|---|---|',
        ...rows,
        '',
        `## Ny tavle med FORESLÅEDE regler (til godkendelse: ${PROPOSED_PANEL_SIZE_RULES.map((r) => `≤ ${r.maxGroups} grupper → ${r.code}`).join(', ')}; > ${PROPOSED_PANEL_SIZE_RULES[PROPOSED_PANEL_SIZE_RULES.length - 1].maxGroups} grupper = Ikke prissat)`,
        '',
        '| Opgave | Grupper | Valgt tavle | Materialer kr | Timer | Salgspris kr | Ikke prissat |',
        '|---|---|---|---|---|---|---|',
        ...proposalRows,
        '',
      ].join('\n'))
      log('\nskrevet: docs/runbooks/s2-elta-components-examples.md')
    } finally {
      await cleanup()
      const [left] = await stagingSql(`SELECT (SELECT count(*) FROM calc_components WHERE notes = '[HARNESS] S2 elta-components-compare')::int c, (SELECT count(*) FROM supplier_products WHERE external_id = 'harness-s2')::int p`)
      log(`oprydning: ${left.c} komponenter / ${left.p} produkter tilbage på staging`)
    }
    log(fails ? `\n❌ ${fails} fejl` : '\n✅ sammenligning gennemført')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'portal-reschedule-check') {
    // STAGING: kundeportalens "Ønsk anden dato" for en besigtigelse. Før: created_by = kundens id (FK til auth.users)
    // → opgaven blev aldrig oprettet. Nu: oprettes, tildeles besigtigelsens medarbejder, højst 3 pr. kunde pr. døgn.
    const { portalRequestReschedule } = await import('../../src/lib/actions/portal')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').limit(1)).data as Array<{ id: string }> | null)?.[0]?.id
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const { data: cu, error: cuErr } = await admin.from('customers').insert({ customer_number: `RS-${stamp}`, company_name: `[HARNESS] reschedule ${stamp}`, contact_person: 'Kunde', email: `rs-${stamp}@harness.test`, created_by: owner }).select('id').single()
    if (cuErr) throw new Error(cuErr.message)
    const custId = (cu as { id: string }).id
    try {
      const tok = randomBytes(32).toString('hex')
      const t1 = await admin.from('portal_access_tokens').insert({ customer_id: custId, token: tok, email: `rs-${stamp}@harness.test`, is_active: true, created_by: owner })
      if (t1.error) throw new Error(t1.error.message)
      const { data: bt } = await admin.from('customer_tasks').insert({ customer_id: custId, title: 'Besigtigelse hos [HARNESS] reschedule', status: 'pending', priority: 'normal', assigned_to: owner, created_by: owner, due_date: new Date(Date.now() + 5 * 86_400_000).toISOString() }).select('id').single()
      const taskId = (bt as { id: string }).id
      // bevis for den gamle fejl: created_by = kundens id afvises af FK'en
      const old = await admin.from('customer_tasks').insert({ customer_id: custId, title: 'gammel sti', status: 'pending', priority: 'high', created_by: custId })
      check('gammel indsættelse (created_by = kunde-id) fejler (FK) — fundet bekræftet', !!old.error, old.error?.code ?? 'INDSAT')
      const results: boolean[] = []
      for (let i = 0; i < 4; i++) results.push((await portalRequestReschedule(tok, taskId, `Kan vi flytte til næste uge? (${i + 1})`)).success)
      check('3 anmodninger modtages, 4. afvises (højst 3 pr. døgn)', JSON.stringify(results) === JSON.stringify([true, true, true, false]), JSON.stringify(results))
      const { data: created } = await admin.from('customer_tasks').select('title, assigned_to, created_by, auto_rule, priority').eq('customer_id', custId).eq('auto_rule', 'portal_reschedule')
      const rows = (created ?? []) as Array<{ title: string; assigned_to: string | null; created_by: string | null; auto_rule: string; priority: string }>
      check('opgaverne findes i CRM, tildelt besigtigelsens medarbejder', rows.length === 3 && rows.every((r) => r.assigned_to === owner && r.created_by === null && r.priority === 'high'), JSON.stringify(rows[0] ?? null))
      const other = await portalRequestReschedule(tok, '00000000-0000-0000-0000-000000000000', 'x')
      check('fremmed/ukendt opgave afvises', !other.success, other.error ?? '')
      const long = await portalRequestReschedule(tok, taskId, 'x'.repeat(2001))
      check('for lang besked afvises', !long.success, long.error ?? '')
    } finally {
      await admin.from('customers').delete().eq('id', custId) // opgaver + tokens følger med (CASCADE)
      await admin.from('portal_access_tokens').delete().eq('customer_id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ portal-ombooking bestået')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'supplier-load-check') {
    // STAGING (X4 pris #1): eksisterende leverandørprodukter indlæses ud over PostgREST's 1.000-rækkers-loft; tidsbudget
    // giver complete=false i stedet for at hænge. 2.500 midlertidige produkter (external_id-markør) ryddes op.
    const { loadExistingSupplierProducts } = await import('../../src/lib/suppliers/load-existing-products')
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const { data: sup } = await admin.from('suppliers').insert({ name: `[HARNESS] load ${Date.now()}`, code: `HL${Date.now() % 100000}`, is_active: false }).select('id').single()
    const supId = (sup as { id: string }).id
    try {
      for (let b = 0; b < 5; b++) {
        const rows = Array.from({ length: 500 }, (_, i) => ({ supplier_id: supId, supplier_sku: `HL-${b * 500 + i}`, supplier_name: `Harness ${b * 500 + i}`, cost_price: 10 + i, list_price: 20 + i, is_available: true, data_source: 'manual', external_id: 'harness-load' }))
        const { error } = await admin.from('supplier_products').insert(rows)
        if (error) throw new Error(error.message)
      }
      const t0 = Date.now()
      const r = await loadExistingSupplierProducts(admin, supId, { budgetMs: 60_000, concurrency: 3 })
      check('alle 2.500 indlæst (før højst 1.000)', r.complete && r.loaded === 2500 && r.total === 2500, `${r.loaded}/${r.total} på ${Date.now() - t0} ms`)
      check('opslag på sku efter række 1.000 virker', r.bySku.get('HL-2499')?.cost_price != null)
      let tick = 0
      const r2 = await loadExistingSupplierProducts(admin, supId, { budgetMs: 1, concurrency: 1, now: () => (tick += 10) })
      check('tidsbudget opbrugt → complete=false (aldrig hængende)', !r2.complete && r2.loaded < 2500, `${r2.loaded}/${r2.total}`)
    } finally {
      await admin.from('supplier_products').delete().eq('supplier_id', supId)
      await admin.from('suppliers').delete().eq('id', supId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ leverandørprodukter indlæses fuldt')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'besigtigelse-portal-check') {
    // STAGING (X4 kommunikation #1/#6): portalen viser kun bookede besigtigelser + kundens egne anmodninger (aldrig
    // interne opgaver), interne kan ikke bekræftes, og en allerede bekræftet bekræftes ikke igen. Sender INGEN mail
    // (afvisning og "allerede bekræftet" returnerer før mail-trinnet).
    const { getPortalBesigtigelser, portalConfirmBesigtigelse } = await import('../../src/lib/actions/portal')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: cu } = await admin.from('customers').insert({ customer_number: `BP-${stamp}`, company_name: `[HARNESS] besigtigelse ${stamp}`, contact_person: 'Kunde', email: `bp-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    try {
      const tok = randomBytes(32).toString('hex')
      await admin.from('portal_access_tokens').insert({ customer_id: custId, token: tok, email: `bp-${stamp}@harness.test`, is_active: true, created_by: owner })
      const future = new Date(Date.now() + 5 * 86_400_000).toISOString()
      const mk = async (title: string, extra: Record<string, unknown> = {}) => ((await admin.from('customer_tasks').insert({ customer_id: custId, title, status: 'pending', priority: 'normal', created_by: owner, ...extra }).select('id').single()).data as { id: string }).id
      const booked = await mk(`Besigtigelse hos [HARNESS] ${stamp}`, { due_date: future, description: 'Besigtigelse planlagt kl. 10:00' })
      const internal = await mk('Planlæg besigtigelse eller montage', { auto_rule: 'offer_conversion_startup', auto_generated: true })
      const request = await mk(`PORTAL: Besigtigelse anmodet — [HARNESS] ${stamp}`, { due_date: future })
      const list = await getPortalBesigtigelser(tok)
      const ids = (list.data ?? []).map((t) => t.id)
      check('portalen viser booket besigtigelse', ids.includes(booked))
      check('portalen viser kundens egen anmodning', ids.includes(request))
      check('portalen viser IKKE den interne opstartsopgave', !ids.includes(internal), JSON.stringify(ids.length))
      const c1 = await portalConfirmBesigtigelse(tok, internal)
      const { data: iSt } = await admin.from('customer_tasks').select('status').eq('id', internal).single()
      check('intern opgave kan ikke bekræftes fra portalen', !c1.success && (iSt as { status: string }).status === 'pending', c1.error ?? '')
      const c2 = await portalConfirmBesigtigelse(tok, request)
      check('egen anmodning kan ikke "bekræftes"', !c2.success, c2.error ?? '')
      await admin.from('customer_tasks').update({ status: 'done', description: 'udført' }).eq('id', booked)
      const c3 = await portalConfirmBesigtigelse(tok, booked)
      const { data: bSt } = await admin.from('customer_tasks').select('status, description').eq('id', booked).single()
      const b = bSt as { status: string; description: string }
      check('udført besigtigelse genåbnes ikke ved klik (før → in_progress + ny mail)', c3.success && b.status === 'done' && !b.description.includes('BEKRÆFTET'), JSON.stringify(b))
    } finally {
      await admin.from('customers').delete().eq('id', custId)
      await admin.from('portal_access_tokens').delete().eq('customer_id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ portal-besigtigelser bestået (ingen mail sendt)')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'planning-done-check') {
    // STAGING (X4 #1): en åben sag hvis eneste arbejdsordre er UDFØRT får intet nyt planlægningsforslag (før: dublet)
    const { runPlanningAgent } = await import('../../src/lib/agents/planning-agent')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: cu } = await admin.from('customers').insert({ customer_number: `PD-${stamp}`, company_name: `[HARNESS] planlægning udført ${stamp}`, contact_person: 'x', email: `pd-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    const mkCase = async (n: number) => ((await admin.from('service_cases').insert({ case_number: `SVC-7${String(stamp).slice(-5)}${n}`, customer_id: custId, title: `[HARNESS] pd ${n}`, status: 'in_progress', created_by: owner }).select('id').single()).data as { id: string }).id
    try {
      const done = await mkCase(1)
      await admin.from('work_orders').insert({ case_id: done, customer_id: custId, title: '[HARNESS] udført', status: 'done', scheduled_date: '2026-09-01' })
      const fresh = await mkCase(2)
      const r = await runPlanningAgent({ caseIds: [done, fresh], dryRun: true, triggeredBy: owner })
      // den udførte sag sorteres fra INDEN vurderingen (unplannedCases) → kun den nye sag behandles
      check('sag med kun udført arbejdsordre → ikke kandidat (intet forslag)', r.success && r.data?.cases === 1 && !r.data.skipped.some((s) => s.case_id === done), JSON.stringify(r.data))
      check('sag uden arbejdsordre er stadig kandidat', !r.data?.skipped.some((s) => s.case_id === fresh && /arbejdsordre/.test(s.reason)), JSON.stringify(r.data?.skipped))
    } finally {
      const { data: cs } = await admin.from('service_cases').select('id').eq('customer_id', custId)
      const ids = ((cs ?? []) as Array<{ id: string }>).map((x) => x.id)
      if (ids.length) {
        await admin.from('agent_actions').delete().in('payload->>case_id', ids)
        await admin.from('work_orders').delete().in('case_id', ids)
        await admin.from('service_cases').delete().in('id', ids)
      }
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ planlægning: udførte job foreslås ikke igen')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'invoice-guards-check') {
    // STAGING (X1 #7/#8): fakturakladde-redigering respekterer fakturatypen, fradragslinjer er låst, og en linjebaseret
    // kreditnota af kun et fradrag afvises (før forkert fortegn). Rydder op.
    const { editDraftLine, addManualDraftLine, deleteManualDraftLine } = await import('../../src/lib/services/invoice-draft-edit')
    const { createCreditNoteForInvoice } = await import('../../src/lib/services/invoice-credit')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: cu } = await admin.from('customers').insert({ customer_number: `IG-${stamp}`, company_name: `[HARNESS] fakturavagt ${stamp}`, contact_person: 'x', email: `ig-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cu as { id: string }).id
    let n = 0
    const mkInv = async (fields: Record<string, unknown>, lines: Array<[string, number, number]>) => {
      const { data, error } = await admin.from('invoices').insert({ invoice_number: `HX-${stamp}-${++n}`, customer_id: custId, status: 'draft', total_amount: 0, tax_amount: 0, final_amount: 0, ...fields }).select('id').single()
      if (error) throw new Error(`faktura: ${error.message}`)
      const id = (data as { id: string }).id
      const ids: string[] = []
      for (const [i, [desc, qty, price]] of lines.entries()) {
        const { data: l, error: le } = await admin.from('invoice_lines').insert({ invoice_id: id, position: i + 1, description: desc, quantity: qty, unit: 'stk', unit_price: price, total_price: qty * price }).select('id').single()
        if (le) throw new Error(`linje: ${le.message}`)
        ids.push((l as { id: string }).id)
      }
      const sub = lines.reduce((s, [, q, p]) => s + q * p, 0)
      await admin.from('invoices').update({ total_amount: sub, tax_amount: sub * 0.25, final_amount: sub * 1.25 }).eq('id', id)
      return { id, lines: ids }
    }
    try {
      const std = await mkInv({ invoice_type: 'standard' }, [['Arbejde', 2, 500]])
      const e1 = await editDraftLine(admin, std.id, std.lines[0], { unit_price: 600 })
      check('almindelig kladde: pris kan rettes', e1.ok && e1.totals?.total_amount === 1200, e1.message)

      const cr = await mkInv({ invoice_type: 'credit' }, [['Kreditnota: Arbejde', 1, -1000]])
      const c1 = await editDraftLine(admin, cr.id, cr.lines[0], { unit_price: -50000 })
      check('kreditnota-kladde: pris kan IKKE rettes (før −1.000 → −50.000)', !c1.ok, c1.message)
      const c2 = await editDraftLine(admin, cr.id, cr.lines[0], { description: 'Kreditnota: arbejde (rettet tekst)' })
      check('kreditnota-kladde: beskrivelse kan rettes', c2.ok, c2.message)
      const c3 = await addManualDraftLine(admin, cr.id, { description: 'ekstra', quantity: 1, unit_price: 500 })
      check('kreditnota-kladde: kan ikke tilføje linjer', !c3.ok, c3.message)
      const c4 = await deleteManualDraftLine(admin, cr.id, cr.lines[0])
      check('kreditnota-kladde: kan ikke slette linjer', !c4.ok, c4.message)

      const dep = await mkInv({ invoice_type: 'deposit', billing_percentage: 30 }, [['Forskud 30 %', 1, 30000]])
      const d1 = await editDraftLine(admin, dep.id, dep.lines[0], { unit_price: 45000 })
      check('forskudskladde: beløb låst (procent af kontraktsum)', !d1.ok, d1.message)

      const fin = await mkInv({ invoice_type: 'standard', is_final_invoice: true }, [['Arbejde', 1, 100000], ['Fradrag: HX-forskud (forskud)', 1, -30000]])
      const f1 = await editDraftLine(admin, fin.id, fin.lines[1], { unit_price: 0 })
      check('slutfaktura: fradragslinje kan ikke rettes', !f1.ok, f1.message)
      const f2 = await deleteManualDraftLine(admin, fin.id, fin.lines[1])
      check('slutfaktura: fradragslinje kan ikke slettes (før forskud faktureret to gange)', !f2.ok, f2.message)
      const f3 = await editDraftLine(admin, fin.id, fin.lines[0], { unit_price: 110000 })
      check('slutfaktura: almindelig linje kan rettes', f3.ok, f3.message)

      // #7: sendt slutfaktura — kreditering af KUN fradragslinjen afvises; arbejde + fradrag = 70k
      const sent = await mkInv({ invoice_type: 'standard', is_final_invoice: false }, [['Arbejde', 1, 100000], ['Fradrag: HX-forskud2 (forskud)', 1, -30000]])
      await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', sent.id)
      const k1 = await createCreditNoteForInvoice({ invoice_id: sent.id, credit_type: 'partial', reason: 'harness', selected_line_ids: [sent.lines[1]] }, owner)
      check('kreditering af kun fradragslinjen afvises (før forkert fortegn)', !k1.ok, k1.message)
      const k2 = await createCreditNoteForInvoice({ invoice_id: sent.id, credit_type: 'partial', reason: 'harness', selected_line_ids: sent.lines }, owner)
      check('kreditering af arbejde + fradrag = 70.000 (fortegn korrekt)', k2.ok && k2.credited_ex_vat === 70000, `${k2.message} (${k2.credited_ex_vat})`)
      if (k2.credit_invoice_id) {
        const { data: kl } = await admin.from('invoice_lines').select('total_price').eq('invoice_id', k2.credit_invoice_id)
        const lineSum = ((kl ?? []) as Array<{ total_price: number }>).reduce((s, l) => s + Number(l.total_price), 0)
        const { data: kh } = await admin.from('invoices').select('total_amount').eq('id', k2.credit_invoice_id).single()
        check('  kreditnotaens linjer og header stemmer', Math.abs(Math.abs(lineSum) - Math.abs(Number((kh as { total_amount: number }).total_amount))) < 0.01, `linjer ${lineSum} / header ${(kh as { total_amount: number }).total_amount}`)
      }
    } finally {
      const { data: invs } = await admin.from('invoices').select('id').eq('customer_id', custId)
      const ids = ((invs ?? []) as Array<{ id: string }>).map((x) => x.id)
      if (ids.length) {
        await admin.from('invoice_lines').delete().in('invoice_id', ids)
        await admin.from('invoices').delete().in('credit_of_invoice_id', ids)
        await admin.from('invoices').delete().in('id', ids)
      }
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ fakturavagter (X1 #7/#8) bestået')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'assistant-commands-check') {
    // STAGING (X2): hjælp, "i dag", flyt opgave (forsprang bevares, kun egne), flyt personlig påmindelse, sagsopslag
    // med næste arbejdsordre. Rydder op.
    const { runAssistantCommand } = await import('../../src/lib/assistant/run-command')
    const { copenhagenParts: cph, copenhagenLocalToIso } = await import('../../src/lib/utils/copenhagen-time')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const profs = ((await admin.from('profiles').select('id, role').eq('is_active', true)).data ?? []) as Array<{ id: string; role: string }>
    const adminP = profs.find((p) => p.role === 'admin')!
    const salgP = profs.find((p) => p.role === 'salg')!
    const actor = { profileId: adminP.id, role: 'admin' as const, isActive: true, channel: 'test' as const }
    const salgActor = { profileId: salgP.id, role: 'salg' as const, isActive: true, channel: 'test' as const }
    await admin.from('customers').delete().like('customer_number', 'AC-%').like('company_name', 'ACkunde%') // efterladte fra afbrudte kørsler
    const { data: cu } = await admin.from('customers').insert({ customer_number: `AC-${stamp}`, company_name: `ACkunde${stamp}`, contact_person: 'x', email: `ac-${stamp}@harness.test`, created_by: adminP.id }).select('id').single()
    const custId = (cu as { id: string }).id
    const { data: sc } = await admin.from('service_cases').insert({ case_number: `SVC-8${String(stamp).slice(-6)}`, customer_id: custId, title: '[HARNESS] opslag', status: 'new', created_by: adminP.id }).select('id, case_number').single()
    const sCase = sc as { id: string; case_number: string } | null
    if (!sCase) { await admin.from('customers').delete().eq('id', custId); throw new Error('testsag kunne ikke oprettes') }
    try {
      const h = await runAssistantCommand(admin, actor, 'hjælp')
      check('hjælp viser eksempler', h.ok && /Ring til/.test(h.text) && /Flyt/.test(h.text))
      // i dag: opgave i dag kl. 23:30 (dansk) + personlig påmindelse i dag kl. 23:45
      const today = cph(new Date()).date
      const { data: t } = await admin.from('customer_tasks').insert({ customer_id: custId, title: `Ring til ACkunde${stamp}`, status: 'pending', priority: 'normal', assigned_to: adminP.id, created_by: adminP.id, due_date: copenhagenLocalToIso(today, '23:30'), reminder_at: copenhagenLocalToIso(today, '23:15'), auto_rule: 'assistant_callback' }).select('id').single()
      const taskId = (t as { id: string }).id
      await admin.from('personal_reminders').insert({ owner_id: adminP.id, title: `arbejdstøj ${stamp}`, due_at: copenhagenLocalToIso(today, '23:45'), reminder_at: copenhagenLocalToIso(today, '23:45'), source: 'manual' })
      const d = await runAssistantCommand(admin, actor, 'i dag')
      check('"i dag" viser egne opkald + påmindelser i tidsorden', d.ok && d.text.indexOf(`Ring til ACkunde${stamp}`) > -1 && d.text.indexOf(`arbejdstøj ${stamp}`) > d.text.indexOf(`Ring til ACkunde${stamp}`), d.text.replace(/\n/g, ' | '))
      const ds = await runAssistantCommand(admin, salgActor, 'i dag')
      check('"i dag" for en anden bruger viser ikke mine', !ds.text.includes(`ACkunde${stamp}`) && !ds.text.includes(`arbejdstøj ${stamp}`))
      // flyt opgave: forsprang (15 min) bevares
      const NOW = new Date('2026-10-06T12:30:00Z')
      const m1 = await runAssistantCommand(admin, actor, `Flyt opkaldet til ACkunde${stamp} til i morgen kl. 10`, NOW)
      const { data: mv } = await admin.from('customer_tasks').select('due_date, reminder_at').eq('id', taskId).single()
      const mvr = mv as { due_date: string; reminder_at: string }
      check('flyt opkald → ny tid i CRM, påmindelse 15 min før (forsprang bevaret)', m1.ok && new Date(mvr.due_date).toISOString() === '2026-10-07T08:00:00.000Z' && new Date(mvr.reminder_at).toISOString() === '2026-10-07T07:45:00.000Z', m1.text)
      const m2 = await runAssistantCommand(admin, salgActor, `Flyt opkaldet til ACkunde${stamp} til fredag kl. 10`, NOW)
      check('salg kan ikke flytte admins opkald (ikke egen)', !m2.ok, m2.text)
      const m3 = await runAssistantCommand(admin, actor, `Flyt påmindelsen om arbejdstøj ${stamp} til fredag kl 9`, NOW)
      const { data: pr } = await admin.from('personal_reminders').select('due_at, reminder_at').eq('owner_id', adminP.id).eq('title', `arbejdstøj ${stamp}`).single()
      check('flyt personlig påmindelse → ny tid (due + reminder)', m3.ok && new Date((pr as { due_at: string }).due_at).toISOString() === '2026-10-09T07:00:00.000Z' && (pr as { reminder_at: string }).reminder_at === (pr as { due_at: string }).due_at, m3.text)
      const m4 = await runAssistantCommand(admin, salgActor, `Flyt påmindelsen om arbejdstøj ${stamp} til fredag kl 9`, NOW)
      check('en anden bruger finder ikke min påmindelse', !m4.ok, m4.text)
      // sagsopslag med næste arbejdsordre
      await admin.from('work_orders').insert({ case_id: sCase.id, title: `[HARNESS] montage ${stamp}`, status: 'planned', scheduled_date: (await import('../../src/lib/utils/copenhagen-time')).copenhagenDatePlusDays(3) })
      const l = await runAssistantCommand(admin, actor, `Status på ${sCase.case_number}`)
      check('sagsopslag viser næste arbejdsordre', l.ok && /Næste arbejdsordre: .*montage/.test(l.text), l.text.replace(/\n/g, ' | '))
      const { data: au } = await admin.from('audit_logs').select('action').in('action', ['assistant_today', 'assistant_task_rescheduled', 'assistant_personal_reminder_rescheduled']).gte('created_at', new Date(stamp - 5_000).toISOString())
      check('audit for i dag/flyt', new Set(((au ?? []) as Array<{ action: string }>).map((a) => a.action)).size === 3)
    } finally {
      await admin.from('work_orders').delete().eq('case_id', sCase.id)
      await admin.from('service_cases').delete().eq('id', sCase.id)
      await admin.from('customers').delete().eq('id', custId)
      await admin.from('personal_reminders').delete().eq('owner_id', adminP.id).like('title', `%${stamp}%`)
      await admin.from('audit_logs').delete().like('action', 'assistant_%').gte('created_at', new Date(stamp - 5_000).toISOString())
    }
    log(fails ? `❌ ${fails} fejl` : '✅ assistent-kommandoer (X2) bestået')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'notes-reminders-flow') {
    // STAGING (T6 + personlige påmindelser): assistenten skriver noter (sag → case_notes, kunde → customer_notes,
    // customers.notes urørt) og personlige påmindelser; påmindelsen følger CRM-tiden; Udsæt/Udført kun for ejeren;
    // audit. Telegram-beskeder fanges af test-transport (intet live).
    const { runAssistantCommand } = await import('../../src/lib/assistant/run-command')
    const { setTelegramTransport } = await import('../../src/lib/assistant/telegram/transport')
    const { handleTelegramUpdate } = await import('../../src/lib/assistant/telegram/handle-update')
    const { createLinkCode } = await import('../../src/lib/assistant/telegram/link')
    const { dispatchAssistantReminders } = await import('../../src/lib/assistant/reminders')
    const { telegramReminderSender } = await import('../../src/lib/assistant/telegram/reminder-sender')
    const stamp = Date.now()
    const sent: Array<{ chatId: number; text: string; buttons?: Array<{ action: string; ref: string }> }> = []
    setTelegramTransport(async (m) => { sent.push(m); return { delivered: true } })
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const profs = ((await admin.from('profiles').select('id, role').eq('is_active', true)).data ?? []) as Array<{ id: string; role: string }>
    const adminP = profs.find((p) => p.role === 'admin')!
    const salgP = profs.find((p) => p.role === 'salg')!
    const actor = { profileId: adminP.id, role: 'admin' as const, isActive: true, channel: 'test' as const }
    const chatA = 910_000_000 + (stamp % 1_000_000)
    const chatS = chatA + 1
    const { data: cu } = await admin.from('customers').insert({ customer_number: `NF-${stamp}`, company_name: `NFkunde${stamp}`, contact_person: 'x', email: `nf-${stamp}@harness.test`, notes: 'FRITEKST URØRT', created_by: adminP.id }).select('id').single()
    const custId = (cu as { id: string }).id
    const { data: sc } = await admin.from('service_cases').insert({ case_number: `SVC-9${String(stamp).slice(-6)}`, customer_id: custId, title: '[HARNESS] notesag', status: 'new', created_by: adminP.id }).select('id, case_number').single()
    const sCase = sc as { id: string; case_number: string } | null
    const prevLinks = ((await admin.from('assistant_links').select('*').in('profile_id', [adminP.id, salgP.id])).data ?? []) as Array<Record<string, unknown>>
    try {
      check('testsag oprettet', !!sCase)
      // noter
      const n1 = await runAssistantCommand(admin, actor, `Note til NFkunde${stamp}: kunden ønsker hvid tavle i morgen`)
      const { data: cn } = await admin.from('customer_notes').select('content, source, created_by').eq('customer_id', custId)
      const cnr = (cn ?? []) as Array<{ content: string; source: string; created_by: string }>
      check('note på kunde → customer_notes (source assistant, forfatter = brugeren)', n1.ok && cnr.length === 1 && cnr[0].source === 'assistant' && cnr[0].created_by === adminP.id && cnr[0].content === 'kunden ønsker hvid tavle i morgen', n1.text)
      const n2 = await runAssistantCommand(admin, actor, `Note til ${sCase?.case_number}: husk stige`)
      const { data: csn } = await admin.from('case_notes').select('content, source, kind').eq('case_id', sCase?.id ?? '')
      const csr = (csn ?? []) as Array<{ content: string; source: string; kind: string }>
      check('note på sag → eksisterende case_notes (source assistant)', n2.ok && csr.length === 1 && csr[0].source === 'assistant' && csr[0].kind === 'note', n2.text)
      const n3 = await runAssistantCommand(admin, { ...actor, profileId: salgP.id, role: 'salg' }, `Note til ${sCase?.case_number}: salg prøver`)
      check('salg kan ikke skrive sagsnote (cases.edit, som i CRM)', !n3.ok, n3.text)
      const { data: cnotes } = await admin.from('customers').select('notes').eq('id', custId).single()
      check('customers.notes aldrig overskrevet', (cnotes as { notes: string }).notes === 'FRITEKST URØRT')
      // personlig påmindelse via assistenten
      const NOW = new Date('2026-10-06T12:30:00Z') // tirsdag
      const r1 = await runAssistantCommand(admin, actor, 'Mind mig om at bestille arbejdstøj fredag kl. 9', NOW)
      const { data: pr } = await admin.from('personal_reminders').select('id, owner_id, title, due_at, reminder_at, source').eq('id', r1.taskId ?? '').maybeSingle()
      const prr = pr as { id: string; owner_id: string; title: string; due_at: string; reminder_at: string; source: string } | null
      check('"Mind mig om … fredag kl. 9" uden kunde → personlig påmindelse til brugeren', r1.ok && prr?.owner_id === adminP.id && prr?.title === 'bestille arbejdstøj' && new Date(prr!.due_at).toISOString() === '2026-10-09T07:00:00.000Z' && prr?.source === 'assistant', r1.text)
      // Telegram: forbind admin + salg, påmindelse forfalden → besked med Udsæt/Udført
      await admin.from('assistant_links').delete().in('profile_id', [adminP.id, salgP.id])
      for (const [p, chat] of [[adminP.id, chatA], [salgP.id, chatS]] as const) {
        const { code } = await createLinkCode(admin, p)
        await handleTelegramUpdate(admin, { message: { chat: { id: chat, type: 'private' }, text: `/start ${code}` } })
      }
      const onlyMine = async (r: { taskId: string } & Parameters<ReturnType<typeof telegramReminderSender>>[0]) => (r.taskId === prr?.id ? telegramReminderSender(admin)(r) : { delivered: false, channel: 'test' })
      await admin.from('personal_reminders').update({ reminder_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', prr!.id)
      sent.length = 0
      await dispatchAssistantReminders(admin, onlyMine)
      const msg1 = sent.find((m) => m.chatId === chatA)
      check('personlig påmindelse sendt til ejerens chat med Udsæt · Udført', !!msg1 && JSON.stringify((msg1.buttons ?? []).map((b) => b.action)) === JSON.stringify(['p_snooze', 'p_done']), msg1?.text)
      check('ingen andre modtager den', !sent.some((m) => m.chatId === chatS))
      await handleTelegramUpdate(admin, { callback_query: { id: 'x', data: `p_done:${prr!.id}`, message: { chat: { id: chatS } } } })
      const { data: still } = await admin.from('personal_reminders').select('status').eq('id', prr!.id).single()
      check('anden bruger kan ikke trykke Udført på min påmindelse', (still as { status: string }).status === 'pending' && /ikke din/.test(sent[sent.length - 1]?.text ?? ''), sent[sent.length - 1]?.text)
      const t0 = Date.now()
      await handleTelegramUpdate(admin, { callback_query: { id: 'x', data: `p_snooze:${prr!.id}`, message: { chat: { id: chatA } } } })
      const { data: sn } = await admin.from('personal_reminders').select('reminder_at').eq('id', prr!.id).single()
      check('Udsæt → påmindelsen flyttes 60 min i CRM', Math.abs(new Date((sn as { reminder_at: string }).reminder_at).getTime() - (t0 + 3_600_000)) < 60_000)
      // ændret tid i CRM → ny påmindelse
      await admin.from('personal_reminders').update({ reminder_at: new Date(Date.now() - 30_000).toISOString() }).eq('id', prr!.id)
      sent.length = 0
      await dispatchAssistantReminders(admin, onlyMine)
      check('ændret tid i CRM → påmindes på det nye tidspunkt', sent.some((m) => m.chatId === chatA))
      sent.length = 0
      await dispatchAssistantReminders(admin, onlyMine)
      check('samme tidspunkt sendes ikke igen', !sent.some((m) => m.chatId === chatA))
      await handleTelegramUpdate(admin, { callback_query: { id: 'x', data: `p_done:${prr!.id}`, message: { chat: { id: chatA } } } })
      const { data: dn } = await admin.from('personal_reminders').select('status').eq('id', prr!.id).single()
      check('Udført (ejer) → markeret udført i CRM', (dn as { status: string }).status === 'done')
      // audit
      const { data: au } = await admin.from('audit_logs').select('action').gte('created_at', new Date(stamp - 5_000).toISOString()).in('action', ['assistant_note_created', 'assistant_personal_reminder_created', 'assistant_reminder_sent', 'assistant_personal_reminder_snoozed', 'assistant_personal_reminder_done', 'assistant_button_denied', 'assistant_denied'])
      const acts = new Set(((au ?? []) as Array<{ action: string }>).map((a) => a.action))
      check('audit for noter, påmindelser, knapper og afvisninger', acts.size === 7, Array.from(acts).join(', '))
    } finally {
      setTelegramTransport(null)
      await admin.from('assistant_links').delete().in('profile_id', [adminP.id, salgP.id])
      if (prevLinks.length) await admin.from('assistant_links').insert(prevLinks)
      await admin.from('personal_reminders').delete().eq('owner_id', adminP.id).like('notes', '%ELTA Assistant%')
      if (sCase) await admin.from('service_cases').delete().eq('id', sCase.id)
      await admin.from('customers').delete().eq('id', custId)
      await admin.from('audit_logs').delete().gte('created_at', new Date(stamp - 5_000).toISOString()).like('action', 'assistant_%')
    }
    log(fails ? `❌ ${fails} fejl` : '✅ noter/påmindelser via assistent bestået (intet live)')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'register-payment-check') {
    // Økonomi-review #3/#5/#7: registerPayment — kladde/kreditnota afvises; samtidige betalinger tabes ikke; "betalt"
    // måles efter kreditnotaer. Ingen mail; e-conomic er ikke sat op på staging (mark-paid springes over).
    const { registerPayment } = await import('../../src/lib/services/invoices')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `RP-${stamp}`, company_name: `[HARNESS] rp ${stamp}`, contact_person: 'X', email: `rp-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const ids: string[] = []
    const mk = async (tag: string, status: string, final: number, extra: Record<string, unknown> = {}) => {
      const { data, error } = await admin.from('invoices').insert({ invoice_number: `H-RP-${tag}-${stamp}`, customer_id: cust, status, payment_status: 'pending', total_amount: final * 0.8, tax_amount: final * 0.2, final_amount: final, amount_paid: 0, currency: 'DKK', reminder_count: 0, ...extra }).select('id').single()
      if (error) throw new Error(`${tag}: ${error.message}`)
      ids.push((data as { id: string }).id)
      return (data as { id: string }).id
    }
    const get = async (id: string) => (await admin.from('invoices').select('status, payment_status, amount_paid').eq('id', id).single()).data as { status: string; payment_status: string; amount_paid: number }
    try {
      const draft = await mk('draft', 'draft', 500)
      const dErr = await registerPayment(draft, 500).then(() => null, (e: Error) => e.message)
      const dPays = (await admin.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('invoice_id', draft)).count ?? 0
      check('kladde kan ikke modtage betaling (ingen betalingsrække)', !!dErr && dPays === 0, dErr ?? 'ingen fejl')
      const orig = await mk('orig', 'sent', 1000)
      await mk('cred', 'sent', -400, { invoice_type: 'credit', credit_of_invoice_id: orig })
      const r = await registerPayment(orig, 600)
      const o = await get(orig)
      check('1.000 − kredit 400, betalt 600 → fuldt betalt', r.fullyPaid && o.status === 'paid' && o.payment_status === 'paid', JSON.stringify(o))
      const conc = await mk('conc', 'sent', 1000)
      await Promise.all([registerPayment(conc, 300), registerPayment(conc, 300)])
      const c = await get(conc)
      check('to samtidige betalinger à 300 → amount_paid 600 (ingen tabt)', Number(c.amount_paid) === 600 && c.payment_status === 'partial', JSON.stringify(c))
    } finally {
      if (ids.length) { await admin.from('invoice_payments').delete().in('invoice_id', ids); await admin.from('invoices').delete().in('credit_of_invoice_id', ids); await admin.from('invoices').delete().in('id', ids) }
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ betalingsregistrering ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'draft-delete-claim-check') {
    // Økonomi-review #9: kladde under afsendelse (sent_at-krav) kan hverken slettes eller redigeres; normal kladde slettes
    const { deleteInvoiceDraft } = await import('../../src/lib/services/invoices')
    const { recomputeDraftTotals } = await import('../../src/lib/services/invoice-draft-edit')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `DD-${stamp}`, company_name: `[HARNESS] dd ${stamp}`, contact_person: 'X', email: `dd-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const mk = async (tag: string, sentAt: string | null) => ((await admin.from('invoices').insert({ invoice_number: `H-DD-${tag}-${stamp}`, customer_id: cust, status: 'draft', payment_status: 'pending', total_amount: 80, tax_amount: 20, final_amount: 100, amount_paid: 0, currency: 'DKK', reminder_count: 0, sent_at: sentAt }).select('id').single()).data as { id: string }).id
    try {
      const sending = await mk('sending', new Date().toISOString())
      const e1 = await deleteInvoiceDraft(sending, owner).then(() => null, (e: Error) => e.message)
      const still = (await admin.from('invoices').select('id').eq('id', sending).maybeSingle()).data
      check('kladde under afsendelse kan ikke slettes', !!e1 && !!still, e1 ?? 'slettet!')
      const ed = await recomputeDraftTotals(admin, sending, 0.25)
      check('kladde under afsendelse kan ikke redigeres', !ed.ok, JSON.stringify(ed).slice(0, 100))
      const normal = await mk('normal', null)
      const e2 = await deleteInvoiceDraft(normal, owner).then(() => null, (e: Error) => e.message)
      const gone = !(await admin.from('invoices').select('id').eq('id', normal).maybeSingle()).data
      check('almindelig kladde slettes stadig', !e2 && gone, e2 ?? '')
    } finally {
      await admin.from('invoices').delete().eq('customer_id', cust)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ kladde-sletning/afsendelse ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'stage-race-check') {
    // Økonomi-review: to samtidige rater à 60 % → kun én oprettes (≤ 100 %). Kun kladder; ingen mail/eksport.
    const { createStageInvoiceForCase } = await import('../../src/lib/services/invoice-stage')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `SR-${stamp}`, company_name: `[HARNESS] sr ${stamp}`, contact_person: 'X', email: `sr-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const { data: sc, error: scErr } = await admin.from('service_cases').insert({ case_number: `SVC-8${String(stamp).slice(-6)}`, customer_id: cust, title: '[HARNESS] rate', status: 'new', contract_sum: 10000, created_by: owner }).select('id').single()
    if (scErr) throw new Error(scErr.message)
    const caseId = (sc as { id: string }).id
    try {
      const rs = await Promise.all([1, 2].map(() => createStageInvoiceForCase({ case_id: caseId, invoice_type: 'deposit', amount_basis: 'contract_sum', billing_percentage: 60 }, owner)))
      const { data: st } = await admin.from('invoices').select('billing_percentage').eq('case_id', caseId)
      const sum = ((st ?? []) as Array<{ billing_percentage: number }>).reduce((a, r) => a + Number(r.billing_percentage), 0)
      check('2 samtidige rater à 60 % → én oprettet, sum ≤ 100 %', rs.filter((r) => r.ok).length === 1 && sum === 60, `ok=${rs.filter((r) => r.ok).length} sum=${sum} ${rs.map((r) => r.message).join(' | ').slice(0, 160)}`)
    } finally {
      const { data: inv } = await admin.from('invoices').select('id').eq('case_id', caseId)
      const ids = ((inv ?? []) as Array<{ id: string }>).map((r) => r.id)
      if (ids.length) { await admin.from('invoice_lines').delete().in('invoice_id', ids); await admin.from('invoices').delete().in('id', ids) }
      await admin.from('service_cases').delete().eq('id', caseId)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ rate-race ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'credit-race-check') {
    // Økonomi-review #4: to samtidige fulde kreditnotaer → højst 100 % krediteret. Kun kladder; ingen mail/eksport.
    const { createCreditNoteForInvoice } = await import('../../src/lib/services/invoice-credit')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `CR-${stamp}`, company_name: `[HARNESS] cr ${stamp}`, contact_person: 'X', email: `cr-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const { data: inv, error } = await admin.from('invoices').insert({ invoice_number: `H-CR-${stamp}`, customer_id: cust, status: 'sent', payment_status: 'pending', total_amount: 800, tax_amount: 200, final_amount: 1000, amount_paid: 0, currency: 'DKK', reminder_count: 0 }).select('id').single()
    if (error) throw new Error(error.message)
    const origId = (inv as { id: string }).id
    await admin.from('invoice_lines').insert({ invoice_id: origId, position: 1, description: 'harness', quantity: 1, unit: 'stk', unit_price: 800, total_price: 800 })
    try {
      const rs = await Promise.all([1, 2, 3].map(() => createCreditNoteForInvoice({ invoice_id: origId, credit_type: 'full', reason: 'harness race' }, owner)))
      const { data: cr } = await admin.from('invoices').select('total_amount').eq('credit_of_invoice_id', origId)
      const total = ((cr ?? []) as Array<{ total_amount: number }>).reduce((a, c) => a + Math.abs(Number(c.total_amount)), 0)
      check('3 samtidige fulde kreditnotaer → præcis 800 krediteret', total === 800 && rs.filter((r) => r.ok).length === 1, `krediteret=${total} ok=${rs.filter((r) => r.ok).length} ${rs.map((r) => r.message).join(' | ').slice(0, 200)}`)
    } finally {
      const { data: cr } = await admin.from('invoices').select('id').eq('credit_of_invoice_id', origId)
      const crIds = ((cr ?? []) as Array<{ id: string }>).map((c) => c.id)
      if (crIds.length) { await admin.from('invoice_predecessors').delete().in('invoice_id', crIds); await admin.from('invoice_lines').delete().in('invoice_id', crIds); await admin.from('invoices').delete().in('id', crIds) }
      await admin.from('invoice_lines').delete().eq('invoice_id', origId)
      await admin.from('invoices').delete().eq('id', origId)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ kreditnota-race ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'package-embed-probe') {
    // Leverandør-review #3: package_items med product_catalog-embed som rigtige persona-sessioner (efter 00201)
    const { loginPersonas } = await import('./role-matrix')
    const personas = new Map(Array.from(await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })))
    let fails = 0
    for (const [role, cl] of personas) {
      const old = await cl.from('package_items').select('id, product:product_catalog(id, sku, name, cost_price, list_price)').limit(1)
      const neu = await cl.from('package_items').select('id, product:product_catalog(id, sku, name, list_price)').limit(1)
      const ok = !neu.error
      if (!ok) fails++
      log(`  ${ok ? '✓' : '❌'} ${role.padEnd(12)} gammel: ${old.error ? 'FEJL ' + old.error.code : 'ok'} · ny: ${neu.error ? 'FEJL ' + neu.error.message : 'ok'}`)
    }
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'missed-call-check') {
    // T12 (staging): ubesvaret opkald → tilbageringningsopgave via test-klient (ingen Relatel, intet live).
    const { syncMissedCalls } = await import('../../src/lib/integrations/relatel/missed-calls')
    const { disabledRelatelClient } = await import('../../src/lib/integrations/relatel/contract')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const local = `9${String(stamp).slice(-7)}`, local2 = `8${String(stamp).slice(-7)}`, unknown = `7${String(stamp).slice(-7)}`
    const spaced = `${local.slice(0, 2)} ${local.slice(2, 4)} ${local.slice(4, 6)} ${local.slice(6)}`
    const mkC = async (tag: string, phone: string) => ((await admin.from('customers').insert({ customer_number: `MC${tag}-${stamp}`, company_name: `[HARNESS] mc ${tag} ${stamp}`, contact_person: 'X', email: `mc${tag}-${stamp}@harness.test`, phone, created_by: owner }).select('id').single()).data as { id: string }).id
    const c1 = await mkC('a', spaced), c2 = await mkC('b', local2), c3 = await mkC('c', `+45${local2}`)
    const call = (uuid: string, from: string, extra: Record<string, unknown> = {}) => ({ uuid: `${uuid}-${stamp}`, direction: 'inbound' as const, from, started_at: '2026-10-08T08:15:00Z', answered_at: null, ...extra })
    const fake = (calls: unknown[]) => ({ ...disabledRelatelClient, listCalls: async () => calls as never })
    try {
      const d = await syncMissedCalls(admin, disabledRelatelClient, { since: '2026-10-08T00:00:00Z', assigneeProfileId: owner })
      check('deaktiveret klient → intet sker', d.status === 'disabled' && d.outcomes.length === 0)
      const calls = [
        call('m1', `45${local}`, { voicemail_transcript: 'Hej, det er om tavlen, ring gerne tilbage' }),
        call('m1', `45${local}`),
        call('answered', `45${local}`, { answered_at: '2026-10-08T08:15:05Z' }),
        call('amb', `45${local2}`),
        call('unk', `45${unknown}`),
      ]
      const r = await syncMissedCalls(admin, fake(calls), { since: '2026-10-08T00:00:00Z', assigneeProfileId: owner })
      const st = r.outcomes.map((o) => o.status)
      check('ubesvaret fra kendt nummer → opgave', st[0] === 'created', JSON.stringify(st))
      check('samme opkald igen → ingen dublet', st[1] === 'duplicate')
      check('besvaret opkald ignoreres', st[2] === 'ignored')
      check('nummer på to kunder → tvetydig (intet gæt)', st[3] === 'ambiguous')
      check('ukendt nummer → unmatched', st[4] === 'unmatched')
      const { data: t } = await admin.from('customer_tasks').select('title, description, auto_rule, assigned_to, priority').eq('customer_id', c1)
      const task = ((t ?? []) as Array<{ title: string; description: string; auto_rule: string; assigned_to: string; priority: string }>)
      check('præcis én opgave med telefonsvarer og klokkeslæt (dansk tid)', task.length === 1 && task[0].auto_rule === 'assistant_missed_call' && task[0].description.includes('kl. 10.15') && task[0].description.includes('tavlen'), JSON.stringify(task[0] ?? {}).slice(0, 160))
      const others = (await admin.from('customer_tasks').select('id', { count: 'exact', head: true }).in('customer_id', [c2, c3])).count ?? 0
      check('ingen opgave på de tvetydige kunder', others === 0)
    } finally {
      await admin.from('customer_tasks').delete().in('customer_id', [c1, c2, c3])
      await admin.from('audit_logs').delete().eq('action', 'assistant_missed_call_task').gte('created_at', new Date(stamp - 5_000).toISOString())
      await admin.from('customers').delete().in('id', [c1, c2, c3])
    }
    log(fails ? `❌ ${fails} fejl` : '✅ ubesvarede opkald (T12) ok — intet live')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'assistant-voice-check') {
    // STAGING (T11): talebesked → transskription → samme kommandomotor. Fil-hentning, transskription og Telegram-
    // transport er test-adaptere (intet live, ingen AI-kald). Ukendt chat/flag fra/for lang → intet hentes.
    const { setTelegramTransport } = await import('../../src/lib/assistant/telegram/transport')
    const { handleTelegramUpdate } = await import('../../src/lib/assistant/telegram/handle-update')
    const { createLinkCode } = await import('../../src/lib/assistant/telegram/link')
    const { setVoiceAdapters } = await import('../../src/lib/assistant/voice')
    const stamp = Date.now()
    const sent: Array<{ chatId: number; text: string }> = []
    setTelegramTransport(async (m) => { sent.push(m); return { delivered: true } })
    let fetches = 0
    let heard: string | null = null
    setVoiceAdapters({
      fetcher: async () => { fetches++; return new Uint8Array([1, 2, 3]) },
      transcriber: async () => (heard ? { ok: true as const, text: heard } : { ok: false as const, reason: 'failed' as const }),
    })
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const adminP = (((await admin.from('profiles').select('id, role').eq('is_active', true).eq('role', 'admin').limit(1)).data ?? []) as Array<{ id: string }>)[0]
    const chat = 920_000_000 + (stamp % 1_000_000)
    const { data: cu } = await admin.from('customers').insert({ customer_number: `VC-${stamp}`, company_name: `VCkunde${stamp}`, contact_person: 'x', email: `vc-${stamp}@harness.test`, phone: '12345678', created_by: adminP.id }).select('id').single()
    const custId = (cu as { id: string }).id
    const prevLinks = ((await admin.from('assistant_links').select('*').eq('profile_id', adminP.id)).data ?? []) as Array<Record<string, unknown>>
    const prevFlag = process.env.ASSISTANT_VOICE_ENABLED
    const voiceMsg = (duration = 5) => ({ message: { chat: { id: chat, type: 'private' }, voice: { file_id: 'f1', duration, mime_type: 'audio/ogg', file_size: 20_000 } } })
    try {
      process.env.ASSISTANT_VOICE_ENABLED = 'true'
      const u = await handleTelegramUpdate(admin, voiceMsg())
      check('ukendt chat → afvist, intet hentet/transskriberet', u.handled === 'unlinked' && fetches === 0)
      await admin.from('assistant_links').delete().eq('profile_id', adminP.id)
      const { code } = await createLinkCode(admin, adminP.id)
      await handleTelegramUpdate(admin, { message: { chat: { id: chat, type: 'private' }, text: `/start ${code}` } })
      process.env.ASSISTANT_VOICE_ENABLED = 'false'
      const d = await handleTelegramUpdate(admin, voiceMsg())
      check('flag fra → "skriv som tekst", intet hentet', d.handled === 'voice_disabled' && fetches === 0)
      process.env.ASSISTANT_VOICE_ENABLED = 'true'
      const l = await handleTelegramUpdate(admin, voiceMsg(120))
      check('over 60 sek → afvist før download', l.handled === 'voice_rejected' && fetches === 0)
      heard = null
      const f = await handleTelegramUpdate(admin, voiceMsg())
      const tasksAfterFail = (await admin.from('customer_tasks').select('id', { count: 'exact', head: true }).eq('customer_id', custId)).count ?? 0
      check('transskription fejler → venligt svar, ingen opgave', f.handled === 'voice_failed' && tasksAfterFail === 0)
      heard = `Ring til VCkunde${stamp} i morgen kl. 10`
      sent.length = 0
      const ok = await handleTelegramUpdate(admin, voiceMsg())
      const tasks = (await admin.from('customer_tasks').select('id', { count: 'exact', head: true }).eq('customer_id', custId)).count ?? 0
      const last = sent[sent.length - 1]?.text ?? ''
      check('talebesked → samme kommando som tekst → CRM-opgave', ok.handled === 'voice_command_ok' && tasks === 1, `${ok.handled} tasks=${tasks}`)
      check('svaret viser transskriptionen', last.startsWith(`🎙️ «${heard}»`), last.slice(0, 80))
      const { data: au } = await admin.from('audit_logs').select('action, metadata').eq('action', 'assistant_voice_transcribed').gte('created_at', new Date(stamp - 5_000).toISOString())
      const meta = JSON.stringify(au ?? [])
      check('audit: voice_transcribed uden transskriptionstekst', (au ?? []).length === 1 && !meta.includes('VCkunde'), meta.slice(0, 120))
    } finally {
      if (prevFlag === undefined) delete process.env.ASSISTANT_VOICE_ENABLED; else process.env.ASSISTANT_VOICE_ENABLED = prevFlag
      setTelegramTransport(null)
      setVoiceAdapters({ fetcher: null, transcriber: null })
      await admin.from('assistant_links').delete().eq('profile_id', adminP.id)
      if (prevLinks.length) await admin.from('assistant_links').insert(prevLinks)
      await admin.from('customer_tasks').delete().eq('customer_id', custId)
      await admin.from('customers').delete().eq('id', custId)
      await admin.from('audit_logs').delete().gte('created_at', new Date(stamp - 5_000).toISOString()).like('action', 'assistant_%')
    }
    log(fails ? `❌ ${fails} fejl` : '✅ talebeskeder (T11) bestået (intet live)')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'notes-reminders-rls') {
    // STAGING (00196/00197): RLS/rolle/CRUD med rigtige persona-sessioner — kundenoter (skriv: admin/serviceleder/salg
    // som sig selv; ret/slet: admin/serviceleder eller egen), case_notes.source, personal_reminders kun ejeren.
    const { loginPersonas } = await import('./role-matrix')
    const personas = new Map(Array.from(await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })))
    const uid = async (cl: import('@supabase/supabase-js').SupabaseClient) => (await cl.auth.getUser()).data.user!.id
    const ids = new Map<string, string>()
    for (const [r, cl] of personas) ids.set(r, await uid(cl))
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const { data: cu } = await admin.from('customers').insert({ customer_number: `NR-${stamp}`, company_name: `[HARNESS] noter ${stamp}`, contact_person: 'x', email: `nr-${stamp}@harness.test`, notes: 'ORIGINAL', created_by: ids.get('admin') }).select('id').single()
    const custId = (cu as { id: string }).id
    const { data: sc } = await admin.from('service_cases').select('id').limit(1).single()
    const caseId = (sc as { id: string }).id
    const noteIds: string[] = []
    try {
      // customer_notes
      const WRITE = ['admin', 'serviceleder', 'salg']
      for (const [role, cl] of personas) {
        const ins = await cl.from('customer_notes').insert({ customer_id: custId, content: `${role} note ${stamp}`, source: 'manual', created_by: ids.get(role) }).select('id').single()
        if (ins.data) noteIds.push((ins.data as { id: string }).id)
        check(`${role} ${WRITE.includes(role) ? 'kan' : 'kan IKKE'} skrive kundenote`, WRITE.includes(role) ? !ins.error : !!ins.error, ins.error?.code ?? 'ok')
        const forged = await cl.from('customer_notes').insert({ customer_id: custId, content: 'forfalsket', created_by: ids.get(role === 'admin' ? 'salg' : 'admin') })
        check(`${role} kan ikke skrive note i andres navn`, !!forged.error, forged.error?.code ?? 'INDSAT')
        const sel = await cl.from('customer_notes').select('id').eq('customer_id', custId)
        check(`${role} kan læse kundens noter`, !sel.error && (sel.data ?? []).length >= 1)
      }
      const salgNote = (await admin.from('customer_notes').select('id').eq('customer_id', custId).eq('created_by', ids.get('salg')!).single()).data as { id: string }
      const adminNote = (await admin.from('customer_notes').select('id').eq('customer_id', custId).eq('created_by', ids.get('admin')!).single()).data as { id: string }
      const s1 = await personas.get('salg')!.from('customer_notes').update({ content: 'ændret af salg' }).eq('id', adminNote.id).select('id')
      check('salg kan ikke rette admins note', (s1.data ?? []).length === 0, s1.error?.code ?? `${(s1.data ?? []).length}`)
      const s2 = await personas.get('salg')!.from('customer_notes').update({ content: 'egen rettet' }).eq('id', salgNote.id).select('id')
      check('salg kan rette egen note', (s2.data ?? []).length === 1)
      const s3 = await personas.get('serviceleder')!.from('customer_notes').delete().eq('id', salgNote.id).select('id')
      check('serviceleder kan slette andres note', (s3.data ?? []).length === 1)
      const m1 = await personas.get('montør')!.from('customer_notes').delete().eq('id', adminNote.id).select('id')
      check('montør kan ikke slette andres note', (m1.data ?? []).length === 0)
      const bad = await personas.get('admin')!.from('customer_notes').insert({ customer_id: custId, content: 'x', source: 'hacker', created_by: ids.get('admin') })
      check('ugyldig source afvises (CHECK)', !!bad.error && bad.error.code === '23514', bad.error?.code ?? 'INDSAT')
      const { data: cust } = await admin.from('customers').select('notes').eq('id', custId).single()
      check('customers.notes urørt', (cust as { notes: string }).notes === 'ORIGINAL')
      // case_notes.source
      const cn = await personas.get('admin')!.from('case_notes').insert({ case_id: caseId, content: `assistent-note ${stamp}`, kind: 'note', source: 'telegram', created_by: ids.get('admin') }).select('id, source').single()
      check('case_notes: note med source=telegram', !cn.error && (cn.data as { source: string }).source === 'telegram', cn.error?.message ?? '')
      if (cn.data) await admin.from('case_notes').delete().eq('id', (cn.data as { id: string }).id)
      const { data: old } = await admin.from('case_notes').select('source').neq('source', 'manual').limit(1)
      check('eksisterende case_notes fik source = manual (default)', (old ?? []).length === 0, String((old ?? []).length))
      // personal_reminders: ejer-isolation
      const remIds = new Map<string, string>()
      for (const [role, cl] of personas) {
        const ins = await cl.from('personal_reminders').insert({ owner_id: ids.get(role), title: `${role} husk ${stamp}`, due_at: new Date(Date.now() + 86_400_000).toISOString(), source: 'manual' }).select('id').single()
        check(`${role} opretter egen påmindelse`, !ins.error, ins.error?.code ?? '')
        if (ins.data) remIds.set(role, (ins.data as { id: string }).id)
        const forged = await cl.from('personal_reminders').insert({ owner_id: ids.get(role === 'admin' ? 'salg' : 'admin'), title: 'x', due_at: new Date().toISOString() })
        check(`${role} kan ikke oprette påmindelse til andre`, !!forged.error, forged.error?.code ?? 'INDSAT')
      }
      for (const [role, cl] of personas) {
        const { data } = await cl.from('personal_reminders').select('id, owner_id').like('title', `%husk ${stamp}`)
        const rows = (data ?? []) as Array<{ owner_id: string }>
        check(`${role} ser KUN egne påmindelser (heller ikke admin ser andres)`, rows.length === 1 && rows[0].owner_id === ids.get(role), `${rows.length}`)
        const other = role === 'admin' ? 'salg' : 'admin'
        const up = await cl.from('personal_reminders').update({ title: 'kapret' }).eq('id', remIds.get(other)!).select('id')
        check(`${role} kan ikke rette ${other}s påmindelse`, (up.data ?? []).length === 0)
        const del = await cl.from('personal_reminders').delete().eq('id', remIds.get(other)!).select('id')
        check(`${role} kan ikke slette ${other}s påmindelse`, (del.data ?? []).length === 0)
      }
      const own = await personas.get('montør')!.from('personal_reminders').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', remIds.get('montør')!).select('status').single()
      check('ejer markerer egen udført', (own.data as { status: string } | null)?.status === 'done')
      const anon = await import('@supabase/supabase-js').then(({ createClient }) => createClient(runtime.url, runtime.anonKey))
      const an = await anon.from('personal_reminders').select('id').limit(1)
      const an2 = await anon.from('customer_notes').select('id').limit(1)
      check('anon kan ikke læse påmindelser/kundenoter', (!!an.error || (an.data ?? []).length === 0) && (!!an2.error || (an2.data ?? []).length === 0))
      await admin.from('personal_reminders').delete().like('title', `%husk ${stamp}`)
    } finally {
      await admin.from('customers').delete().eq('id', custId)
      await admin.from('personal_reminders').delete().like('title', `%${stamp}%`)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ noter/påmindelser RLS bestået')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'telegram-check') {
    // STAGING (T10/T3/T9): Telegram-integrationen ende-til-ende UDEN live bot — webhook-ruten (flag + hemmelighed),
    // kobling via engangskode, kommandoer, knapper, rolle-/ejer-tjek, påmindelse med knapper, audit. Udgående beskeder
    // fanges af en test-transport (intet sendes).
    const { setTelegramTransport } = await import('../../src/lib/assistant/telegram/transport')
    const { handleTelegramUpdate } = await import('../../src/lib/assistant/telegram/handle-update')
    const { createLinkCode } = await import('../../src/lib/assistant/telegram/link')
    const { dispatchAssistantReminders } = await import('../../src/lib/assistant/reminders')
    const { telegramReminderSender } = await import('../../src/lib/assistant/telegram/reminder-sender')
    const stamp = Date.now()
    const sent: Array<{ chatId: number; text: string; buttons?: Array<{ action: string; ref: string }> }> = []
    setTelegramTransport(async (m) => { sent.push(m); return { delivered: true } })
    const last = () => sent[sent.length - 1]
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const profs = ((await admin.from('profiles').select('id, role').eq('is_active', true)).data ?? []) as Array<{ id: string; role: string }>
    const adminP = profs.find((p) => p.role === 'admin')!
    const montorP = profs.find((p) => p.role === 'montør')!
    const chatA = 900_000_000 + (stamp % 1_000_000)
    const chatM = chatA + 1
    const chatX = chatA + 2
    const msg = (chatId: number, text: string, type = 'private') => ({ message: { chat: { id: chatId, type }, text } })
    const btn = (chatId: number, data: string) => ({ callback_query: { id: 'x', data, message: { chat: { id: chatId } } } })
    const { data: cu } = await admin.from('customers').insert({ customer_number: `TG-${stamp}`, company_name: `TGkunde${stamp} ApS`, contact_person: 'Tina', email: `tg-${stamp}@harness.test`, mobile: '+45 20 30 40 50', created_by: adminP.id }).select('id').single()
    const custId = (cu as { id: string }).id
    const prevLinks = ((await admin.from('assistant_links').select('*').in('profile_id', [adminP.id, montorP.id])).data ?? []) as Array<Record<string, unknown>>
    const ENV = { e: process.env.ASSISTANT_TELEGRAM_ENABLED, s: process.env.TELEGRAM_WEBHOOK_SECRET }
    try {
      // 1. webhook-ruten: flag + hemmelighed
      const { POST } = await import('../../src/app/api/assistant/telegram/route')
      const call = (secret: string | null) => POST(new Request('http://localhost/api/assistant/telegram', { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) }, body: JSON.stringify(msg(chatX, 'hej')) }))
      delete process.env.ASSISTANT_TELEGRAM_ENABLED
      process.env.TELEGRAM_WEBHOOK_SECRET = `harness-secret-${stamp}`
      check('webhook slået fra uden flag → 404', (await call(process.env.TELEGRAM_WEBHOOK_SECRET)).status === 404)
      process.env.ASSISTANT_TELEGRAM_ENABLED = 'true'
      check('forkert hemmelighed → 401', (await call('forkert-hemmelighed-xxxxxxxx')).status === 401)
      check('manglende hemmelighed → 401', (await call(null)).status === 401)
      delete process.env.TELEGRAM_WEBHOOK_SECRET
      check('server uden hemmelighed konfigureret → 401 (fail-closed)', (await call('noget-som-helst-langt-nok')).status === 401)
      process.env.TELEGRAM_WEBHOOK_SECRET = `harness-secret-${stamp}`
      const ok = await call(process.env.TELEGRAM_WEBHOOK_SECRET)
      check('rigtig hemmelighed → 200, ukendt chat får "ikke forbundet"', ok.status === 200 && /ikke forbundet/.test(last()?.text ?? ''), last()?.text)

      // 2. kobling
      await admin.from('assistant_links').delete().in('profile_id', [adminP.id, montorP.id])
      const { code } = await createLinkCode(admin, adminP.id)
      await handleTelegramUpdate(admin, msg(chatA, `/start ${code}`))
      check('/start <kode> forbinder chatten til CRM-brugeren', /forbundet/.test(last()?.text ?? ''), last()?.text)
      await handleTelegramUpdate(admin, msg(chatX, `/start ${code}`))
      check('samme kode kan ikke bruges igen', /Ugyldig kode/.test(last()?.text ?? ''), last()?.text)
      const { code: c2 } = await createLinkCode(admin, montorP.id, new Date(Date.now() - 20 * 60_000))
      await handleTelegramUpdate(admin, msg(chatM, `/start ${c2}`))
      check('udløbet kode afvises', /udløbet/.test(last()?.text ?? ''), last()?.text)
      const { code: c3 } = await createLinkCode(admin, montorP.id)
      await handleTelegramUpdate(admin, msg(chatA, `/start ${c3}`))
      check('en chat kan ikke forbindes til to brugere', /allerede forbundet/.test(last()?.text ?? ''), last()?.text)
      await handleTelegramUpdate(admin, msg(chatM, `/start ${c3}`))
      check('montør kan forbinde (rolle tjekkes pr. handling)', /forbundet/.test(last()?.text ?? ''), last()?.text)
      await handleTelegramUpdate(admin, msg(chatA, 'Ring til Hansen i morgen kl. 10', 'group'))
      check('gruppechat afvises', /private chats/.test(last()?.text ?? ''), last()?.text)

      // 3. kommandoer + knapper
      await handleTelegramUpdate(admin, msg(chatA, `Ring til TGkunde${stamp} ApS i morgen kl. 10`))
      const reply = last()
      const { data: tk } = await admin.from('customer_tasks').select('id, status, reminder_at, assigned_to').eq('customer_id', custId).eq('auto_rule', 'assistant_callback').maybeSingle()
      const task = tk as { id: string; status: string; reminder_at: string; assigned_to: string } | null
      check('kommando fra Telegram → CRM-opgave tildelt brugeren', !!task && task.assigned_to === adminP.id && /📞/.test(reply?.text ?? ''), reply?.text)
      await handleTelegramUpdate(admin, msg(chatM, `Find TGkunde${stamp} ApS`))
      check('montør afvises pr. handling (fase 1)', /kontor-roller/.test(last()?.text ?? ''), last()?.text)
      await handleTelegramUpdate(admin, btn(chatM, `done:${task?.id}`))
      check('montør kan ikke trykke Udført på andres opgave', /kontor-roller|ikke din/.test(last()?.text ?? ''), last()?.text)
      await handleTelegramUpdate(admin, btn(chatA, `call_now:${custId}`))
      check('Ring nu → kundens nummer fra CRM', /20 30 40 50/.test(last()?.text ?? ''), last()?.text)
      const t0 = Date.now()
      await handleTelegramUpdate(admin, btn(chatA, `snooze:${task?.id}`))
      const { data: sn } = await admin.from('customer_tasks').select('reminder_at').eq('id', task?.id ?? '').single()
      check('Udsæt → påmindelsen flyttes 60 min i CRM', Math.abs(new Date((sn as { reminder_at: string }).reminder_at).getTime() - (t0 + 3_600_000)) < 60_000, last()?.text)

      // 4. påmindelse som Telegram-besked med 4 knapper (tidspunkt fra CRM)
      await admin.from('customer_tasks').update({ reminder_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', task?.id ?? '')
      sent.length = 0
      await dispatchAssistantReminders(admin, async (r) => (r.taskId === task?.id ? telegramReminderSender(admin)(r) : { delivered: false, channel: 'test' }))
      const rm = sent.find((m) => m.chatId === chatA)
      check('påmindelse sendt til brugerens chat med Ring nu · Åbn kunde · Udsæt · Udført', !!rm && JSON.stringify((rm.buttons ?? []).map((b) => b.action)) === JSON.stringify(['call_now', 'open_customer', 'snooze', 'done']), rm?.text)
      await handleTelegramUpdate(admin, btn(chatA, `done:${task?.id}`))
      const { data: dn } = await admin.from('customer_tasks').select('status').eq('id', task?.id ?? '').single()
      check('Udført → opgaven lukket i CRM', (dn as { status: string }).status === 'done', last()?.text)
      sent.length = 0
      await dispatchAssistantReminders(admin, async (r) => (r.taskId === task?.id ? telegramReminderSender(admin)(r) : { delivered: false, channel: 'test' }))
      check('udført opgave påmindes ikke igen', !sent.some((m) => m.chatId === chatA))

      // 5. audit
      const { data: au } = await admin.from('audit_logs').select('action').eq('entity_type', 'assistant').gte('created_at', new Date(stamp - 5_000).toISOString())
      const acts = new Set(((au ?? []) as Array<{ action: string }>).map((a) => a.action))
      const want = ['assistant_linked', 'assistant_link_failed', 'assistant_unlinked_message', 'assistant_command_received', 'assistant_callback_created', 'assistant_denied', 'assistant_button_denied', 'assistant_call_now', 'assistant_task_snoozed', 'assistant_task_done']
      const missing = want.filter((w) => !acts.has(w))
      check('alle kommandoer/handlinger audit-logget', missing.length === 0, missing.length ? `mangler ${missing.join(', ')}` : `${want.length} typer`)
    } finally {
      setTelegramTransport(null)
      if (ENV.e === undefined) delete process.env.ASSISTANT_TELEGRAM_ENABLED; else process.env.ASSISTANT_TELEGRAM_ENABLED = ENV.e
      if (ENV.s === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = ENV.s
      await admin.from('assistant_links').delete().in('profile_id', [adminP.id, montorP.id])
      if (prevLinks.length) await admin.from('assistant_links').insert(prevLinks)
      const { data: tl } = await admin.from('customer_tasks').select('id').eq('customer_id', custId)
      const tids = ((tl ?? []) as Array<{ id: string }>).map((x) => x.id)
      if (tids.length) await admin.from('audit_logs').delete().in('entity_id', tids)
      await admin.from('customers').delete().eq('id', custId)
      await admin.from('audit_logs').delete().eq('entity_type', 'assistant').gte('created_at', new Date(stamp - 5_000).toISOString())
    }
    log(fails ? `❌ ${fails} fejl` : '✅ telegram-integration bestået (intet live sendt)')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'assistant-reminder-check') {
    // STAGING (T3/T4): påmindelser læses fra CRM (reminder_at), sendes én gang pr. tidspunkt, sendes igen når
    // tidspunktet ændres i CRM, ikke når opgaven er udført. Test-afsender (intet live).
    const { dispatchAssistantReminders } = await import('../../src/lib/assistant/reminders')
    const stamp = Date.now()
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }> | null)?.[0]?.id
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const { data: cu, error: cuErr } = await admin.from('customers').insert({ customer_number: `RM-${stamp}`, company_name: `[HARNESS] reminder ${stamp}`, contact_person: 'x', email: `rm-${stamp}@harness.test`, created_by: owner }).select('id').single()
    if (cuErr) throw new Error(cuErr.message)
    const custId = (cu as { id: string }).id
    const sent: string[] = []
    const sender = async (r: { taskId: string; title: string }) => { if (r.title.includes(String(stamp))) sent.push(r.taskId); return { delivered: true, channel: 'test' } }
    // kun egne opgaver tælles (andre testdata på staging kan også være forfaldne) — test-afsenderen leverer dem ikke-markeret
    const mineOnly = async (r: { taskId: string; title: string }) => r.title.includes(String(stamp)) ? sender(r) : { delivered: false, channel: 'test' }
    const taskIds: string[] = []
    try {
      const now = new Date()
      const mk = async (title: string, reminderAt: Date, status = 'pending') => {
        const { data, error } = await admin.from('customer_tasks').insert({ customer_id: custId, title: `${title} ${stamp}`, status, priority: 'normal', assigned_to: owner, created_by: owner, due_date: new Date(reminderAt.getTime() + 15 * 60_000).toISOString(), reminder_at: reminderAt.toISOString(), auto_rule: 'assistant_callback' }).select('id').single()
        if (error) throw new Error(error.message)
        taskIds.push((data as { id: string }).id)
        return (data as { id: string }).id
      }
      const due = await mk('Ring til forfalden', new Date(now.getTime() - 2 * 60_000))
      const future = await mk('Ring til fremtid', new Date(now.getTime() + 30 * 60_000))
      const done = await mk('Ring til udført', new Date(now.getTime() - 2 * 60_000), 'done')
      const old = await mk('Ring til gammel', new Date(now.getTime() - 3 * 3_600_000))
      const run1 = await dispatchAssistantReminders(admin, mineOnly, now)
      check('forfalden påmindelse sendes', sent.includes(due), JSON.stringify(run1))
      check('fremtidig/udført/for gammel sendes ikke', !sent.includes(future) && !sent.includes(done) && !sent.includes(old))
      sent.length = 0
      await dispatchAssistantReminders(admin, mineOnly, now)
      check('samme tidspunkt sendes ikke igen', !sent.includes(due))
      // T4: tidspunktet flyttes i CRM → ny påmindelse til det nye tidspunkt
      const moved = new Date(now.getTime() - 60_000)
      await admin.from('customer_tasks').update({ reminder_at: moved.toISOString() }).eq('id', due)
      sent.length = 0
      await dispatchAssistantReminders(admin, mineOnly, now)
      check('ændret tidspunkt i CRM → påmindes igen', sent.includes(due))
      // flyttes ud i fremtiden → intet før tiden
      await admin.from('customer_tasks').update({ reminder_at: new Date(now.getTime() + 3_600_000).toISOString() }).eq('id', due)
      sent.length = 0
      await dispatchAssistantReminders(admin, mineOnly, now)
      check('flyttet til senere i CRM → ingen påmindelse nu', !sent.includes(due))
      const { data: au } = await admin.from('audit_logs').select('id').eq('action', 'assistant_reminder_sent').eq('entity_id', due)
      check('hver afsendelse audit-logget (2 tidspunkter = 2 rækker)', (au ?? []).length === 2, String((au ?? []).length))
    } finally {
      if (taskIds.length) await admin.from('audit_logs').delete().in('entity_id', taskIds)
      await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ assistant-påmindelser bestået')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'assistant-run-check') {
    // STAGING (T1/T7/T8/T9): kommando → CRM-opgave med påmindelse, audit, tvetydighed, opslag, rolle-afvisning
    const { runAssistantCommand, CALLBACK_REMINDER_LEAD_MIN } = await import('../../src/lib/assistant/run-command')
    const stamp = Date.now()
    const profs = ((await admin.from('profiles').select('id, role').eq('is_active', true)).data ?? []) as Array<{ id: string; role: string }>
    const adminP = profs.find((p) => p.role === 'admin')
    const montorP = profs.find((p) => p.role === 'montør')
    if (!adminP || !montorP) throw new Error('mangler admin/montør-profil på staging')
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const u = `R${stamp}`
    const ids: string[] = []
    const mk = async (company: string) => {
      const { data, error } = await admin.from('customers').insert({ customer_number: `AR-${stamp}-${ids.length}`, company_name: company, contact_person: 'x', email: `ar-${stamp}-${ids.length}@harness.test`, created_by: adminP.id }).select('id').single()
      if (error) throw new Error(error.message)
      ids.push((data as { id: string }).id)
      return (data as { id: string }).id
    }
    const actor = { profileId: adminP.id, role: 'admin' as const, isActive: true, channel: 'test' as const }
    const taskIds: string[] = []
    try {
      const c1 = await mk(`Assist${u} El`)
      await mk(`Assist${u} VVS`)
      const NOW = new Date('2026-10-06T12:30:00Z') // tirsdag 14:30 dansk tid
      const r1 = await runAssistantCommand(admin, actor, `Ring til Assist${u} El i morgen kl. 10`, NOW)
      if (r1.taskId) taskIds.push(r1.taskId)
      const { data: t } = await admin.from('customer_tasks').select('customer_id, title, due_date, reminder_at, assigned_to, auto_rule, status').eq('id', r1.taskId ?? '').maybeSingle()
      const tk = t as { customer_id: string; title: string; due_date: string; reminder_at: string; assigned_to: string; auto_rule: string; status: string } | null
      check('"Ring til X i morgen kl. 10" → CRM-opgave på rette kunde', r1.ok && tk?.customer_id === c1 && tk?.auto_rule === 'assistant_callback' && tk?.assigned_to === adminP.id, `${r1.text} | ${JSON.stringify(tk)}`)
      check(`  tidspunkt 7/10 10:00 dansk, påmindelse ${CALLBACK_REMINDER_LEAD_MIN} min før`, new Date(tk?.due_date ?? 0).toISOString() === '2026-10-07T08:00:00.000Z' && new Date(tk?.reminder_at ?? 0).toISOString() === '2026-10-07T07:45:00.000Z', `${tk?.due_date} / ${tk?.reminder_at}`)
      const { data: au } = await admin.from('audit_logs').select('action, user_id').eq('entity_id', r1.taskId ?? '')
      check('  audit assistant_callback_created', (au ?? []).some((a: { action: string; user_id: string }) => a.action === 'assistant_callback_created' && a.user_id === adminP.id))
      const r2 = await runAssistantCommand(admin, actor, `Ring til Assist${u} i morgen kl. 10`, NOW)
      check('tvetydigt navn → kandidater med kundenr., ingen opgave', !r2.ok && (r2.text.match(/^• /gm) ?? []).length === 2 && /AR-/.test(r2.text) && !r2.taskId, r2.text.replace(/\n/g, ' | '))
      const r3 = await runAssistantCommand(admin, actor, `Mind mig om at sende tilbud til Assist${u} El fredag kl 8`, NOW)
      // 00197: "mind mig om …" uden kunde-mål → personlig påmindelse (ikke en kundeopgave)
      const { data: pr3 } = await admin.from('personal_reminders').select('id, owner_id').eq('id', r3.taskId ?? '').maybeSingle()
      check('"mind mig om …" uden kunde-mål → personlig påmindelse (ingen kundeopgave)', r3.ok && (pr3 as { owner_id?: string } | null)?.owner_id === adminP.id, r3.text)
      if (r3.taskId) await admin.from('personal_reminders').delete().eq('id', r3.taskId)
      const r7 = await runAssistantCommand(admin, actor, `Besigtigelse hos Assist${u} El d. 14/10 kl 9`, NOW)
      if (r7.taskId) taskIds.push(r7.taskId)
      const { data: ap } = await admin.from('customer_tasks').select('title, due_date, reminder_at, auto_rule').eq('id', r7.taskId ?? '').maybeSingle()
      const apt = ap as { title: string; due_date: string; reminder_at: string; auto_rule: string } | null
      check('"Besigtigelse hos X d. 14/10 kl 9" → CRM-aftale, påmindelse 1 t før, ingen kundemail', r7.ok && apt?.auto_rule === 'assistant_appointment' && /^Besigtigelse: /.test(apt?.title ?? '') && new Date(apt?.due_date ?? 0).toISOString() === '2026-10-14T07:00:00.000Z' && new Date(apt?.reminder_at ?? 0).toISOString() === '2026-10-14T06:00:00.000Z' && /ikke sendt/.test(r7.text), `${r7.text} | ${JSON.stringify(apt)}`)
      const r4 = await runAssistantCommand(admin, actor, `Find Assist${u} El`, NOW)
      check('opslag på kunde → åbne opgaver/sager', r4.ok && /Åbne opgaver: 2/.test(r4.text), r4.text.replace(/\n/g, ' | '))
      const r5 = await runAssistantCommand(admin, { ...actor, profileId: montorP.id, role: 'montør' }, `Find Assist${u} El`, NOW)
      check('montør afvises i fase 1 (scope kan ikke håndhæves med admin-klient)', !r5.ok, r5.text)
      const r6 = await runAssistantCommand(admin, { ...actor, isActive: false }, `Find Assist${u} El`, NOW)
      check('deaktiveret bruger afvises', !r6.ok, r6.text)
      // T4-princip: tidspunktet ændres i CRM → påmindelsen læses fra CRM (ingen kopi)
      await admin.from('customer_tasks').update({ reminder_at: '2026-10-07T09:00:00Z' }).eq('id', r1.taskId ?? '')
      const { data: moved } = await admin.from('customer_tasks').select('reminder_at').eq('id', r1.taskId ?? '').single()
      check('ændret tidspunkt i CRM er det eneste tidspunkt (ingen kopi i assistent-laget)', new Date((moved as { reminder_at: string }).reminder_at).toISOString() === '2026-10-07T09:00:00.000Z')
    } finally {
      if (ids.length) {
        const { data: tl } = await admin.from('customer_tasks').select('id').in('customer_id', ids)
        const all = [...taskIds, ...((tl ?? []) as Array<{ id: string }>).map((x) => x.id)]
        if (all.length) await admin.from('audit_logs').delete().in('entity_id', all)
        await admin.from('audit_logs').delete().in('entity_id', ids)
        await admin.from('customers').delete().in('id', ids)
      }
      await admin.from('audit_logs').delete().eq('entity_type', 'assistant').like('entity_name', `%${u}%`)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ assistant-kommandoer bestået')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'assistant-resolve-check') {
    // STAGING (T1): ELTA Assistant finder præcis én kunde/sag — tvetydigt → kandidater, aldrig gæt. Rigtig admin-session.
    const { resolveTarget } = await import('../../src/lib/assistant/resolve-target')
    const { loginPersonas } = await import('./role-matrix')
    const personas = new Map(Array.from(await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })))
    const cl = personas.get('admin')
    if (!cl) throw new Error('admin-persona mangler')
    const stamp = Date.now()
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').limit(1)).data as Array<{ id: string }> | null)?.[0]?.id
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const ids: string[] = []
    const mk = async (company: string, contact: string) => {
      const { data, error } = await admin.from('customers').insert({ customer_number: `AS-${stamp}-${ids.length}`, company_name: company, contact_person: contact, email: `as-${stamp}-${ids.length}@harness.test`, created_by: owner }).select('id').single()
      if (error) throw new Error(error.message)
      ids.push((data as { id: string }).id)
      return (data as { id: string }).id
    }
    let caseId: string | null = null
    try {
      const u = `Q${stamp}`
      const a = await mk(`Hansen${u} El ApS`, `Jens Hansen${u}`)
      await mk(`Hansen${u} VVS`, `Ole Hansen${u}`)
      const r1 = await resolveTarget(cl, `Hansen${u}`)
      check('"Hansen" med 2 kunder → tvetydigt (kandidater, intet gæt)', r1.status === 'ambiguous' && r1.candidates.length === 2, JSON.stringify(r1).slice(0, 160))
      const r2 = await resolveTarget(cl, `Hansen${u} El ApS`)
      check('præcist firmanavn → entydig kunde', r2.status === 'resolved' && r2.target.id === a, JSON.stringify(r2).slice(0, 160))
      const r3 = await resolveTarget(cl, `Jens Hansen${u}`)
      check('præcis kontaktperson → entydig kunde', r3.status === 'resolved' && r3.target.id === a)
      const r4 = await resolveTarget(cl, `Findesikke${u}`)
      check('ukendt → ingen', r4.status === 'none')
      const r5 = await resolveTarget(cl, `hansen${u}, el`)
      check('komma i søgning bryder ikke filteret', r5.status !== undefined)
      const { data: sc } = await admin.from('service_cases').select('id, case_number, customer_id').limit(1).maybeSingle()
      if (sc) {
        caseId = (sc as { id: string }).id
        const r6 = await resolveTarget(cl, String((sc as { case_number: string }).case_number).toLowerCase())
        check('sagsnummer (små bogstaver) → entydig sag', r6.status === 'resolved' && r6.target.kind === 'case' && r6.target.id === caseId, JSON.stringify(r6).slice(0, 160))
      } else check('staging har mindst én sag', false)
    } finally {
      if (ids.length) await admin.from('customers').delete().in('id', ids)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ assistant-opslag bestået')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'pending-invites') {
    // Staging (read-only): afventende invitationer som Brugerstyring nu viser dem (auth: invited_at uden første login) — kun antal
    const all: Array<{ invited_at?: string | null; last_sign_in_at?: string | null; email?: string }> = []
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw new Error(error.message)
      all.push(...(data?.users ?? []))
      if ((data?.users ?? []).length < 200) break
    }
    log(JSON.stringify({ auth_users: all.length, invited: all.filter((u) => !!u.invited_at).length, pending: all.filter((u) => !!u.invited_at && !u.last_sign_in_at && !!u.email).length }))
    return
  }
  if (SUB === 'autolink-scenario') {
    // K5 (staging): autoLinkEmail() mod rigtige rækker — præcis/kontakt/samtale kobles, domæne/tvetydigt kun forslag,
    // eksisterende kobling overskrives aldrig, FormSubmit/eget domæne matches ikke, audit for hver kobling. Rydder op.
    const { autoLinkEmail } = await import('../../src/lib/services/email-autolink')
    const stamp = Date.now()
    const owner = ((await admin.from('profiles').select('id').limit(1)).data as Array<{ id: string }> | null)?.[0]?.id
    const dom = (k: string) => `k5${k}${stamp}.dk`
    const custIds: string[] = []
    const mailIds: string[] = []
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const mkCust = async (key: string, email: string) => {
      const { data, error } = await admin.from('customers').insert([{ customer_number: `K5-${stamp}-${key}`, company_name: `[HARNESS] K5 ${key}`, contact_person: 'x', email, created_by: owner }]).select('id')
      if (error) throw new Error(error.message)
      const id = (data as Array<{ id: string }>)[0].id
      custIds.push(id)
      return id
    }
    const mkMail = async (sender: string, subject: string, extra: Record<string, unknown> = {}) => {
      const { data, error } = await admin.from('incoming_emails').insert([{ sender_email: sender, subject, body_text: (extra.body_text as string) ?? 'Hej', received_at: new Date().toISOString(), is_archived: false, link_status: 'pending', customer_id: null, ...extra }]).select('id')
      if (error) throw new Error(error.message)
      const id = (data as Array<{ id: string }>)[0].id
      mailIds.push(id)
      return id
    }
    const row = async (id: string) => (await admin.from('incoming_emails').select('link_status, customer_id, customer_contact_id, linked_by, is_forwarded').eq('id', id).single()).data as { link_status: string; customer_id: string | null; customer_contact_id: string | null; linked_by: string | null; is_forwarded: boolean | null }
    const audits = async (id: string) => ((await admin.from('audit_logs').select('action, metadata').eq('entity_id', id)).data ?? []) as Array<{ action: string; metadata: Record<string, unknown> }>
    const run = async (id: string, sender: string, subject: string, body: string | null = null) => autoLinkEmail(id, sender, null, subject, null, body)
    try {
      const A = await mkCust('A', `kunde@${dom('a')}`)
      const B = await mkCust('B', `info@${dom('b')}`)
      const { data: ct, error: ctErr } = await admin.from('customer_contacts').insert([{ customer_id: B, name: 'Kontakt B', email: `kontakt@${dom('b')}` }]).select('id')
      if (ctErr) throw new Error(ctErr.message)
      const contactB = (ct as Array<{ id: string }>)[0].id
      const C = await mkCust('C', `info@${dom('c')}`)
      const D = await mkCust('D', `dublet@${dom('d')}`)
      const E = await mkCust('E', `dublet@${dom('d')}`)
      await mkCust('F', `henvendelse${stamp}@formsubmit.co`)

      // 1. præcis kunde-e-mail
      const m1 = await mkMail(`Kunde@${dom('a')}`, 'K5 præcis')
      await run(m1, `Kunde@${dom('a')}`, 'K5 præcis')
      const r1 = await row(m1); const a1 = await audits(m1)
      check('præcis e-mail → koblet til A', r1.link_status === 'linked' && r1.customer_id === A && r1.linked_by === 'auto', JSON.stringify(r1))
      check('  audit email_auto_linked (email)', a1.length === 1 && a1[0].action === 'email_auto_linked' && a1[0].metadata?.matched_on === 'email', JSON.stringify(a1))

      // 2. kontakt-e-mail
      const m2 = await mkMail(`kontakt@${dom('b')}`, 'K5 kontakt')
      await run(m2, `kontakt@${dom('b')}`, 'K5 kontakt')
      const r2 = await row(m2)
      check('kontakt-e-mail → koblet til B med kontakt', r2.customer_id === B && r2.customer_contact_id === contactB, JSON.stringify(r2))

      // 3. kun domæne → forslag
      const m3 = await mkMail(`anden@${dom('c')}`, 'K5 domæne')
      await run(m3, `anden@${dom('c')}`, 'K5 domæne')
      const r3 = await row(m3); const a3 = await audits(m3)
      check('kun domæne → IKKE koblet', r3.customer_id === null && r3.link_status === 'unidentified' && r3.linked_by === null, JSON.stringify(r3))
      check('  audit email_link_suggested med C', a3.length === 1 && a3[0].action === 'email_link_suggested' && JSON.stringify(a3[0].metadata?.candidate_customer_ids) === JSON.stringify([C]), JSON.stringify(a3))

      // 4. tvetydig e-mail (2 kunder)
      const m4 = await mkMail(`dublet@${dom('d')}`, 'K5 tvetydig')
      await run(m4, `dublet@${dom('d')}`, 'K5 tvetydig')
      const r4 = await row(m4); const a4 = await audits(m4)
      const cands = ((a4[0]?.metadata?.candidate_customer_ids as string[] | undefined) ?? []).slice().sort()
      check('tvetydig → ALDRIG koblet', r4.customer_id === null, JSON.stringify(r4))
      check('  forslag med begge kandidater', a4[0]?.metadata?.matched_on === 'ambiguous' && JSON.stringify(cands) === JSON.stringify([D, E].sort()), JSON.stringify(a4))

      // 5. samtale: tidligere mail manuelt koblet til A → svar fra gratis-mail kobles via tråden
      const conv = `k5-conv-${stamp}`
      await mkMail(`kunde@${dom('a')}`, 'K5 tråd 1', { conversation_id: conv, customer_id: A, link_status: 'linked', linked_by: 'manual' })
      const m5 = await mkMail(`privat${stamp}@gmail.com`, 'SV: K5 tråd 1', { conversation_id: conv })
      await run(m5, `privat${stamp}@gmail.com`, 'SV: K5 tråd 1')
      const r5 = await row(m5); const a5 = await audits(m5)
      check('samme samtale → koblet til A', r5.customer_id === A && a5[0]?.metadata?.matched_on === 'thread', JSON.stringify({ r5, a5 }))

      // 6. allerede manuelt koblet til E → overskrives ikke (selv om afsender præcist matcher A)
      const m6 = await mkMail(`kunde@${dom('a')}`, 'K5 manuel', { customer_id: E, link_status: 'linked', linked_by: 'manual' })
      const res6 = await run(m6, `kunde@${dom('a')}`, 'K5 manuel')
      const r6 = await row(m6); const a6 = await audits(m6)
      check('manuel kobling bevares (E, manual)', r6.customer_id === E && r6.linked_by === 'manual' && res6.customerId === E, JSON.stringify(r6))
      check('  ingen audit ved urørt mail', a6.length === 0)

      // 7. FormSubmit-relæ matches aldrig på afsender
      const m7 = await mkMail(`henvendelse${stamp}@formsubmit.co`, 'Ny henvendelse')
      await run(m7, `henvendelse${stamp}@formsubmit.co`, 'Ny henvendelse')
      const r7 = await row(m7)
      check('FormSubmit-afsender → ikke koblet', r7.customer_id === null, JSON.stringify(r7))

      // 8. videresendt fra eget domæne → oprindelig afsender (A) kobles
      const body8 = `---------- Videresendt besked ----------\nFra: Kunde A <kunde@${dom('a')}>\nEmne: hjælp`
      const m8 = await mkMail('henrik@eltasolar.dk', 'VS: hjælp', { body_text: body8 })
      await run(m8, 'henrik@eltasolar.dk', 'VS: hjælp', body8)
      const r8 = await row(m8)
      check('videresendt → koblet til oprindelig afsender A', r8.customer_id === A && r8.is_forwarded === true, JSON.stringify(r8))

      // 9. internt (eget domæne, ikke videresendt) → ikke koblet
      const m9 = await mkMail('kollega@eltasolar.dk', 'Intern note')
      await run(m9, 'kollega@eltasolar.dk', 'Intern note')
      check('intern afsender → ikke koblet', (await row(m9)).customer_id === null)
    } finally {
      if (mailIds.length) {
        await admin.from('audit_logs').delete().in('entity_id', mailIds)
        await admin.from('incoming_emails').delete().in('id', mailIds)
      }
      if (custIds.length) await admin.from('customers').delete().in('id', custIds)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ K5 autolink-scenarie bestået')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'table-columns') {
    // Staging (read-only): kolonner (type/nullable/default) + CHECK-constraints for én tabel
    const t = String(process.argv[3] || '')
    if (!/^[a-z_0-9]+$/.test(t)) { log('brug: table-columns <tabel>'); process.exit(2) }
    const cols = await stagingSql(`SELECT column_name, data_type, is_nullable, left(coalesce(column_default, ''), 60) d FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${t}' ORDER BY ordinal_position`)
    for (const c of cols) log(`${c.column_name.padEnd(28)} ${c.data_type.padEnd(26)} null=${c.is_nullable} ${c.d}`)
    const checks = await stagingSql(`SELECT conname, left(pg_get_constraintdef(oid), 200) def FROM pg_constraint WHERE conrelid = 'public.${t}'::regclass AND contype IN ('c', 'f')`)
    for (const c of checks) log(`CONSTRAINT ${c.conname}: ${c.def}`)
    return
  }
  if (SUB === 'cron-log-volume') {
    // Staging (read-only): hvor mange cron-logrækker ligger i Pilot Healths 9-dages vindue, og hvor lang tid tager et opslag
    const [c] = await stagingSql(`SELECT count(*)::int n FROM system_health_log WHERE service = 'cron' AND created_at > now() - interval '9 days'`)
    const t0 = Date.now()
    const { error } = await admin.from('system_health_log').select('id, status, message, metadata, created_at')
      .eq('service', 'cron').gte('created_at', new Date(Date.now() - 9 * 86_400_000).toISOString())
      .order('created_at', { ascending: false }).order('id').range(0, 999)
    log(JSON.stringify({ cron_rows_9d: c.n, first_page_ms: Date.now() - t0, error: error?.message ?? null }))
    return
  }
  if (SUB === 'pilot-snapshot') {
    // Staging (read-only): Pilot Health-snapshot som siden bygger den — sektioner, niveau og antal punkter (inkl. cron)
    const { collectPilotHealthSnapshot } = await import('../../src/lib/ops/pilot-health')
    const t0 = Date.now()
    const snap = await collectPilotHealthSnapshot(admin)
    for (const s of snap.sections as Array<{ key?: string; title: string; level?: string; error?: string | null; items?: unknown[] }>) {
      log(`${String(s.level ?? '?').padEnd(8)} ${s.title}  punkter=${s.items?.length ?? 0}${s.error ? `  FEJL ${s.error}` : ''}`)
    }
    log(`samlet=${snap.overall} på ${Date.now() - t0} ms`)
    return
  }
  if (SUB === 'payment-export-probe') {
    // Staging (read-only): betalingseksportens rækker for hvert filter (pagineret build) — kun antal/fejl
    const { buildPaymentExportRows } = await import('../../src/lib/services/payment-report')
    for (const f of ['all', 'overdue', 'outstanding', 'late_payer', 'on_time', 'no_data'] as const) {
      const r = await buildPaymentExportRows(admin, f as never)
      log(`${f}: ${r.error ? `FEJL ${r.error}` : `${r.rows.length} rækker`}`)
    }
    return
  }
  if (SUB === 'export-probe') {
    // Staging (read-only): virker lead-eksportens select (alias description:notes + profil-join)?
    const { data, error } = await admin.from('leads')
      .select('id, company_name, contact_person, email, phone, status, source, value, probability, description:notes, assigned_to, created_at')
      .order('created_at', { ascending: false }).order('id').range(0, 1)
    log(JSON.stringify({ ok: !error, rows: data?.length ?? null, error: error?.message ?? null, code: (error as { code?: string } | null)?.code ?? null }))
    // øvrige eksporters select (samme strenge som src/lib/actions/export.ts)
    const others: Array<[string, string]> = [
      ['offers', 'offer_number, title, customer:customers!offers_customer_id_fkey(company_name, customer_number), status, total_amount, discount_amount, final_amount, valid_until, notes, created_at'],
      ['projects', 'project_number, name, customer:customers(company_name, customer_number), status, priority, start_date, end_date, estimated_hours, actual_hours, budget, actual_cost, description, created_at'],
      ['calculations', 'name, calculation_type, customer:customers(company_name, customer_number), is_template, total_amount:subtotal, final_amount, created_by_profile:profiles!created_by(full_name), created_at'],
    ]
    for (const [t, sel] of others) {
      const r = await admin.from(t).select(sel).range(0, 0)
      log(`${t}: ${r.error ? `FEJL ${r.error.message}` : 'ok'}`)
    }
    return
  }
  if (SUB === 'auth-probe') {
    // Staging: svarer Auth-admin-API'et? Kun status/fejlnavn — ingen hemmeligheder, ingen oprettelse.
    const t0 = Date.now()
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    const e = error as { status?: number; name?: string; message?: string; code?: string } | null
    log(JSON.stringify({ ms: Date.now() - t0, ok: !error, users: data?.users?.length ?? null, status: e?.status ?? null, name: e?.name ?? null, code: e?.code ?? null, message: e?.message?.slice(0, 120) ?? null }))
    if (process.argv[3] === '--create') {
      // opret + slet straks én harness-bruger (som ui-e2e gør) og vis fejlstatus
      const t1 = Date.now()
      const r = await admin.auth.admin.createUser({ email: `probe-${Date.now()}@harness.test`, password: `Pr!${Math.random().toString(36).slice(2)}A9`, email_confirm: true })
      const ce = r.error as { status?: number; name?: string; message?: string; code?: string } | null
      log(JSON.stringify({ create_ms: Date.now() - t1, ok: !r.error, status: ce?.status ?? null, name: ce?.name ?? null, code: ce?.code ?? null, message: ce?.message?.slice(0, 160) ?? null }))
      if (r.data?.user?.id) await admin.auth.admin.deleteUser(r.data.user.id)
    }
    return
  }
  if (SUB === 'db-activity') {
    // Staging (read-only): langvarige forespørgsler/låse — kun tilstand, varighed og forespørgslens første 80 tegn
    const rows = await stagingSql(`SELECT pid, state, wait_event_type, wait_event, usename, application_name,
      extract(epoch FROM now() - coalesce(xact_start, query_start))::int sek, left(regexp_replace(query, '\\s+', ' ', 'g'), 80) q
      FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
      ORDER BY sek DESC NULLS LAST LIMIT 15`)
    for (const r of rows) log(`${String(r.sek).padStart(6)}s  ${r.state}  ${r.wait_event_type ?? ''}/${r.wait_event ?? ''}  ${r.usename}  ${r.application_name}  ${r.q}`)
    const [l] = await stagingSql(`SELECT count(*)::int blokerede FROM pg_locks WHERE NOT granted`)
    log(`ventende låse: ${l.blokerede}`)
    return
  }
  if (SUB === 'auth-stats') {
    // Staging (read-only): antal auth-brugere — harness-brugere (@harness.test) pr. dag de seneste 7 dage + i alt
    const [t] = await stagingSql(`SELECT count(*)::int alle, count(*) FILTER (WHERE email ILIKE '%@harness.test')::int harness,
      count(*) FILTER (WHERE email ILIKE '%@harness.test' AND created_at > now() - interval '1 day')::int harness_24t FROM auth.users`)
    log(JSON.stringify(t))
    return
  }
  if (SUB === 'harness-mails') {
    // Staging (read-only): harness-mails (afsender @harness.test) fordelt på emne-præfiks + ældste. NB: ~5.500
    // "[HARNESS_SYNTHETIC] Forespørgsel …" over et år er et bevidst volumen-fixture — slettes ikke.
    const rows = await stagingSql(`SELECT left(regexp_replace(coalesce(subject, ''), '[0-9].*$', ''), 40) praefiks, count(*)::int n,
      min(received_at)::date aeldste FROM incoming_emails WHERE sender_email ILIKE '%@harness.test' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`)
    for (const r of rows) log(`${String(r.n).padStart(5)}  ${r.aeldste}  ${r.praefiks}`)
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
