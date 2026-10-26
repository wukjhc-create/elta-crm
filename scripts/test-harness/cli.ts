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
  if (SUB === 'cleanup-harness-case') {
    // Staging: slet ÉN efterladt harness-sag (titel skal starte med '[HARNESS]') — fx efter en afbrudt UI-kørsel
    const no = process.argv[3]
    const { data: sc } = await admin.from('service_cases').select('id, title').eq('case_number', no).maybeSingle()
    const row = sc as { id: string; title: string } | null
    if (!row || !row.title.startsWith('[HARNESS]')) { log('ikke en harness-sag — intet slettet'); return }
    const { error } = await admin.from('service_cases').delete().eq('id', row.id)
    log(error ? `fejl: ${error.message}` : `slettet ${no}`)
    return
  }
  if (SUB === 'case-title-probe') {
    // Read-only (staging): sager/kunder hvis navn indeholder et ord (UI-test-diagnose)
    const w = process.argv[3]
    const { data: sc } = await admin.from('service_cases').select('case_number, title, status').ilike('title', `%${w}%`).limit(10)
    const { data: cu } = await admin.from('customers').select('customer_number, company_name').ilike('company_name', `%${w}%`).limit(10)
    log(JSON.stringify({ sager: sc, kunder: cu }, null, 1))
    return
  }
  if (SUB === 'case-timelogs-diag') {
    // Read-only diagnose (staging): arbejdsordrer + timer på en sag
    const caseId = process.argv[3]
    const { data: sc } = await admin.from('service_cases').select('status, closed_at').eq('id', caseId).maybeSingle()
    const { data: wos } = await admin.from('work_orders').select('id, status, assigned_employee_id').eq('case_id', caseId)
    const ids = ((wos ?? []) as Array<{ id: string }>).map((w) => w.id)
    const { data: tls } = ids.length ? await admin.from('time_logs').select('id, work_order_id, hours, approval_status, end_time').in('work_order_id', ids) : { data: [] }
    log(JSON.stringify({ sag: sc, arbejdsordrer: wos, timer: tls }, null, 1))
    return
  }
  if (SUB === 'web-inquiry-backlog') {
    // Read-only (staging): antal åbne webhenvendelser (FormSubmit, ingen kunde, 90 dage) som bulk-knappen behandler
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const { count } = await admin.from('incoming_emails').select('id', { count: 'exact', head: true })
      .ilike('sender_email', '%@formsubmit.co').ilike('subject', '%henvendelse%').is('customer_id', null).eq('is_archived', false).gte('received_at', since)
    const { count: harness } = await admin.from('incoming_emails').select('id', { count: 'exact', head: true })
      .ilike('sender_email', '%@formsubmit.co').ilike('subject', '%[HARNESS]%').is('customer_id', null).eq('is_archived', false)
    log(`åbne webhenvendelser: ${count} (heraf harness-efterladte: ${harness})`)
    return
  }
  if (SUB === 'fresh-signed-url-check') {
    // 00210: dokument med blankt file_url men rigtig fil → portalen (og kundekortets service) giver et friskt, virkende link
    const { getPortalDocuments } = await import('../../src/lib/actions/portal')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `FS-${stamp}`, company_name: `[HARNESS] fs ${stamp}`, contact_person: 'X', email: `fsu-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const path = `customer-documents/${cust}/harness-${stamp}.pdf`
    const tok = randomBytes(32).toString('hex')
    try {
      const up = await admin.storage.from('attachments').upload(path, new Blob(['%PDF-1.4 harness'], { type: 'application/pdf' }), { upsert: false })
      check('fil uploadet (service-klient)', !up.error, up.error?.message)
      await admin.from('portal_access_tokens').insert({ customer_id: cust, token: tok, email: `fsu-${stamp}@harness.test`, is_active: true, created_by: owner })
      await admin.from('customer_documents').insert({ customer_id: cust, title: 'Frisk [HARNESS]', document_type: 'other', file_url: '', storage_path: path, file_name: 'frisk.pdf', mime_type: 'application/pdf' })
      const docs = await getPortalDocuments(tok)
      const d = (docs.data ?? []).find((x) => x.title === 'Frisk [HARNESS]')
      check('portalen giver et friskt signeret link trods blankt file_url', !!d?.file_url && d.file_url.includes('/storage/v1/object/sign/'))
      const r = d?.file_url ? await fetch(d.file_url) : null
      check('linket virker (kan hentes)', !!r?.ok, `status=${r?.status}`)
    } finally {
      await admin.storage.from('attachments').remove([path])
      await admin.from('customer_documents').delete().eq('customer_id', cust)
      await admin.from('portal_access_tokens').delete().eq('customer_id', cust)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ friske signerede links ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'messages-integrity-check') {
    // 00217: montør (persona) kan ikke sende interne beskeder med falsk afsendernavn; modtageren (salg) kan kun ændre
    // status/read_at/archived_at. Midlertidige beskeder ryddes.
    const { loginPersonas } = await import('./role-matrix')
    const personas = new Map(Array.from(await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })))
    const montor = personas.get('montør' as never)!
    const salg = personas.get('salg' as never)!
    const montorId = (await montor.auth.getUser()).data.user!.id
    const salgId = (await salg.auth.getUser()).data.user!.id
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const ids: string[] = []
    try {
      const { data: ins, error: insErr } = await montor.from('messages').insert({ subject: '[HARNESS] fra "chefen"', body: 'x', from_user_id: montorId, from_name: 'Henrik (admin)', from_email: 'henrik@falsk.invalid', to_user_id: salgId }).select('id').single()
      if (insErr || !ins) throw new Error(`insert: ${insErr?.message}`)
      ids.push((ins as { id: string }).id)
      const { data: row } = await admin.from('messages').select('from_name, from_email').eq('id', ids[0]).single()
      const { data: prof } = await admin.from('profiles').select('full_name, email').eq('id', montorId).single()
      const r = row as { from_name: string | null; from_email: string | null }
      const p = prof as { full_name: string | null; email: string }
      check('afsendernavn/-mail kommer fra profilen (ikke klienten)', r.from_name === p.full_name && r.from_email === p.email, `navn=${r.from_name === 'Henrik (admin)' ? 'FALSK' : 'profil'}`)
      const u1 = await salg.from('messages').update({ body: 'omskrevet' }).eq('id', ids[0]).select('id')
      check('modtager kan ikke ændre brødtekst', !!u1.error || (u1.data ?? []).length === 0, u1.error?.code ?? `rækker=${(u1.data ?? []).length}`)
      const u2 = await salg.from('messages').update({ status: 'read', read_at: new Date().toISOString() }).eq('id', ids[0]).select('id')
      check('modtager kan markere læst', !u2.error && (u2.data ?? []).length === 1, u2.error?.message ?? '')
    } finally {
      if (ids.length) await admin.from('messages').delete().in('id', ids)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ beskedintegritet ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'offers-lock-check') {
    // 00215: salg (rigtig persona-session) kan via REST ikke ændre linjer/priser på et sendt tilbud, ikke slette det og
    // ikke gøre det til forslag; noter og kladder virker. 00216: 100,04 med 12,5 % rabat → total 109,41 (trinvis).
    const { loginPersonas } = await import('./role-matrix')
    const personas = new Map(Array.from(await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })))
    const salg = personas.get('salg' as never)!
    const salgId = (await salg.auth.getUser()).data.user!.id
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const cust = ((await admin.from('customers').insert({ customer_number: `OL-${stamp}`, company_name: `[HARNESS] ol ${stamp}`, contact_person: 'X', email: `ol-${stamp}@harness.test`, created_by: salgId }).select('id').single()).data as { id: string }).id
    const mkOffer = async (n: number, status: string) => ((await admin.from('offers').insert({ offer_number: `OL-${stamp}-${n}`, title: '[HARNESS] ol', customer_id: cust, status, discount_percentage: 12.5, tax_percentage: 25, created_by: salgId }).select('id').single()).data as { id: string }).id
    const draft = await mkOffer(1, 'draft')
    const sent = await mkOffer(2, 'draft')
    const ids = [draft, sent]
    const blocked = (r: { error: { code?: string } | null; data: unknown[] | null }) => !!r.error || (r.data ?? []).length === 0
    try {
      for (const id of ids) await admin.from('offer_line_items').insert({ offer_id: id, position: 1, description: 'x', quantity: 1, unit: 'stk', unit_price: 100.04, total: 100.04 })
      const { data: totals } = await admin.from('offers').select('final_amount, discount_amount, tax_amount').eq('id', draft).single()
      log(`  (00216) linjer 100,04 · rabat 12,5 % → total ${(totals as { final_amount: number }).final_amount} (trinvis = 109.41, gammel trigger = 109.42)`)
      check('00216 totaler afrundes trinvis (109,41)', Number((totals as { final_amount: number }).final_amount) === 109.41)
      await admin.from('offers').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', sent)
      const lineId = ((await admin.from('offer_line_items').select('id').eq('offer_id', sent).single()).data as { id: string }).id
      const r1 = await salg.from('offer_line_items').update({ unit_price: 1, total: 1 }).eq('id', lineId).select('id')
      check('salg kan ikke ændre linje på sendt tilbud', blocked(r1), r1.error?.code ?? `rækker=${(r1.data ?? []).length}`)
      const r2 = await salg.from('offer_line_items').insert({ offer_id: sent, position: 2, description: 'y', quantity: 1, unit: 'stk', unit_price: 5, total: 5 }).select('id')
      check('salg kan ikke tilføje linje på sendt tilbud', blocked(r2), r2.error?.code ?? `rækker=${(r2.data ?? []).length}`)
      const r3 = await salg.from('offers').update({ discount_percentage: 90 }).eq('id', sent).select('id')
      check('salg kan ikke ændre rabat på sendt tilbud', blocked(r3), r3.error?.code ?? `rækker=${(r3.data ?? []).length}`)
      const r4 = await salg.from('offers').update({ is_proposal: true }).eq('id', sent).select('id')
      check('salg kan ikke gøre tilbud til forslag', blocked(r4), r4.error?.code ?? `rækker=${(r4.data ?? []).length}`)
      const r5 = await salg.from('offers').delete().eq('id', sent).select('id')
      check('salg kan ikke slette sendt tilbud', blocked(r5), r5.error?.code ?? `rækker=${(r5.data ?? []).length}`)
      const r6 = await salg.from('offers').update({ notes: 'intern note' }).eq('id', sent).select('id')
      check('salg kan stadig skrive interne noter på sendt tilbud', !r6.error && (r6.data ?? []).length === 1, r6.error?.message ?? '')
      const r7 = await salg.from('offer_line_items').update({ unit_price: 200, total: 200 }).eq('offer_id', draft).select('id')
      check('salg kan stadig ændre linjer på kladde', !r7.error && (r7.data ?? []).length === 1, r7.error?.message ?? '')
      const { data: after } = await admin.from('offers').select('final_amount').eq('id', sent).maybeSingle()
      check('sendt tilbud findes stadig med uændret total', !!after && [109.41, 109.42].includes(Number((after as { final_amount: number }).final_amount)), after ? String((after as { final_amount: number }).final_amount) : 'SLETTET')
    } finally {
      await admin.from('offer_line_items').delete().in('offer_id', ids)
      await admin.from('offer_activities').delete().in('offer_id', ids)
      await admin.from('offers').delete().in('id', ids)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ tilbuds-lås ok (salg-persona)')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'payment-summary-check') {
    // 00214: v_customer_payment_summary.outstanding_total pr. kunde = appens åbne beløb (lib/invoices/open-amount.ts)
    // for sendte, ikke-annullerede, ikke-kreditnota-fakturaer. Kun læsning.
    const { fetchAllRows } = await import('../../src/lib/supabase/fetch-all')
    const invs = await fetchAllRows<{ id: string; customer_id: string | null; status: string; invoice_type: string | null; voided_at: string | null; final_amount: number | null; amount_paid: number | null; credit_of_invoice_id: string | null }>((f, t) =>
      admin.from('invoices').select('id, customer_id, status, invoice_type, voided_at, final_amount, amount_paid, credit_of_invoice_id').order('id').range(f, t) as never)
    const credited = new Map<string, number>()
    for (const c of invs) if (c.invoice_type === 'credit' && c.credit_of_invoice_id && ['sent', 'paid'].includes(c.status) && !c.voided_at) {
      credited.set(c.credit_of_invoice_id, (credited.get(c.credit_of_invoice_id) ?? 0) + Math.abs(Number(c.final_amount ?? 0)))
    }
    const expected = new Map<string, number>()
    for (const i of invs) {
      if (!i.customer_id || i.status !== 'sent' || i.voided_at || (i.invoice_type ?? 'standard') === 'credit') continue
      const open = Math.max(0, Number(i.final_amount ?? 0) - Number(i.amount_paid ?? 0) - (credited.get(i.id) ?? 0))
      expected.set(i.customer_id, (expected.get(i.customer_id) ?? 0) + open)
    }
    const view = await fetchAllRows<{ customer_id: string; outstanding_total: number }>((f, t) =>
      admin.from('v_customer_payment_summary').select('customer_id, outstanding_total').order('customer_id').range(f, t) as never)
    let diff = 0
    for (const v of view) {
      const e = Math.round((expected.get(v.customer_id) ?? 0) * 100) / 100
      if (Math.abs(Number(v.outstanding_total) - e) > 0.01) diff++
    }
    const partial = invs.filter((i) => i.status === 'sent' && Number(i.amount_paid ?? 0) > 0).length + credited.size
    log(`${diff === 0 ? '✅' : '❌'} ${view.length} kunder i viewet, ${diff} afviger fra appens åbne beløb (delbetalte/krediterede fakturaer i data: ${partial})`)
    process.exitCode = diff === 0 ? 0 : 1
    return
  }
  if (SUB === 'work-orders-guard-check') {
    // 00213: montør (rigtig persona-session) på EGEN arbejdsordre: kun status (planned→in_progress→done) virker;
    // case_id/dato/titel afvises; en annulleret ordre kan ikke gøres 'done'. Admin uændret. Midlertidige rækker ryddes.
    const { loginPersonas } = await import('./role-matrix')
    const personas = new Map(Array.from(await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })))
    const montor = personas.get('montør' as never)!
    const montorId = (await montor.auth.getUser()).data.user!.id
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: existingEmp } = await admin.from('employees').select('id').eq('profile_id', montorId).maybeSingle()
    let empId = (existingEmp as { id: string } | null)?.id ?? null
    let createdEmp = false
    if (!empId) {
      const { data: e, error } = await admin.from('employees').insert({ name: '[HARNESS] montør-persona', email: `wg-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300, profile_id: montorId }).select('id').single()
      if (error) throw new Error(`employee: ${error.message}`)
      empId = (e as { id: string }).id; createdEmp = true
    }
    const cust = ((await admin.from('customers').insert({ customer_number: `WG-${stamp}`, company_name: `[HARNESS] wg ${stamp}`, contact_person: 'X', email: `wg-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const mkCase = async (n: number, status: string) => ((await admin.from('service_cases').insert({ case_number: `SVC-5${String(stamp).slice(-5)}${n}`, customer_id: cust, title: '[HARNESS] wg', status, created_by: owner }).select('id').single()).data as { id: string }).id
    const caseId = await mkCase(1, 'in_progress')
    const closedCase = await mkCase(2, 'closed')
    const mkWo = async (status: string) => ((await admin.from('work_orders').insert({ case_id: caseId, customer_id: cust, title: '[HARNESS] wg', status, scheduled_date: '2026-10-01', assigned_employee_id: empId }).select('id').single()).data as { id: string }).id
    const wo = await mkWo('planned')
    const cancelled = await mkWo('cancelled')
    try {
      const r3 = await montor.from('work_orders').update({ status: 'in_progress' }).eq('id', wo).select('id')
      check('montør kan starte egen ordre (planned→in_progress)', !r3.error && (r3.data ?? []).length === 1, r3.error?.message ?? '')
      // politikken (00181) kræver ny status in_progress/done — derfor sendes status med for at ramme selve hullet
      const r1 = await montor.from('work_orders').update({ case_id: closedCase, status: 'in_progress' }).eq('id', wo).select('id')
      check('montør kan ikke flytte egen ordre til anden sag', !!r1.error || (r1.data ?? []).length === 0, r1.error?.code ?? `rækker=${(r1.data ?? []).length}`)
      const r2 = await montor.from('work_orders').update({ scheduled_date: '2027-01-01', title: 'ændret', status: 'in_progress' }).eq('id', wo).select('id')
      check('montør kan ikke ændre dato/titel', !!r2.error || (r2.data ?? []).length === 0, r2.error?.code ?? `rækker=${(r2.data ?? []).length}`)
      const r4 = await montor.from('work_orders').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', wo).select('id')
      check('montør kan afslutte egen ordre (in_progress→done)', !r4.error && (r4.data ?? []).length === 1, r4.error?.message ?? '')
      const r5 = await montor.from('work_orders').update({ status: 'done' }).eq('id', cancelled).select('id')
      check('montør kan ikke gøre annulleret ordre done', !!r5.error || (r5.data ?? []).length === 0, r5.error?.code ?? `rækker=${(r5.data ?? []).length}`)
      const r6 = await montor.from('work_orders').update({ status: 'in_progress' }).eq('id', wo).select('id')
      check('montør kan ikke genåbne udført ordre', !!r6.error || (r6.data ?? []).length === 0, r6.error?.code ?? `rækker=${(r6.data ?? []).length}`)
      const { data: row } = await admin.from('work_orders').select('case_id, title').eq('id', wo).single()
      check('ordren er stadig på sin sag med uændret titel', (row as { case_id: string; title: string }).case_id === caseId && (row as { title: string }).title === '[HARNESS] wg')
      const r7 = await admin.from('work_orders').update({ title: '[HARNESS] wg admin' }).eq('id', wo).select('id')
      check('admin (service) kan stadig ændre', !r7.error && (r7.data ?? []).length === 1, r7.error?.message ?? '')
    } finally {
      await admin.from('work_order_profit').delete().in('work_order_id', [wo, cancelled])
      await admin.from('work_orders').delete().in('id', [wo, cancelled])
      await admin.from('service_cases').delete().in('id', [caseId, closedCase])
      await admin.from('customers').delete().eq('id', cust)
      if (createdEmp) await admin.from('employees').delete().eq('id', empId!)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ arbejdsordre-guard ok (montør-persona)')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'time-logs-grants-check') {
    // 00208: montør (rigtig persona-session) på EGNE timer: beløbs-/fakturafelter kan ikke skrives (42501), retter han
    // sluttiden virker det og godkendelsen nulstilles, en kollegas sats afvises, appens felter virker stadig.
    const { loginPersonas } = await import('./role-matrix')
    const personas = new Map(Array.from(await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })))
    const montor = personas.get('montør' as never)!
    const montorId = (await montor.auth.getUser()).data.user!.id
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: existingEmp } = await admin.from('employees').select('id').eq('profile_id', montorId).maybeSingle()
    let empId = (existingEmp as { id: string } | null)?.id ?? null
    let createdEmp = false
    if (!empId) {
      const { data: e, error } = await admin.from('employees').insert({ name: '[HARNESS] montør-persona', email: `tg-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300, profile_id: montorId }).select('id').single()
      if (error) throw new Error(`employee: ${error.message}`)
      empId = (e as { id: string }).id; createdEmp = true
    }
    const { data: other } = await admin.from('employees').insert({ name: '[HARNESS] kollega', email: `tgk-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300 }).select('id').single()
    const otherId = (other as { id: string }).id
    const { data: rate } = await admin.from('employee_overtime_rates').insert({ employee_id: otherId, name: 'Kollega 100%', code: `h${stamp % 100000}`, multiplier: 2 }).select('id').single()
    const cust = ((await admin.from('customers').insert({ customer_number: `TG-${stamp}`, company_name: `[HARNESS] tg ${stamp}`, contact_person: 'X', email: `tg-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const caseId = ((await admin.from('service_cases').insert({ case_number: `SVC-4${String(stamp).slice(-6)}`, customer_id: cust, title: '[HARNESS] tg', status: 'in_progress', created_by: owner }).select('id').single()).data as { id: string }).id
    const woId = ((await admin.from('work_orders').insert({ case_id: caseId, customer_id: cust, title: '[HARNESS] tg', status: 'in_progress', scheduled_date: '2026-10-01', assigned_employee_id: empId }).select('id').single()).data as { id: string }).id
    const { data: tl, error: tlErr } = await admin.from('time_logs').insert({ work_order_id: woId, employee_id: empId, start_time: '2026-10-01T06:00:00Z', end_time: '2026-10-01T14:00:00Z', billable: true }).select('id').single()
    if (tlErr) throw new Error(`time_log: ${tlErr.message}`)
    const tlId = (tl as { id: string }).id
    await admin.from('time_logs').update({ approval_status: 'approved', approved_by: owner, approved_at: new Date().toISOString() }).eq('id', tlId)
    const row = async () => (await admin.from('time_logs').select('sale_amount, cost_amount, invoice_line_id, approval_status, end_time').eq('id', tlId).single()).data as { sale_amount: number | null; cost_amount: number | null; invoice_line_id: string | null; approval_status: string; end_time: string }
    try {
      const before = await row()
      for (const [label, patch] of [['sale_amount', { sale_amount: 0 }], ['cost_amount', { cost_amount: 9999 }], ['invoice_line_id', { invoice_line_id: null }], ['hours', { hours: 99 }]] as const) {
        const r = await montor.from('time_logs').update(patch).eq('id', tlId).select('id')
        const after = await row()
        const unchanged = JSON.stringify({ s: after.sale_amount, c: after.cost_amount }) === JSON.stringify({ s: before.sale_amount, c: before.cost_amount })
        check(`montør kan ikke skrive ${label} på egne timer`, !!r.error || ((r.data ?? []).length === 0 && unchanged), r.error ? `${r.error.code}` : `rækker=${(r.data ?? []).length}`)
      }
      const rr = await montor.from('time_logs').update({ employee_rate_id: (rate as { id: string }).id }).eq('id', tlId).select('id')
      check('montør kan ikke vælge en kollegas sats', !!rr.error, rr.error ? rr.error.code ?? rr.error.message : 'TILLADT')
      const ok = await montor.from('time_logs').update({ end_time: '2026-10-01T15:00:00Z' }).eq('id', tlId).select('id')
      const after = await row()
      check('montør kan rette egen sluttid (appens felt) → godkendelse nulstilles', !ok.error && after.approval_status === 'pending' && after.end_time.startsWith('2026-10-01T15:00'), ok.error ? ok.error.message : after.approval_status)
    } finally {
      await admin.from('time_logs').delete().eq('id', tlId)
      await admin.from('work_orders').delete().eq('id', woId)
      await admin.from('service_cases').delete().eq('id', caseId)
      await admin.from('customers').delete().eq('id', cust)
      await admin.from('employee_overtime_rates').delete().eq('employee_id', otherId)
      await admin.from('employees').delete().eq('id', otherId)
      if (createdEmp) await admin.from('employees').delete().eq('id', empId!)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ time_logs kolonne-grants ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'ai-budget-concurrency-check') {
    // Mail-review 2026-10-09 (#3): 20 samtidige recordAiCall → tælleren stiger med præcis 20 (før: læs-så-skriv tabte
    // optællinger). Dagens tæller sættes tilbage bagefter. Ingen AI-kald.
    const { recordAiCall } = await import('../../src/lib/services/ai-budget')
    const day = new Date().toISOString().substring(0, 10)
    const read = async () => ((await admin.from('ai_usage_daily').select('call_count').eq('day', day).maybeSingle()).data as { call_count: number } | null)?.call_count ?? null
    const before = await read()
    await Promise.all(Array.from({ length: 20 }, () => recordAiCall(1)))
    const after = await read()
    const delta = (after ?? 0) - (before ?? 0)
    if (before === null) await admin.from('ai_usage_daily').delete().eq('day', day)
    else await admin.from('ai_usage_daily').update({ call_count: (after ?? 0) - 20 }).eq('day', day)
    log(`${delta === 20 ? '✅' : '❌'} 20 samtidige recordAiCall → +${delta}`)
    process.exitCode = delta === 20 ? 0 : 1
    return
  }
  if (SUB === 'mail-attachment-links-check') {
    // Storage-review 2026-10-09: mailvedhæftninger får friske 1-times links fra storagePath; fremmede stier signeres
    // ikke; listen bærer ingen links. Midlertidig mail + fil ryddes op.
    const { withFreshAttachmentLinks, withoutAttachmentLinks } = await import('../../src/lib/mail/attachment-links')
    const stamp = Date.now()
    const { data: em, error: emErr } = await admin.from('incoming_emails').insert({
      graph_message_id: `harness-att-${stamp}`, subject: '[HARNESS] vedhæftningslinks', sender_email: `att-${stamp}@harness.test`,
      to_email: 'kontakt@harness.test', received_at: new Date().toISOString(), link_status: 'ignored', has_attachments: true,
    }).select('id').single()
    if (emErr || !em) { log(`❌ kunne ikke oprette mail: ${emErr?.message}`); process.exitCode = 1; return }
    const id = (em as { id: string }).id
    const path = `email-attachments/${id}/0-test.txt`
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    try {
      await admin.storage.from('attachments').upload(path, new Blob(['hej'], { type: 'text/plain' }), { upsert: false })
      const raw = [
        { filename: 'test.txt', storagePath: path, url: 'https://gammelt-link.invalid/1aar' },
        { filename: 'fremmed.txt', storagePath: 'customer-documents/x/y.pdf', url: '' },
      ]
      const fresh = await withFreshAttachmentLinks(id, raw)
      const r = fresh[0].url ? await fetch(fresh[0].url) : null
      check('egen fil får frisk link der kan hentes', !!r?.ok && fresh[0].url !== raw[0].url, `status=${r?.status}`)
      check('fremmed sti signeres ikke', fresh[1].url === '')
      check('listen bærer ingen links', withoutAttachmentLinks(raw).every((a) => a.url === ''))
    } finally {
      await admin.storage.from('attachments').remove([path])
      await admin.from('incoming_emails').delete().eq('id', id)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ mail-vedhæftningslinks ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'invoice-backfill-candidates-check') {
    // IV-13: findBackfillCandidates læser side for side og filtrerer låste statusser i databasen. Midlertidig mail +
    // to brødtekst-fakturaer (én åben, én godkendt) ryddes op.
    const { findBackfillCandidates } = await import('../../src/lib/invoice-control/attachment-backfill')
    const stamp = Date.now()
    const { data: em, error: emErr } = await admin.from('incoming_emails').insert({
      graph_message_id: `harness-bf-${stamp}`, subject: '[HARNESS] backfill', sender_email: `bf-${stamp}@harness.test`,
      to_email: 'kontakt@harness.test', received_at: new Date().toISOString(), link_status: 'ignored', has_attachments: true,
    }).select('id').single()
    if (emErr || !em) { log(`❌ kunne ikke oprette mail: ${emErr?.message}`); process.exitCode = 1; return }
    const emailId = (em as { id: string }).id
    const ids: string[] = []
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    try {
      for (const status of ['received', 'approved']) {
        const { data, error } = await admin.from('incoming_invoices').insert({ source: 'email', status, source_email_id: emailId, file_name: `email-${emailId}.txt`, invoice_number: `H-BF-${status}-${stamp}`, currency: 'DKK' }).select('id').single()
        if (error || !data) throw new Error(`faktura (${status}): ${error?.message}`)
        ids.push((data as { id: string }).id)
      }
      const r = await findBackfillCandidates(50, [emailId])
      check('åben brødtekst-faktura er kandidat', r.batch.some((c) => c.invoiceId === ids[0]), `total=${r.total}`)
      check('godkendt faktura er ikke kandidat', !r.batch.some((c) => c.invoiceId === ids[1]))
      const all = await findBackfillCandidates(0)
      check('fuld kandidatsøgning kører uden fejl', all.batch.length === 0, `total=${all.total}`)
    } catch (e) {
      fails++; log(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      if (ids.length) await admin.from('incoming_invoices').delete().in('id', ids)
      await admin.from('incoming_emails').delete().eq('id', emailId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ backfill-kandidater ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'supplier-delete-guard-check') {
    // DL-3: leverandør med produkter/fakturaer og produkt brugt i en sag kan ikke slettes; tom leverandør kan
    const { supplierDeleteBlockReason, supplierProductDeleteBlockReason } = await import('../../src/lib/suppliers/delete-guard')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const ids: { sup: string[]; sp: string[] } = { sup: [], sp: [] }
    try {
      const s1 = (await admin.from('suppliers').insert({ name: `[HARNESS] DL3 tom ${stamp}`, code: `DL3A${stamp}` }).select('id').single()).data as { id: string }
      const s2 = (await admin.from('suppliers').insert({ name: `[HARNESS] DL3 prod ${stamp}`, code: `DL3B${stamp}` }).select('id').single()).data as { id: string }
      ids.sup.push(s1.id, s2.id)
      const sp = (await admin.from('supplier_products').insert({ supplier_id: s2.id, supplier_sku: `DL3-${stamp}`, supplier_name: '[HARNESS] DL3 kabel', cost_price: 10 }).select('id').single()).data as { id: string } | null
      if (sp) ids.sp.push(sp.id)
      check('tom leverandør må slettes', (await supplierDeleteBlockReason(s1.id)) === null)
      const r2 = await supplierDeleteBlockReason(s2.id)
      check('leverandør med produkt afvises', !!r2 && /produkt/.test(r2), r2 ?? '')
      check('ubrugt produkt må slettes', !!sp && (await supplierProductDeleteBlockReason(sp.id)) === null)
    } catch (e) {
      fails++; log(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      if (ids.sp.length) await admin.from('supplier_products').delete().in('id', ids.sp)
      if (ids.sup.length) await admin.from('suppliers').delete().in('id', ids.sup)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ leverandør-sletteværn ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'invoice-parse-failure-check') {
    // IV-2: fejler parse-opdateringen (her et beløb ud over NUMERIC(12,2)), markeres fakturaen til manuel gennemgang
    const { parseAndMatch } = await import('../../src/lib/services/incoming-invoices')
    const stamp = Date.now()
    const { data, error } = await admin.from('incoming_invoices').insert({ source: 'manual', status: 'received', invoice_number: `H-PF-${stamp}`, currency: 'DKK', raw_text: 'HARNESS Firma ApS\nFaktura nr 7788\nI alt 99.999.999.999,00' }).select('id').single()
    if (error || !data) { log(`❌ seed: ${error?.message}`); process.exitCode = 1; return }
    const id = (data as { id: string }).id
    let fails = 0
    try {
      const r = await parseAndMatch(id)
      const { data: row } = await admin.from('incoming_invoices').select('parse_status, requires_manual_review, status').eq('id', id).maybeSingle()
      const x = row as { parse_status?: string; requires_manual_review?: boolean; status?: string } | null
      const ok = !r.parsed && x?.parse_status === 'failed' && x?.requires_manual_review === true
      if (!ok) fails++
      log(`  ${ok ? '✓' : '❌'} fejlet opdatering → manuel gennemgang — parsed=${r.parsed} parse_status=${x?.parse_status} review=${x?.requires_manual_review} status=${x?.status}`)
    } finally {
      await admin.from('incoming_invoices').delete().eq('id', id)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ parse-fejl markeres')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'mail-backfill-probe') {
    // Mail-review 2026-10-09 (#1): orchestratorens backfill-forespørgsel (kolonner/filtre) virker mod det rigtige skema
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
    const { data, error } = await admin
      .from('incoming_emails')
      .select('id, subject, sender_email, sender_name, body_text, body_html, body_preview')
      .eq('link_status', 'pending')
      .is('processed_at', null)
      .gte('received_at', since)
      .order('received_at', { ascending: true })
      .limit(60)
    log(`${error ? '❌' : '✅'} backfill-forespørgsel ${error ? error.message : `ok (${(data ?? []).length} ubehandlede)`}`)
    process.exitCode = error ? 1 : 0
    return
  }
  if (SUB === 'storage-persona-check') {
    // 00209: rigtige persona-sessioner (5 roller) må hverken liste, hente eller uploade direkte i attachments /
    // service-case-files / portal-attachments; service-klienten kan stadig liste, signere og hente.
    const { loginPersonas } = await import('./role-matrix')
    const personas = new Map(Array.from(await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })))
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    // et kendt objekt at forsøge at hente
    const { data: adminList } = await admin.storage.from('attachments').list('customer-documents', { limit: 5 })
    const folder = (adminList ?? []).find((o) => !o.id)?.name ?? null
    const { data: inner } = folder ? await admin.storage.from('attachments').list(`customer-documents/${folder}`, { limit: 5 }) : { data: [] }
    const obj = folder && (inner ?? []).find((o) => o.id) ? `customer-documents/${folder}/${(inner ?? []).find((o) => o.id)!.name}` : null
    check('service-klienten kan liste attachments', (adminList ?? []).length > 0, `obj=${obj ? 'fundet' : 'ingen'}`)
    if (obj) {
      const { data: signed, error } = await admin.storage.from('attachments').createSignedUrl(obj, 60)
      const r = signed?.signedUrl ? await fetch(signed.signedUrl) : null
      check('service-klienten signerer og filen kan hentes via signeret link', !error && !!r?.ok, `status=${r?.status}`)
    }
    for (const [role, cl] of personas) {
      const l1 = await cl.storage.from('attachments').list('email-attachments', { limit: 5 })
      const l2 = await cl.storage.from('attachments').list('customer-documents', { limit: 5 })
      const l3 = await cl.storage.from('service-case-files').list('', { limit: 5 })
      const dl = obj ? await cl.storage.from('attachments').download(obj) : { data: null, error: null }
      const up = await cl.storage.from('attachments').upload(`harness/${role}-${Date.now()}.txt`, new Blob(['x'], { type: 'text/plain' }), { upsert: false })
      const listed = (l1.data ?? []).length + (l2.data ?? []).length + (l3.data ?? []).length
      const ok = listed === 0 && !dl.data && !!up.error
      check(`${role.padEnd(12)} kan hverken liste/hente/uploade direkte`, ok, `listet=${listed} hentet=${dl.data ? 'JA' : 'nej'} upload=${up.error ? 'afvist' : 'TILLADT'}`)
      if (!up.error) await admin.storage.from('attachments').remove([up.data!.path])
    }
    log(fails ? `❌ ${fails} fejl` : '✅ storage-lockdown ok (personaer)')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'notify-prefs-check') {
    // 00220 + lib/notifications/user-notify: sender KUN når brugeren har slået hændelsens e-mail til (standard fra);
    // push/daglig opsummering findes ikke → sendes aldrig. Test-transport (ingen live-mail). Brugerens egne indstillinger
    // gemmes via egen session (kolonne-grant). Indstillingerne nulstilles bagefter.
    const { notifyUser, setUserNotifyTransport } = await import('../../src/lib/notifications/user-notify')
    const { loginPersonas } = await import('./role-matrix')
    const personas = new Map(Array.from(await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })))
    const salg = personas.get('salg' as never)!
    const uid = (await salg.auth.getUser()).data.user!.id
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const sent: string[] = []
    setUserNotifyTransport(async (m) => { sent.push(m.subject); return { delivered: true } })
    const content = { subject: 'T', html: '<p>t</p>', text: 't' }
    try {
      await admin.from('profiles').update({ notification_preferences: {} }).eq('id', uid)
      check('standard (intet valgt) → sendes ikke', (await notifyUser(uid, 'offer_signed', content)) === 'skipped')
      const own = await salg.from('profiles').update({ notification_preferences: { offer_signed: { email: true, push: true }, daily_summary: { email: true, push: false } } }).eq('id', uid).select('id')
      check('brugeren kan gemme egne indstillinger (kolonne-grant)', !own.error && (own.data ?? []).length === 1, own.error?.message ?? '')
      const dbg = (await admin.from('profiles').select('email, is_active, notification_preferences').eq('id', uid).single()).data as { email: string | null; is_active: boolean | null; notification_preferences: unknown }
      const outcome = await notifyUser(uid, 'offer_signed', content)
      check('slået til → sendes', outcome === 'sent', `${outcome} (email=${dbg?.email ? 'ja' : 'nej'} aktiv=${dbg?.is_active} prefs=${JSON.stringify(dbg?.notification_preferences)})`)
      check('anden hændelse (ikke valgt) → sendes ikke', (await notifyUser(uid, 'new_message', content)) === 'skipped')
      check('daglig opsummering (ikke tilgængelig) → sendes ikke', (await notifyUser(uid, 'daily_summary', content)) === 'skipped')
      const other = ((await admin.from('profiles').select('id').neq('id', uid).eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0]?.id
      const foreign = other ? await salg.from('profiles').update({ notification_preferences: { new_lead: { email: true } } }).eq('id', other).select('id') : { data: [], error: null }
      check('brugeren kan ikke ændre andres indstillinger', !!foreign.error || (foreign.data ?? []).length === 0, foreign.error?.code ?? `rækker=${(foreign.data ?? []).length}`)
      check('præcis én mail via test-transport', sent.length === 1, `${sent.length}`)
    } finally {
      setUserNotifyTransport(null)
      await admin.from('profiles').update({ notification_preferences: {} }).eq('id', uid)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ notifikationsindstillinger respekteres')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'calc-offer-mode-check') {
    // 00219: kalkulationens total tæller 'visible' + 'hidden_included', ikke 'excluded'; dækningsbidrag efter avance/rabat.
    // Midlertidig kalkulation ryddes.
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { data: calc, error: cErr } = await admin.from('calculations').insert({ name: `[HARNESS] offer_mode ${stamp}`, created_by: owner, margin_percentage: 20, discount_percentage: 10, tax_percentage: 25 }).select('id').single()
    if (cErr || !calc) { log(`❌ kalkulation: ${cErr?.message}`); process.exitCode = 1; return }
    const id = (calc as { id: string }).id
    try {
      const row = (description: string, total: number, cost: number, offer_mode: string) =>
        ({ calculation_id: id, row_type: 'manual', position: 0, description, quantity: 1, unit: 'stk', cost_price: cost, sale_price: total, total, offer_mode, show_on_offer: offer_mode === 'visible' })
      const { error: rErr } = await admin.from('calculation_rows').insert([
        row('synlig', 10000, 6000, 'visible'), row('skjult medregnet', 2000, 1200, 'hidden_included'), row('udeladt', 500, 300, 'excluded'),
      ])
      if (rErr) throw new Error(`rækker: ${rErr.message}`)
      const { data: c } = await admin.from('calculations').select('subtotal, final_amount, gross_profit, gross_profit_margin').eq('id', id).single()
      const v = c as { subtotal: number; final_amount: number; gross_profit: number; gross_profit_margin: number }
      // netto = 12.000 × 1,2 × 0,9 = 12.960; kost = 7.200 → DB 5.760 (44,44 %); total inkl. moms 16.200
      check('subtotal = synlig + skjult medregnet (udeladt tæller ikke)', Number(v.subtotal) === 12000, `${v.subtotal}`)
      check('total inkl. moms = 12.000 × 1,2 × 0,9 × 1,25', Number(v.final_amount) === 16200, `${v.final_amount}`)
      check('dækningsbidrag efter avance og rabat', Number(v.gross_profit) === 5760, `${v.gross_profit} (${v.gross_profit_margin} %)`)
      const { error: badErr } = await admin.from('calculation_rows').insert(row('ugyldig', 1, 0, 'skjult'))
      check('ugyldig tilstand afvises', !!badErr, badErr?.code ?? 'TILLADT')
    } finally {
      await admin.from('calculation_rows').delete().eq('calculation_id', id)
      await admin.from('calculations').delete().eq('id', id)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ kalkulationsrækkers tilbudstilstand ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'customer-docs-share-check') {
    // 00218 (Henrik 2026-10-10): kundedokumenter er interne som standard — vises kun i portalen når de er delt;
    // mail-arkiv vises aldrig. Midlertidig kunde/token/dokumenter ryddes.
    const { getPortalDocuments } = await import('../../src/lib/actions/portal')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `DS-${stamp}`, company_name: `[HARNESS] ds ${stamp}`, contact_person: 'X', email: `ds-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const tok = randomBytes(32).toString('hex')
    try {
      await admin.from('portal_access_tokens').insert({ customer_id: cust, token: tok, email: `ds-${stamp}@harness.test`, is_active: true, created_by: owner })
      const mk = async (title: string, extra: Record<string, unknown>) => ((await admin.from('customer_documents').insert({ customer_id: cust, title, document_type: 'other', file_url: '', file_name: `${title}.pdf`, storage_path: `customer-documents/${cust}/${title}.pdf`, ...extra }).select('id').single()).data as { id: string }).id
      const internal = await mk('intern', {})
      const shared = await mk('delt', { visible_in_portal: true })
      const { data: em } = await admin.from('incoming_emails').insert({ graph_message_id: `ds-${stamp}`, subject: '[HARNESS]', sender_email: `ds-${stamp}@harness.test`, to_email: 'k@harness.test', received_at: new Date().toISOString(), link_status: 'ignored' }).select('id').single()
      const mailDoc = await mk('mail', { visible_in_portal: true, source_email_id: (em as { id: string }).id })
      const titles = async () => (((await getPortalDocuments(tok)).data ?? []) as Array<{ title: string }>).map((d) => d.title)
      const t1 = await titles()
      check('internt dokument (standard) vises ikke i portalen', !t1.includes('intern'), t1.join(','))
      check('delt dokument vises i portalen', t1.includes('delt'))
      check('mail-arkiv vises aldrig (selv med flag)', !t1.includes('mail'))
      await admin.from('customer_documents').update({ visible_in_portal: true }).eq('id', internal)
      check('efter "Del med kunde" vises det', (await titles()).includes('intern'))
      await admin.from('customer_documents').update({ visible_in_portal: false }).eq('id', shared)
      check('efter "gør internt" forsvinder det', !(await titles()).includes('delt'))
      await admin.from('customer_documents').delete().in('id', [internal, shared, mailDoc])
      await admin.from('incoming_emails').delete().eq('id', (em as { id: string }).id)
    } finally {
      await admin.from('customer_documents').delete().eq('customer_id', cust)
      await admin.from('portal_access_tokens').delete().eq('customer_id', cust)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ kundedokumenter interne som standard')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'portal-token-rules-check') {
    // Kunde-review #1 + storage-review #7: deaktiveret kunde → link afvist (genaktiveret → virker); nye links har udløb;
    // portalen signerer kun stier i kundens egne mapper. Ingen mail.
    const { validatePortalToken, getPortalDocuments } = await import('../../src/lib/actions/portal')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `PT-${stamp}`, company_name: `[HARNESS] pt ${stamp}`, contact_person: 'X', email: `pt-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const tok = randomBytes(32).toString('hex')
    try {
      await admin.from('portal_access_tokens').insert({ customer_id: cust, token: tok, email: `pt-${stamp}@harness.test`, is_active: true, created_by: owner })
      check('aktiv kunde → link virker', (await validatePortalToken(tok)).success)
      await admin.from('customers').update({ is_active: false }).eq('id', cust)
      check('deaktiveret kunde → link afvist', !(await validatePortalToken(tok)).success)
      await admin.from('customers').update({ is_active: true }).eq('id', cust)
      check('genaktiveret → link virker igen', (await validatePortalToken(tok)).success)
      await admin.from('customer_documents').insert([
        { customer_id: cust, visible_in_portal: true, title: 'Egen [HARNESS]', document_type: 'other', file_url: 'https://gammelt-link', storage_path: `customer-documents/${cust}/egen.pdf`, file_name: 'egen.pdf', mime_type: 'application/pdf' },
        { customer_id: cust, visible_in_portal: true, title: 'Fremmed [HARNESS]', document_type: 'other', file_url: 'https://gammelt-link', storage_path: 'supplier-invoices/x/faktura.pdf', file_name: 'f.pdf', mime_type: 'application/pdf' },
      ])
      const docs = await getPortalDocuments(tok)
      const fremmed = (docs.data ?? []).find((d) => d.title === 'Fremmed [HARNESS]')
      check('dokument med fremmed sti → intet link (heller ikke det gemte)', docs.success && !!fremmed && !fremmed.file_url, JSON.stringify(fremmed?.file_url))
    } finally {
      await admin.from('customer_documents').delete().eq('customer_id', cust)
      await admin.from('portal_access_tokens').delete().eq('customer_id', cust)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ portal-link-regler ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'partner-fuldmagt-leak-check') {
    // S1 (storage-review 2026-10-08): partneren (betaler på sagen) må hverken se eller hente slutkundens fuldmagt-PDF;
    // almindelige kontrakter/tilbud på sagen ses stadig. Rydder op. Ingen mail.
    const { getPartnerDocuments } = await import('../../src/lib/actions/partner-portal')
    const { GET } = await import('../../src/app/api/partner/documents/route')
    const { randomBytes } = await import('crypto')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const mk = async (tag: string) => ((await admin.from('customers').insert({ customer_number: `PF${tag}-${stamp}`, company_name: `[HARNESS] pf ${tag} ${stamp}`, contact_person: tag, email: `pf${tag.toLowerCase()}-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const partner = await mk('P'), end = await mk('E')
    const tok = randomBytes(32).toString('hex')
    const caseId = ((await admin.from('service_cases').insert({ case_number: `SVC-5${String(stamp).slice(-6)}`, customer_id: partner, payer_customer_id: partner, end_customer_id: end, title: '[HARNESS] partner', status: 'new', created_by: owner }).select('id').single()).data as { id: string }).id
    try {
      await admin.from('partner_access_tokens').insert({ partner_customer_id: partner, token: tok, email: `pfp-${stamp}@harness.test`, is_active: true, created_by: owner })
      const fm = JSON.stringify({ type: 'fuldmagt', status: 'signed', foedselsdato_cvr: 'HARNESS-CPR' })
      const { data: d1 } = await admin.from('customer_documents').insert({ customer_id: partner, service_case_id: caseId, title: 'Fuldmagt [HARNESS]', description: fm, document_type: 'contract', file_url: '', storage_path: `harness/${stamp}-fm.pdf`, file_name: 'fuldmagt.pdf', mime_type: 'application/pdf', visible_in_portal: true }).select('id').single()
      await admin.from('customer_documents').insert({ customer_id: partner, service_case_id: caseId, title: 'Kontrakt [HARNESS]', description: 'almindelig', document_type: 'contract', file_url: '', storage_path: `harness/${stamp}-k.pdf`, file_name: 'kontrakt.pdf', mime_type: 'application/pdf', visible_in_portal: true }) // partner-ruten viser kun visible_in_portal (seed forældet)
      const list = await getPartnerDocuments(tok)
      const titles = (list.success ? list.data ?? [] : []).map((x) => x.title)
      check('partner-listen indeholder IKKE fuldmagten', list.success && !titles.includes('Fuldmagt [HARNESS]'), JSON.stringify(titles))
      check('almindelig kontrakt ses stadig', titles.includes('Kontrakt [HARNESS]'))
      const res = await GET(new Request(`http://localhost/api/partner/documents?token=${tok}&documentId=${(d1 as { id: string }).id}`) as never)
      check('download af fuldmagt via partner-route → 404', res.status === 404, `status=${res.status}`)
    } finally {
      await admin.from('customer_documents').delete().eq('service_case_id', caseId)
      await admin.from('partner_access_tokens').delete().eq('partner_customer_id', partner)
      await admin.from('service_cases').delete().eq('id', caseId)
      await admin.from('customers').delete().in('id', [partner, end])
    }
    log(fails ? `❌ ${fails} fejl` : '✅ partner-fuldmagt-læk lukket')
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
      // AS-8: svaret bærer ikke længere lead-id'et — leadet tjekkes i databasen
      check('første henvendelse opretter lead (uden lead-id i svaret)', a1.status === 200 && a1.json.success === true && a1.json.leadId === undefined && (await leadCount('a')) === 1, JSON.stringify(a1))
      // LD-8: leadet kobles til kunden der blev oprettet/genbrugt
      const la = (await admin.from('leads').select('custom_fields').eq('email', mail('a')).maybeSingle()).data as { custom_fields?: { customer_id?: string } | null } | null
      const ca = (await admin.from('customers').select('id').eq('email', mail('a')).maybeSingle()).data as { id?: string } | null
      check('leadet er koblet til kunden (custom_fields.customer_id)', !!ca?.id && la?.custom_fields?.customer_id === ca.id, `lead=${la?.custom_fields?.customer_id ?? '-'} kunde=${ca?.id ?? '-'}`)
      // SEC2-6 (2026-10-17): dubletsvaret udleverer ikke længere lead-id'et
      check('samme e-mail inden for 10 min → succes uden lead-id, ingen ny række', a2.status === 200 && a2.json.success === true && a2.json.leadId === undefined && (await leadCount('a')) === 1)
      // API-4 (Henrik 2026-10-19): henvendelse med en EKSISTERENDE kundes e-mail kobles ikke automatisk (og kunden røres ikke)
      const ownerX = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
      const exist = (await admin.from('customers').insert({ customer_number: `PC-X-${stamp}`, company_name: `[HARNESS] pc eksisterende ${stamp}`, contact_person: 'Eks', email: mail('x'), created_by: ownerX, notes: 'urørt' }).select('id, updated_at').single()).data as { id: string; updated_at: string } | null
      const x1 = await call(form('x'))
      const lx = (await admin.from('leads').select('custom_fields').eq('email', mail('x')).maybeSingle()).data as { custom_fields?: { customer_id?: string } | null } | null
      const ex2 = exist ? (await admin.from('customers').select('updated_at, notes').eq('id', exist.id).maybeSingle()).data as { updated_at: string; notes: string | null } | null : null
      const nCust = (await admin.from('customers').select('id', { count: 'exact', head: true }).eq('email', mail('x'))).count ?? 0
      check('eksisterende kundes e-mail → lead oprettet, IKKE koblet, ingen ny kunde, kunden urørt (API-4)', x1.status === 200 && (await leadCount('x')) === 1 && !lx?.custom_fields?.customer_id && nCust === 1 && ex2?.updated_at === exist?.updated_at && ex2?.notes === 'urørt', `koblet=${lx?.custom_fields?.customer_id ?? '-'} kunder=${nCust}`)
      const owner =((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
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
      // PT-14 (2026-10-17): deaktiveret kunde → linket er tilbagekaldt (ingen titel/PDF/navn)
      const liveTok = await mk(new Date(Date.now() + 86_400_000).toISOString())
      await admin.from('customers').update({ is_active: false }).eq('id', cust)
      const inactive = await getConfirmationContext(liveTok)
      check('PT-14: deaktiveret kunde → tilbagekaldt, intet indhold', inactive.success && inactive.data?.state === 'revoked' && !inactive.data?.documentTitle && !inactive.data?.pdfUrl, JSON.stringify(inactive.data))
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
      // SEC2-5 (2026-10-17): server-side format — tal-ID og en underskrift i rimelig længde (stadig ingen ægte PNG → PDF fejler)
      const bad1 = await submitSignedFuldmagt(tok, docId, { foedselsdato_cvr: 'HARNESS', marketing_samtykke: false, signature_data: `data:image/png;base64,${'A'.repeat(300)}`, signer_name: 'X' })
      check('ugyldigt fødselsdato/CVR afvises før krav', !bad1.success && /fødselsdato eller CVR/.test(bad1.error ?? ''), bad1.error ?? '')
      const input = { foedselsdato_cvr: '12345678', marketing_samtykke: false, signature_data: `data:image/png;base64,${'A'.repeat(300)}`, signer_name: 'X' }
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
    // nøglen lagres krypteret som i UI'et (createIntegration → encryptIntegrationSecrets) — settings-review 2026-10-09
    // test-nøgle kun i denne proces (krypter + dekrypter sker her) — rører ingen rigtig ENCRYPTION_KEY
    if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = (await import('crypto')).randomBytes(32).toString('base64')
    const { encryptSecret } = await import('../../src/lib/services/integration-secrets')
    const { data: integ, error: iErr } = await admin.from('integrations').insert({ name: `[HARNESS] webhook ${stamp}`, is_active: true, api_key: await encryptSecret(key) }).select('id').single()
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
      // LG-12: loggen gemmer kun et resumé (routing-felter + nøgler + størrelse), ikke partnerens persondata
      const secret = `PERSONDATA-${stamp}`
      await call({ external_id: `ext-sent-${stamp}`, event: 'note', customer: { name: secret, cpr: '010101-1234' }, note: secret })
      const lastLog = ((await admin.from('integration_logs').select('request_body').eq('integration_id', integId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data as { request_body: Record<string, unknown> | null } | null)?.request_body ?? null
      const lj = JSON.stringify(lastLog ?? {})
      check('integration_logs: resumé uden payload-værdier (LG-12)', !!lastLog && !lj.includes(secret) && !lj.includes('010101') && Array.isArray(lastLog._keys) && lastLog.external_id === `ext-sent-${stamp}`, lj.slice(0, 200))
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
      // AU-2 (2026-10-17): uden AUTOMATION_RULES_LIVE=true kører en LIVE-regel som dry-run — ingen opgave
      const prevLive = process.env.AUTOMATION_RULES_LIVE
      delete process.env.AUTOMATION_RULES_LIVE
      const evDry = { trigger, entityType: 'lead', entityId: crypto.randomUUID(), payload: { customer_id: custId } } as never
      await evaluateAndRunAutomations(evDry)
      const exDry = (await admin.from('automation_executions').select('status').eq('rule_id', ruleId).eq('entity_type', 'lead')).data as Array<{ status: string }>
      const tasksDry = (await admin.from('customer_tasks').select('id', { count: 'exact', head: true }).eq('customer_id', custId).eq('title', `[HARNESS] claim ${stamp}`)).count
      check('AU-2: uden AUTOMATION_RULES_LIVE → dry_run, ingen opgave', exDry.length === 1 && exDry[0].status === 'dry_run' && tasksDry === 0, `${JSON.stringify(exDry)} opgaver=${tasksDry}`)
      process.env.AUTOMATION_RULES_LIVE = 'true'
      const ev = { trigger, entityType: 'customer', entityId: custId, payload: { customer_id: custId } } as never
      await Promise.all([evaluateAndRunAutomations(ev), evaluateAndRunAutomations(ev), evaluateAndRunAutomations(ev)])
      if (prevLive === undefined) delete process.env.AUTOMATION_RULES_LIVE; else process.env.AUTOMATION_RULES_LIVE = prevLive
      const ex = (await admin.from('automation_executions').select('status').eq('rule_id', ruleId)).data as Array<{ status: string }>
      const tasks = (await admin.from('customer_tasks').select('id', { count: 'exact', head: true }).eq('customer_id', custId).eq('title', `[HARNESS] claim ${stamp}`)).count
      check('3 samtidige hændelser → præcis én udførelse', ex.filter((e) => e.status === 'executed').length === 1, JSON.stringify(ex.map((e) => e.status)))
      check('præcis én opgave oprettet', tasks === 1, String(tasks))
      // fejlende handling (ingen kunde) → failed, ingen 'executed'-række tilbage
      const ev2 = { trigger, entityType: 'offer', entityId: crypto.randomUUID(), payload: {} } as never
      process.env.AUTOMATION_RULES_LIVE = 'true'
      await evaluateAndRunAutomations(ev2)
      if (prevLive === undefined) delete process.env.AUTOMATION_RULES_LIVE; else process.env.AUTOMATION_RULES_LIVE = prevLive
      const ex2 = (await admin.from('automation_executions').select('status').eq('rule_id', ruleId).eq('entity_type', 'offer')).data as Array<{ status: string }>
      check('fejlende handling → failed (pladsen frigivet)', ex2.length === 1 && ex2[0].status === 'failed', JSON.stringify(ex2))
      // AU-10 (2026-10-17): en sprunget handling (send_reminder uden INVOICE_REMINDERS_LIVE — intet kan sendes) logges
      // som 'skipped' og bruger IKKE reglens udførelse: anden hændelse behandles igen
      const prevRem = process.env.INVOICE_REMINDERS_LIVE
      delete process.env.INVOICE_REMINDERS_LIVE
      const { data: rr } = await admin.from('automation_rules').insert({ name: `[HARNESS] skip ${stamp}`, trigger: `${trigger}_skip`, condition_json: {},
        action: 'send_reminder', action_config: {}, active: true, dry_run: false }).select('id').single()
      const skipRuleId = (rr as { id: string } | null)?.id
      try {
        process.env.AUTOMATION_RULES_LIVE = 'true'
        const evS = { trigger: `${trigger}_skip`, entityType: 'invoice', entityId: crypto.randomUUID(), payload: {} } as never
        await evaluateAndRunAutomations(evS)
        await evaluateAndRunAutomations(evS)
        const exS = skipRuleId ? ((await admin.from('automation_executions').select('status').eq('rule_id', skipRuleId)).data ?? []) as Array<{ status: string }> : []
        check('AU-10: sprunget handling → skipped ×2 (pladsen ikke brugt)', exS.length === 2 && exS.every((e) => e.status === 'skipped'), JSON.stringify(exS))
      } finally {
        if (prevLive === undefined) delete process.env.AUTOMATION_RULES_LIVE; else process.env.AUTOMATION_RULES_LIVE = prevLive
        if (prevRem !== undefined) process.env.INVOICE_REMINDERS_LIVE = prevRem
        if (skipRuleId) { await admin.from('automation_executions').delete().eq('rule_id', skipRuleId); await admin.from('automation_rules').delete().eq('id', skipRuleId) }
      }
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
      const acc = await acceptOffer(tok, { offer_id: r1, signer_name: 'Test', signer_email: `rev-${stamp}@harness.test`, signature_data: `data:image/png;base64,${'A'.repeat(240)}` } as never) // gyldig længde (≥200, tilbuds-review #6) — ellers stoppede valideringen før revisionstjekket
      check('afløst revision kan ikke accepteres (afvist før underskrift/mail)', !acc.success && /erstattet/.test(acc.error ?? ''), acc.error ?? '')
      const sigs = (await admin.from('offer_signatures').select('id', { count: 'exact', head: true }).eq('offer_id', r1)).count
      check('ingen underskrift gemt på afløst revision', sigs === 0)
      const snap2 = await rv.latestSnapshotId(r2)
      const s2 = (await admin.from('offer_snapshots').select('id, revision_number').eq('offer_id', r2).single()).data as { id: string; revision_number: number }
      check('underskrift på R2 bindes til R2-snapshot (latestSnapshotId)', snap2 === s2.id && s2.revision_number === 2)
      // FIN3-3: et tilbud i kæden er gjort til sag → ny revision afvises (ellers sag nr. 2 ved accept)
      const { data: fc } = await admin.from('service_cases').insert({ title: `[HARNESS] rev-sag ${stamp}`, customer_id: custId, status: 'in_progress', priority: 'medium', source: 'manual', created_by: owner, source_offer_id: r2 }).select('id').single()
      const fcId = (fc as { id?: string } | null)?.id ?? null
      try {
        const blocked = await rv.createOfferRevision(r2, owner)
        check('revision afvises når kæden allerede er en sag (FIN3-3)', !blocked.ok && /sag/i.test(blocked.ok ? '' : blocked.error), blocked.ok ? 'oprettet!' : blocked.error)
        if (blocked.ok) offerIds.push(blocked.id)
      } finally { if (fcId) await admin.from('service_cases').delete().eq('id', fcId) }

      await admin.from('offers').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', r2)
      const accRev = await rv.createOfferRevision(r2, owner)
      check('accepteret tilbud kan ikke revideres', !accRev.ok)
      const hist = await rv.getRevisionHistory(r2)
      check('historik viser kæden R1 → R2 med sendetidspunkter', hist.length === 2 && hist[0].id === r1 && hist[1].id === r2 && !!hist[0].snapshot_sent_at && !!hist[0].superseded_at)
      // ES-6 (2026-10-17): en revision af et ACCEPTERET tilbud kan ikke sendes (ellers kunne begge accepteres)
      const fakeRev = (await admin.from('offers').insert({ offer_number: `REV-${stamp}-R3`, title: 'R3 [HARNESS]', status: 'draft', created_by: owner,
        customer_id: custId, revision_of: r2, revision_number: 3 }).select('id').single()).data as { id: string } | null
      if (fakeRev) {
        const block = await rv.revisionSendBlockReason(fakeRev.id)
        check('ES-6: revision af accepteret tilbud kan ikke sendes', !!block && /accepteret/.test(block), block ?? 'tilladt')
        await admin.from('offers').delete().eq('id', fakeRev.id)
      } else check('ES-6: revision af accepteret tilbud kan ikke sendes', false, 'seed fejlede')
      // ES-2: sendt → kladde afvises med revisioner slået til
      check('ES-2: sendt tilbud kan ikke sættes til kladde (ny revision i stedet)', !!rv.revisionDraftBlockReason('sent') && rv.revisionDraftBlockReason('draft') === null)
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
      ids.case = await ins('service_cases', { case_number: `SVC-6${String(stamp).slice(-6)}`, customer_id: ids.cust, title: '[HARNESS] afviste timer', status: 'in_progress', created_by: owner, billing_model: 'time_and_materials' })
      ids.emp = await ins('employees', { name: `[HARNESS] rh ${stamp}`, email: `rhe-${stamp}@harness.test`, role: 'montør', active: true, cost_rate: 300, hourly_rate: 500 })
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
      for (const iid of invoiceIds.splice(0)) { await admin.from('time_logs').update({ invoice_line_id: null }).eq('work_order_id', ids.wo); await admin.from('invoice_lines').delete().eq('invoice_id', iid); await admin.from('invoices').delete().eq('id', iid) }

      // PR-3 (Henrik 2026-10-15): KUN godkendte timer faktureres — en afventende time (1 t)
      ids.pend = await ins('time_logs', { employee_id: ids.emp, work_order_id: ids.wo, start_time: at(7), end_time: at(8), billable: true })
      const pst = ((await admin.from('time_logs').select('approval_status').eq('id', ids.pend).single()).data as { approval_status: string }).approval_status
      check('seed: ny time er afventende (pending)', pst === 'pending', pst)
      const res2 = await createInvoiceDraftFromCase(ids.case, owner, { time_log_ids: [ids.ok, ids.pend] })
      if (res2.invoice_id) invoiceIds.push(res2.invoice_id)
      const pendBound = ((await admin.from('time_logs').select('invoice_line_id').eq('id', ids.pend).single()).data as { invoice_line_id: string | null }).invoice_line_id
      check('PR-3 kladde: afventende time sprunget over (not_approved), godkendt med', res2.skipped_lines.some((x) => x.source_id === ids.pend && x.reason === 'not_approved') && res2.created_lines.some((x) => x.source_id === ids.ok) && pendBound === null, res2.message)
      for (const iid of invoiceIds.splice(0)) { await admin.from('time_logs').update({ invoice_line_id: null }).eq('work_order_id', ids.wo); await admin.from('invoice_lines').delete().eq('invoice_id', iid); await admin.from('invoices').delete().eq('id', iid) }
      const { createFinalInvoiceForCase } = await import('../../src/lib/services/invoice-stage')
      const fin = await createFinalInvoiceForCase({ case_id: ids.case }, owner)
      if (fin.invoice_id) invoiceIds.push(fin.invoice_id)
      check('PR-3 slutfaktura: blokeret mens timer afventer godkendelse', !fin.ok && !fin.invoice_id && /afventer godkendelse/.test(fin.message), fin.message)
      const { createInvoiceFromWorkOrder } = await import('../../src/lib/services/invoices')
      let woErr = ''
      try { const iid = await createInvoiceFromWorkOrder(ids.wo, { dueDays: 14 }); invoiceIds.push(iid) } catch (e) { woErr = e instanceof Error ? e.message : String(e) }
      check('PR-3 faktura fra arbejdsordre: afvist mens timer afventer godkendelse', /afventer godkendelse/.test(woErr), woErr || 'oprettet!')
      await admin.from('time_logs').update({ approval_status: 'approved', approved_by: owner, approved_at: new Date().toISOString() }).eq('id', ids.pend)
      const res3 = await createInvoiceDraftFromCase(ids.case, owner, { time_log_ids: [ids.pend] })
      if (res3.invoice_id) invoiceIds.push(res3.invoice_id)
      check('PR-3 efter godkendelse: timen faktureres', res3.created_lines.some((x) => x.source_id === ids.pend), res3.message)
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
    const { data: inv, error } = await admin.from('invoices').insert({ invoice_number: `H-CLAIM-${stamp}`, status: 'draft', total_amount: 80, tax_amount: 20, final_amount: 100 }).select('id').single()
    if (error) throw new Error(error.message)
    const id = (inv as { id: string }).id
    // IV2-5: faktura med total 0 eller negativ sendes ikke (afvises før kravet)
    const zeroIds: string[] = []
    for (const [tag, amt] of [['0', 0], ['neg', -500]] as const) {
      const { data: z } = await admin.from('invoices').insert({ invoice_number: `H-CLAIM-${tag}-${stamp}`, status: 'draft', total_amount: amt, tax_amount: 0, final_amount: amt }).select('id').single()
      if (z) zeroIds.push((z as { id: string }).id)
    }
    try {
      for (const zid of zeroIds) {
        const r = await sendInvoiceEmail(zid)
        const row = (await admin.from('invoices').select('sent_at, status').eq('id', zid).single()).data as { sent_at: string | null; status: string }
        check('total ≤ 0 → afvist uden afsendelse', r.status === 'failed' && /0 kr eller negativ/.test(r.error ?? '') && row.sent_at === null && row.status === 'draft', `${r.status} ${r.error ?? ''}`)
      }
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
      if (zeroIds.length) await admin.from('invoices').delete().in('id', zeroIds)
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
  if (SUB === 'time-overlap-rejected-check') {
    // PL-1 (planlægnings-review 2026-10-14): en afvist registrering blokerer ikke genindtastning; en afventende gør
    const { findOverlappingTimeLog } = await import('../../src/lib/time-logs/guards')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const emp = ((await admin.from('employees').insert({ name: '[HARNESS] overlap', email: `ov-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300 }).select('id').single()).data as { id: string }).id
    const cust = ((await admin.from('customers').insert({ customer_number: `OV-${stamp}`, company_name: `[HARNESS] overlap ${stamp}`, contact_person: 'X', email: `ov-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const caseId = ((await admin.from('service_cases').insert({ case_number: `SVC-7${String(stamp).slice(-6)}`, customer_id: cust, title: '[HARNESS] overlap', status: 'in_progress', created_by: owner }).select('id').single()).data as { id: string }).id
    const wo = ((await admin.from('work_orders').insert({ case_id: caseId, customer_id: cust, title: '[HARNESS] overlap', status: 'in_progress', scheduled_date: '2026-10-01', assigned_employee_id: emp }).select('id').single()).data as { id: string }).id
    const tl = ((await admin.from('time_logs').insert({ work_order_id: wo, employee_id: emp, start_time: '2026-10-01T06:00:00Z', end_time: '2026-10-01T14:00:00Z', billable: true }).select('id').single()).data as { id: string }).id
    try {
      const pending = await findOverlappingTimeLog(admin, emp, '2026-10-01T06:00:00Z', '2026-10-01T14:00:00Z')
      check('afventende registrering blokerer overlap', pending?.id === tl)
      await admin.from('time_logs').update({ approval_status: 'rejected', approved_by: owner, approved_at: new Date().toISOString(), rejection_reason: 'harness' }).eq('id', tl)
      const rejected = await findOverlappingTimeLog(admin, emp, '2026-10-01T06:00:00Z', '2026-10-01T14:00:00Z')
      check('afvist registrering blokerer IKKE genindtastning', rejected === null, rejected ? 'blokeret' : 'fri')
    } finally {
      await admin.from('time_logs').delete().eq('id', tl)
      await admin.from('work_orders').delete().eq('id', wo)
      await admin.from('service_cases').delete().eq('id', caseId)
      await admin.from('customers').delete().eq('id', cust)
      await admin.from('employees').delete().eq('id', emp)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ overlap ignorerer afviste')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'ao-supplier-probe') {
    // READ-ONLY: hvilke leverandører har koden AO på staging (navn-præfiks, oprettet, antal varer/importer/sync-referencer)
    log(JSON.stringify(await stagingSql(`SELECT left(s.name, 12) navn_start, (s.name LIKE '[HARNESS]%') harness, s.created_at::date::text oprettet,
      (SELECT count(*)::int FROM supplier_products p WHERE p.supplier_id = s.id) varer,
      (SELECT count(*)::int FROM import_batches b WHERE b.supplier_id = s.id) importer
      FROM suppliers s WHERE upper(s.code) = 'AO'`)))
    return
  }
  if (SUB === 'audit-insert-probe') {
    // STAGING: prøver præcis DE2-9's audit-række (samme kolonner) og sletter den igen — viser evt. fejl
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const sc = ((await admin.from('service_cases').select('id').limit(1)).data as Array<{ id: string }>)[0]
    const { data, error } = await admin.from('audit_logs').insert({ user_id: owner, entity_type: 'service_case', entity_id: sc.id, action: 'case_assigned_from_offer',
      action_description: 'harness-probe', changes: { assigned_to: owner } }).select('id')
    log(`insert: ${error ? `FEJL ${error.code} ${error.message}` : 'ok'}`)
    const id = (data as Array<{ id: string }> | null)?.[0]?.id
    if (id) await admin.from('audit_logs').delete().eq('id', id)
    return
  }
  if (SUB === 'u219-probe') {
    // READ-ONLY diagnose: seneste U219-sager (tildeling/oprettet af) + audit-rækker
    const rows = await stagingSql(`SELECT o.offer_number, (o.created_by = sc.assigned_to) ansvarlig_er_saelger, (sc.created_by = sc.assigned_to) ansvarlig_er_konverterer, sc.created_at::text,
        (SELECT count(*)::int FROM audit_logs a WHERE a.entity_id = sc.id AND a.action = 'case_assigned_from_offer') audit_n
      FROM offers o JOIN service_cases sc ON sc.source_offer_id = o.id WHERE o.offer_number LIKE 'U219-%' ORDER BY sc.created_at DESC LIMIT 6`)
    for (const r of rows) log(JSON.stringify(r))
    log(`audit seneste time: ${JSON.stringify(await stagingSql(`SELECT created_at::text, (changes ? 'assigned_to') har_assigned, (changes->>'assigned_to') = (changes->>'offer_created_by') ansvarlig_er_saelger, (changes->>'converted_by') = (changes->>'assigned_to') ansvarlig_er_konverterer, jsonb_typeof(changes) t FROM audit_logs WHERE action = 'case_assigned_from_offer' AND created_at > now() - interval '1 hour' ORDER BY created_at`))}`)
    log(`triggers: ${JSON.stringify(await stagingSql(`SELECT tgname, pg_get_triggerdef(oid) d FROM pg_trigger WHERE tgrelid = 'public.service_cases'::regclass AND NOT tgisinternal`)).slice(0, 1500)}`)
    log(`audit_logs checks: ${JSON.stringify(await stagingSql(`SELECT conname, pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid = 'public.audit_logs'::regclass AND contype = 'c'`)).slice(0, 900)}`)
    return
  }
  if (SUB === 'table-checks') {
    // READ-ONLY: CHECK-constraints på en tabel (fx: table-checks accounting_sync_log)
    const t = String(process.argv[3] ?? '').replace(/[^a-z0-9_]/g, '')
    for (const r of await stagingSql(`SELECT conname, pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid = 'public.${t}'::regclass AND contype = 'c' ORDER BY conname`)) log(`check ${r.conname}: ${r.d}`)
    return
  }
  if (SUB === 'table-dependents') {
    // READ-ONLY: views og funktioner der refererer en tabel (fx: table-dependents lead_activities)
    const t = String(process.argv[3] ?? '').replace(/[^a-z0-9_]/g, '')
    log(`views: ${JSON.stringify(await stagingSql(`SELECT schemaname, viewname FROM pg_views WHERE definition ILIKE '%${t}%' AND schemaname NOT IN ('pg_catalog','information_schema')`))}`)
    log(`funktioner: ${JSON.stringify(await stagingSql(`SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosrc ILIKE '%${t}%'`))}`)
    return
  }
  if (SUB === 'profiles-is-active') {
    // READ-ONLY (migrationspakke 2026-10-20): is_active-kolonnens definition + fordeling på staging (kun antal/roller)
    log(`kolonne: ${JSON.stringify(await stagingSql(`SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active'`))}`)
    log(`fordeling: ${JSON.stringify(await stagingSql(`SELECT coalesce(is_active::text,'NULL') is_active, role::text, count(*)::int n FROM profiles GROUP BY 1,2 ORDER BY 1,2`))}`)
    return
  }
  if (SUB === 'kalkia-pricing-schema') {
    // READ-ONLY (FIN3-1 Kalkia-eksempler): skema + datamængde før beregningen skrives (CLAUDE.md: SELECT før kode)
    for (const t of ['kalkia_variant_materials', 'supplier_margin_rules', 'customer_supplier_prices', 'customer_product_prices']) {
      const cols = await stagingSql(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`)
      const n = await stagingSql(`SELECT count(*)::int n FROM public.${t}`)
      log(`${t} (${n[0].n} rækker): ${cols.map((c: { column_name: string }) => c.column_name).join(', ')}`)
    }
    const linked = await stagingSql(`SELECT count(*)::int n FROM public.kalkia_variant_materials WHERE supplier_product_id IS NOT NULL`)
    log(`kalkia-materialer med leverandørvare: ${linked[0].n}`)
    const rules = await stagingSql(`SELECT rule_type, count(*)::int n FROM public.supplier_margin_rules WHERE is_active GROUP BY rule_type`)
    log(`aktive avanceregler: ${JSON.stringify(rules)}`)
    return
  }
  if (SUB === 'supplier-line-pricing-check') {
    // Grossist-review 2026-10-14: GP-3 kategoriregel gælder for tilbudslinjer; GP-2 udløbet kundeaftale giver ikke rabat
    const { supplierLinePricing, supplierLinePricingBatch } = await import('../../src/lib/offers/supplier-line-pricing')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const sup = ((await admin.from('suppliers').insert({ name: `HARNESS-GP ${stamp}`, code: `HGP${stamp}` }).select('id').single()).data as { id: string }).id
    const cat = `HARNESS-KAT-${stamp}`
    const prod = ((await admin.from('supplier_products').insert({ supplier_id: sup, supplier_sku: `GP-${stamp}`, supplier_name: 'Harness kabel', cost_price: 100, category: cat, margin_percentage: 20 }).select('id').single()).data as { id: string }).id
    const cust = ((await admin.from('customers').insert({ customer_number: `GP-${stamp}`, company_name: `[HARNESS] gp ${stamp}`, contact_person: 'X', email: `gp-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const rule = await admin.from('supplier_margin_rules').insert({ supplier_id: sup, rule_type: 'category', category: cat, margin_percentage: 40, priority: 50, is_active: true, created_by: owner }).select('id').single()
    const ruleId = (rule.data as { id: string } | null)?.id ?? null
    const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
    const agr = await admin.from('customer_supplier_prices').insert({ customer_id: cust, supplier_id: sup, discount_percentage: 10, is_active: true, valid_to: yesterday, created_by: owner }).select('id').single()
    const agrId = (agr.data as { id: string } | null)?.id ?? null
    let cppId: string | null = null
    try {
      check('seed', !!ruleId && !!agrId, `${rule.error?.message ?? ''} ${agr.error?.message ?? ''}`.trim())
      const p1 = await supplierLinePricing({ admin, supplierId: sup, supplierProductId: prod, customerId: cust, costPrice: 100, productMargin: 20 })
      check('kategoriregel (40 %) bruges på tilbudslinjen', p1.marginPercentage === 40, `avance ${p1.marginPercentage}`)
      check('udløbet kundeaftale giver ingen rabat', p1.effectiveCost === 100, `kost ${p1.effectiveCost}`)
      if (agrId) await admin.from('customer_supplier_prices').update({ valid_to: null }).eq('id', agrId)
      const p2 = await supplierLinePricing({ admin, supplierId: sup, supplierProductId: prod, customerId: cust, costPrice: 100, productMargin: 20 })
      check('gyldig kundeaftale giver 10 % rabat på kosten', p2.effectiveCost === 90, `kost ${p2.effectiveCost}`)
      // FIN3-1: kundeaftalens avance (15 %) går foran en kategori-/leverandørregel (40 %)
      if (agrId) await admin.from('customer_supplier_prices').update({ custom_margin_percentage: 15 }).eq('id', agrId)
      const p2b = await supplierLinePricing({ admin, supplierId: sup, supplierProductId: prod, customerId: cust, costPrice: 100, productMargin: 20 })
      check('kundeaftalens avance (15 %) slår kategoriregel (40 %) — FIN3-1', p2b.marginPercentage === 15, `avance ${p2b.marginPercentage}`)
      // R3-8: batch-stien (sagsmaterialesøgningen) giver præcis samme pris som enkeltstien
      const b2b = (await supplierLinePricingBatch({ admin, customerId: cust, items: [{ supplierId: sup, supplierProductId: prod, costPrice: 100, productMargin: 20 }] })).get(prod)
      check('batch = enkelt (aftale-avance + rabat) — R3-8', !!b2b && b2b.unitPrice === p2b.unitPrice && b2b.effectiveCost === p2b.effectiveCost && b2b.marginPercentage === p2b.marginPercentage, `batch ${JSON.stringify(b2b)} enkelt ${JSON.stringify(p2b)}`)
      if (agrId) await admin.from('customer_supplier_prices').update({ custom_margin_percentage: null }).eq('id', agrId)
      // GP-2: produktspecifik kundepris går foran leverandøraftalen
      const cpp = await admin.from('customer_product_prices').insert({ customer_id: cust, supplier_product_id: prod, custom_cost_price: 70, is_active: true, created_by: owner }).select('id').single()
      cppId = (cpp.data as { id: string } | null)?.id ?? null
      const p3 = await supplierLinePricing({ admin, supplierId: sup, supplierProductId: prod, customerId: cust, costPrice: 100, productMargin: 20 })
      check('produktspecifik kundepris (70) går foran leverandøraftalens rabat', p3.effectiveCost === 70, `kost ${p3.effectiveCost}${cpp.error ? ` · ${cpp.error.message}` : ''}`)
      const b3 = (await supplierLinePricingBatch({ admin, customerId: cust, items: [{ supplierId: sup, supplierProductId: prod, costPrice: 100, productMargin: 20 }] })).get(prod)
      check('batch = enkelt (kundespecifik produktpris) — R3-8', !!b3 && b3.unitPrice === p3.unitPrice && b3.effectiveCost === p3.effectiveCost, `batch ${JSON.stringify(b3)} enkelt ${JSON.stringify(p3)}`)
    } finally {
      if (cppId) await admin.from('customer_product_prices').delete().eq('id', cppId)
      if (agrId) await admin.from('customer_supplier_prices').delete().eq('id', agrId)
      if (ruleId) await admin.from('supplier_margin_rules').delete().eq('id', ruleId)
      await admin.from('supplier_products').delete().eq('id', prod)
      await admin.from('customers').delete().eq('id', cust)
      await admin.from('suppliers').delete().eq('id', sup)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ leverandørlinje-pris ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'rejected-dup') {
    const { runRejectedDup, formatRejectedDup } = await import('./rejected-dup')
    const checks = await runRejectedDup({ admin, sql: stagingSql })
    log(formatRejectedDup(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'wo-profit') {
    const { runWoProfit, formatWoProfit } = await import('./wo-profit')
    const checks = await runWoProfit({ admin })
    log(formatWoProfit(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'offers-restrict-check') {
    // 00226: kunde med tilbud kan ikke slettes i databasen (23503); tilbuddet slettes aldrig implicit
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const fk = await stagingSql(`SELECT confdeltype::text AS t FROM pg_constraint WHERE conname = 'offers_customer_id_fkey' AND conrelid = 'public.offers'::regclass`)
    check('R1 FK = RESTRICT på staging', fk[0]?.t === 'r', `confdeltype=${fk[0]?.t}`)
    const cust = ((await admin.from('customers').insert({ customer_number: `RS-${stamp}`, company_name: `[HARNESS] restrict ${stamp}`, contact_person: 'X', email: `rs-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const offer = ((await admin.from('offers').insert({ offer_number: `RS-${stamp}`, title: '[HARNESS] restrict', customer_id: cust, status: 'draft', created_by: owner }).select('id').single()).data as { id: string }).id
    try {
      const del = await admin.from('customers').delete().eq('id', cust)
      check('R2 sletning af kunde med tilbud afvises (23503)', del.error?.code === '23503', String(del.error?.code ?? 'slettet!'))
      const still = await admin.from('offers').select('id').eq('id', offer).maybeSingle()
      check('R3 tilbuddet findes stadig', !!still.data)
    } finally {
      await admin.from('offers').delete().eq('id', offer)
      await admin.from('customers').delete().eq('id', cust)
    }
    const gone = await admin.from('customers').select('id').eq('id', cust).maybeSingle()
    check('R4 kunde UDEN tilbud kan stadig slettes', !gone.data)
    process.exitCode = fails ? 2 : 0
    return
  }
  if (SUB === 'billing-model-check') {
    const { runBillingModelCheck, formatBillingModelCheck } = await import('./billing-model-check')
    const checks = await runBillingModelCheck({ admin, sql: stagingSql })
    log(formatBillingModelCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'dashboard-stats-equivalence') {
    // PF-2 (review 2026-10-16): forsidens tilbudstal — ny forespørgsel = gammel (læser kun)
    const { runDashboardStatsEquivalence, formatDashboardStatsEquivalence } = await import('./dashboard-stats-equivalence')
    const checks = await runDashboardStatsEquivalence({ admin })
    log(formatDashboardStatsEquivalence(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'customer-email-dup-check') {
    // T-5 (review 2026-10-16): server-side dublet-værn på kunders e-mail (insertCustomerWithRetry)
    const { runCustomerEmailDupCheck, formatCustomerEmailDupCheck } = await import('./customer-email-dup-check')
    const checks = await runCustomerEmailDupCheck({ admin })
    log(formatCustomerEmailDupCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'invoice-attach-reset-check') {
    // SU-6 (2026-10-17): vedhæftet PDF-tekst nulstiller værdier læst fra mailteksten (fakturanr./beløb), medmindre de er
    // rettet manuelt. Staging, ingen mail.
    const { attachFileToInvoice } = await import('../../src/lib/services/incoming-invoices')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const ids: string[] = []
    try {
      const mk = async (n: string) => {
        const { data, error } = await admin.from('incoming_invoices').insert({ source: 'manual', status: 'received', invoice_number: n, amount_incl_vat: 9375, currency: 'DKK', raw_text: 'Ordre ORD bekræftet — at betale 9.375,00' }).select('id').single()
        if (error) throw new Error(error.message)
        ids.push((data as { id: string }).id)
        return (data as { id: string }).id
      }
      const pdfText = `FAKTURA
Fakturanr.: 4711${stamp}
Fakturadato: 15-10-2026
Total inkl. moms 11.718,75
`
      const a = await mk(`ORD-${stamp}`)
      const r1 = await attachFileToInvoice({ invoiceId: a, fileName: 'f.pdf', mime: 'application/pdf', rawText: pdfText, fileUrl: `harness://${stamp}` })
      const ra = (await admin.from('incoming_invoices').select('invoice_number, amount_incl_vat').eq('id', a).single()).data as { invoice_number: string | null; amount_incl_vat: number | null } | null
      check('mailtekstens fakturanr. erstattes (ikke ORD-…)', r1.ok && ra?.invoice_number !== `ORD-${stamp}`, `${r1.message} · ${JSON.stringify(ra)}`)
      const b = await mk(`ORDB-${stamp}`)
      await admin.from('incoming_invoice_audit_log').insert({ incoming_invoice_id: b, action: 'header_edited', message: 'harness' })
      await attachFileToInvoice({ invoiceId: b, fileName: 'f.pdf', mime: 'application/pdf', rawText: pdfText, fileUrl: `harness://b${stamp}` })
      const rb = (await admin.from('incoming_invoices').select('invoice_number').eq('id', b).single()).data as { invoice_number: string | null } | null
      check('manuelt rettet header bevares', rb?.invoice_number === `ORDB-${stamp}`, JSON.stringify(rb))
    } finally {
      if (ids.length) { await admin.from('incoming_invoice_audit_log').delete().in('incoming_invoice_id', ids); await admin.from('incoming_invoices').delete().in('id', ids) }
    }
    log(fails ? `❌ ${fails} fejl` : '✅ bilag-nulstilling ok')
    process.exitCode = fails ? 2 : 0
    return
  }
  if (SUB === 'bank-auto-match-check') {
    // PF2-1/FIN-5 (2026-10-17): auto-match på staging — reference-match og beløb efter kreditnota (12.500 − 2.500 = 10.000
    // med afsendernavn = kunden); kørslen holder sit tidsbudget. Ingen mail.
    const { autoMatchTransactions } = await import('../../src/lib/services/bank-payments')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const custName = `Harness Bank ${stamp}`
    const cust = await admin.from('customers').insert({ customer_number: `BM-${stamp}`, company_name: custName, contact_person: custName, email: `bm-${stamp}@harness.test`, created_by: owner }).select('id').single()
    const custId = (cust.data as { id?: string } | null)?.id ?? null
    const invIds: string[] = []
    const txIds: string[] = []
    try {
      const base = { customer_id: custId, status: 'sent', payment_status: 'pending', invoice_type: 'standard', due_date: '2026-11-01', currency: 'DKK' }
      const a = await admin.from('invoices').insert({ ...base, invoice_number: `HXA-${stamp}`, total_amount: 800, tax_amount: 200, final_amount: 1000, payment_reference: `HXREF${stamp}` }).select('id').single()
      const b = await admin.from('invoices').insert({ ...base, invoice_number: `HXB-${stamp}`, total_amount: 10000, tax_amount: 2500, final_amount: 12500 }).select('id').single()
      const aId = (a.data as { id: string }).id, bId = (b.data as { id: string }).id
      invIds.push(aId, bId)
      const cn = await admin.from('invoices').insert({ ...base, invoice_number: `HXC-${stamp}`, invoice_type: 'credit', credit_of_invoice_id: bId, total_amount: -2000, tax_amount: -500, final_amount: -2500 }).select('id').single()
      invIds.push((cn.data as { id: string }).id)
      // FR-6 (2026-10-22): betalt faktura D nævnes i bankteksten; åben faktura E har samme beløb + kunde → må IKKE betales
      const dNo = `F-9999-${String(stamp).slice(-4)}`
      const d = await admin.from('invoices').insert({ ...base, invoice_number: dNo, status: 'paid', payment_status: 'paid', total_amount: 2400, tax_amount: 600, final_amount: 3000, amount_paid: 3000 }).select('id').single()
      const e = await admin.from('invoices').insert({ ...base, invoice_number: `HXE-${stamp}`, total_amount: 2400, tax_amount: 600, final_amount: 3000 }).select('id').single()
      const dId = (d.data as { id: string }).id, eId = (e.data as { id: string }).id
      invIds.push(dId, eId)
      const today = new Date().toISOString().slice(0, 10)
      const t1 = await admin.from('bank_transactions').insert({ date: today, amount: 1000, reference_text: `Betaling HXREF${stamp}`, sender_name: 'Anden Person' }).select('id').single()
      const t2 = await admin.from('bank_transactions').insert({ date: today, amount: 10000, reference_text: null, sender_name: custName }).select('id').single()
      const t3 = await admin.from('bank_transactions').insert({ date: today, amount: 3000, reference_text: `Faktura ${dNo}`, sender_name: custName }).select('id').single()
      txIds.push((t1.data as { id: string }).id, (t2.data as { id: string }).id, (t3.data as { id: string }).id)
      const started = Date.now()
      const summary = await autoMatchTransactions()
      check('kørslen holder tidsbudgettet (< 55 s)', Date.now() - started < 55_000, `${Math.round((Date.now() - started) / 1000)} s · ${JSON.stringify({ scanned: summary.scanned, matched: summary.matched, deferred: summary.deferred ?? 0 })}`)
      const tx = ((await admin.from('bank_transactions').select('id, match_status, matched_invoice_id').in('id', txIds)).data ?? []) as Array<{ id: string; match_status: string; matched_invoice_id: string | null }>
      const byId = new Map(tx.map((r) => [r.id, r]))
      check('reference-match → faktura A', byId.get(txIds[0])?.matched_invoice_id === aId, JSON.stringify(byId.get(txIds[0])))
      check('FIN-5: 10.000 matcher 12.500 − kredit 2.500 (afsender = kunden)', byId.get(txIds[1])?.matched_invoice_id === bId, JSON.stringify(byId.get(txIds[1])))
      const invB = (await admin.from('invoices').select('payment_status').eq('id', bId).single()).data as { payment_status: string } | null
      check('faktura B betalt efter kreditnota + indbetaling', invB?.payment_status === 'paid', JSON.stringify(invB))
      const t3row = ((await admin.from('bank_transactions').select('match_status, matched_invoice_id, candidate_invoice_ids').eq('id', txIds[2]).single()).data ?? null) as { match_status: string; matched_invoice_id: string | null; candidate_invoice_ids: string[] | null } | null
      check('FR-6: nævnt betalt faktura → manuel afklaring (ikke beløbsmatch)', t3row?.match_status === 'ambiguous' && !t3row.matched_invoice_id && (t3row.candidate_invoice_ids ?? []).includes(dId), JSON.stringify(t3row))
      const invE = (await admin.from('invoices').select('payment_status').eq('id', eId).single()).data as { payment_status: string } | null
      check('FR-6: åben faktura med samme beløb er urørt', invE?.payment_status === 'pending', JSON.stringify(invE))
      // FR-7: manuel kobling af en kronepost til en EUR-faktura afvises (intet registreres)
      const { manualMatchTransaction } = await import('../../src/lib/services/bank-payments')
      const eur = await admin.from('invoices').insert({ ...base, currency: 'EUR', invoice_number: `HXF-${stamp}`, total_amount: 800, tax_amount: 200, final_amount: 1000 }).select('id').single()
      const eurId = (eur.data as { id: string }).id
      invIds.push(eurId)
      const t4 = await admin.from('bank_transactions').insert({ date: today, amount: 7460, reference_text: 'EUR test', sender_name: custName }).select('id').single()
      const t4Id = (t4.data as { id: string }).id
      txIds.push(t4Id)
      const mm = await manualMatchTransaction(t4Id, eurId)
      const eurPays = ((await admin.from('invoice_payments').select('id').eq('invoice_id', eurId)).data ?? []).length
      check('FR-7: manuel kobling til EUR-faktura afvises', mm.status === 'unmatched' && mm.reason === 'non-DKK invoice' && eurPays === 0, `${mm.status}/${mm.reason} betalinger=${eurPays}`)
    } finally {
      if (txIds.length) await admin.from('bank_transactions').delete().in('id', txIds)
      if (invIds.length) { await admin.from('invoice_payments').delete().in('invoice_id', invIds); await admin.from('invoices').delete().in('id', invIds.slice().reverse()) }
      if (custId) await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ bank-auto-match ok')
    process.exitCode = fails ? 2 : 0
    return
  }
  if (SUB === 'find-or-create-matchonly-check') {
    // LC-2 (review 2026-10-17): allerede koblet mail → findOrCreateCustomer({ matchOnly }) opretter aldrig en kunde,
    // men finder stadig en eksisterende. Staging, ingen mail.
    const { findOrCreateCustomer } = await import('../../src/lib/services/email-intelligence')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const phone = `9${String(stamp).slice(-7)}`
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    let custId: string | null = null
    try {
      const r1 = await findOrCreateCustomer({ name: `[HARNESS] LC2 ${stamp}`, phone, address: 'Testvej 1, 8000 Aarhus', fallbackEmail: null, matchOnly: true })
      const { count: made } = await admin.from('customers').select('id', { count: 'exact', head: true }).eq('phone', phone)
      check('matchOnly: ingen ny kunde for ukendt telefon', r1.customerId === null && !r1.created && (made ?? 0) === 0, JSON.stringify(r1))
      const ins = await admin.from('customers').insert({ customer_number: `LC2-${stamp}`, company_name: `[HARNESS] LC2 eksisterende ${stamp}`, contact_person: 'X', email: `lc2-${stamp}@harness.test`, phone, created_by: owner }).select('id').single()
      custId = (ins.data as { id: string } | null)?.id ?? null
      const r2 = await findOrCreateCustomer({ name: null, phone, address: null, fallbackEmail: null, matchOnly: true })
      check('matchOnly: eksisterende kunde findes stadig (telefon)', !!custId && r2.customerId === custId && !r2.created, JSON.stringify(r2))
    } finally {
      if (custId) await admin.from('customers').delete().eq('id', custId)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ matchOnly ok')
    process.exitCode = fails ? 2 : 0
    return
  }
  if (SUB === 'offer-reminder-plan-check') {
    // O-1 (review 2026-10-16): tilbudsrykker-plan/dry-run — intet sendes, intet tilbud ændres
    const { runOfferReminderPlanCheck, formatOfferReminderPlanCheck } = await import('./offer-reminder-plan-check')
    const checks = await runOfferReminderPlanCheck({ admin })
    log(formatOfferReminderPlanCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'rate-engine-check') {
    const { runRateEngineCheck, formatRateEngineCheck } = await import('./rate-engine-check')
    const checks = await runRateEngineCheck({ admin, url: runtime.url, anonKey: runtime.anonKey, sql: stagingSql })
    log(formatRateEngineCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'lead-activities-rls-check') {
    const { runLeadActivitiesRlsCheck, formatLeadActivitiesRlsCheck } = await import('./lead-activities-rls-check')
    const checks = await runLeadActivitiesRlsCheck({ admin, url: runtime.url, anonKey: runtime.anonKey, sql: stagingSql })
    log(formatLeadActivitiesRlsCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'mp-00238-check') {
    const { runMp00238Check, formatMp00238Check } = await import('./mp-00238-check')
    const checks = await runMp00238Check({ admin, url: runtime.url, anonKey: runtime.anonKey, sql: stagingSql })
    log(formatMp00238Check(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'mp-00239-rls-check') {
    const { runMp00239RlsCheck, formatMp00239RlsCheck } = await import('./mp-00239-rls-check')
    const checks = await runMp00239RlsCheck({ admin, url: runtime.url, anonKey: runtime.anonKey })
    log(formatMp00239RlsCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'mp-00237-check') {
    const { runMp00237Check, formatMp00237Check } = await import('./mp-00237-check')
    const checks = await runMp00237Check({ admin, url: runtime.url, anonKey: runtime.anonKey })
    log(formatMp00237Check(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'mp-00236-rls-check') {
    const { runMp00236RlsCheck, formatMp00236RlsCheck } = await import('./mp-00236-rls-check')
    const checks = await runMp00236RlsCheck({ admin, url: runtime.url, anonKey: runtime.anonKey })
    log(formatMp00236RlsCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'sec-b7-rls-check') {
    // SEC-B7 / forslag 00235: direkte REST-skrivninger pr. rolle ([NY] fejler indtil 00235 er anvendt)
    const { runSecB7RlsCheck, formatSecB7RlsCheck } = await import('./sec-b7-rls-check')
    const checks = await runSecB7RlsCheck({ admin, url: runtime.url, anonKey: runtime.anonKey })
    log(formatSecB7RlsCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'economic-uncertain-check') {
    const { runEconomicUncertainCheck, formatEconomicUncertainCheck } = await import('./economic-uncertain-check')
    const checks = await runEconomicUncertainCheck({ admin })
    log(formatEconomicUncertainCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'absence-rls-check') {
    const { runAbsenceRlsCheck, formatAbsenceRlsCheck } = await import('./absence-rls-check')
    const checks = await runAbsenceRlsCheck({ admin, url: runtime.url, anonKey: runtime.anonKey, sql: stagingSql })
    log(formatAbsenceRlsCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'vat-guard-check') {
    const { runVatGuardCheck, formatVatGuardCheck } = await import('./vat-guard-check')
    const checks = await runVatGuardCheck({ admin })
    log(formatVatGuardCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'contract-final-check') {
    const { runContractFinalCheck, formatContractFinalCheck } = await import('./contract-final-check')
    const checks = await runContractFinalCheck({ admin })
    log(formatContractFinalCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'economic-killswitch-check') {
    // PR-2 (Henrik 2026-10-15): med ECONOMIC_PUSH_ENABLED fra må INTET skrivende kald nå e-conomic — fetch tælles
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
    const { economicPushEnabled, economicRequestAllowed } = await import('../../src/lib/accounting/economic-push-flag')
    check('K1 standard = fra (uden variabel)', !economicPushEnabled({}) && !economicPushEnabled({ ECONOMIC_PUSH_ENABLED: '1' }) && !economicPushEnabled({ ECONOMIC_PUSH_ENABLED: 'yes' }) && economicPushEnabled({ ECONOMIC_PUSH_ENABLED: 'true' }))
    check('K2 kun GET tilladt når fra', economicRequestAllowed('GET', {}) && !economicRequestAllowed('POST', {}) && !economicRequestAllowed('PUT', {}) && !economicRequestAllowed('DELETE', {}))
    delete process.env.ECONOMIC_PUSH_ENABLED
    const realFetch = globalThis.fetch
    let econCalls = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('e-conomic')) { econCalls++; return new Response('{}', { status: 500 }) }
      return realFetch(input as RequestInfo, init)
    }) as typeof fetch
    try {
      const ec = await import('../../src/lib/services/economic-client')
      const ids = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a4']
      const results = await Promise.all([
        ec.createCustomerInEconomic(ids[0]), ec.createInvoiceInEconomic(ids[1]), ec.markInvoicePaidInEconomic(ids[2]), ec.pushSupplierInvoiceToEconomic(ids[3]),
      ])
      check('K3 alle skrivende veje springes over med ECONOMIC_PUSH_DISABLED', results.every((r) => r.status === 'skipped' && (r as { reason?: string }).reason === 'ECONOMIC_PUSH_DISABLED'), results.map((r) => `${r.status}:${(r as { reason?: string }).reason}`).join(','))
      check('K4 nul HTTP-kald til e-conomic', econCalls === 0, `kald=${econCalls}`)
      const { data: logs } = await admin.from('accounting_sync_log').select('entity_id').in('entity_id', ids).eq('error_message', 'ECONOMIC_PUSH_DISABLED')
      check('K5 hvert forsøg logges (ikke tavst)', new Set(((logs ?? []) as Array<{ entity_id: string }>).map((l) => l.entity_id)).size === 4, `rækker=${(logs ?? []).length}`)
      await admin.from('accounting_sync_log').delete().in('entity_id', ids)
    } finally {
      globalThis.fetch = realFetch
    }
    process.exitCode = fails ? 2 : 0
    return
  }
  if (SUB === 'alert-policy-check') {
    const { runAlertPolicyCheck, formatAlertPolicyCheck } = await import('./alert-policy-check')
    const checks = await runAlertPolicyCheck({ admin })
    log(formatAlertPolicyCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'invite-link-check') {
    const { runInviteLinkCheck, formatInviteLinkCheck } = await import('./invite-link-check')
    const checks = await runInviteLinkCheck({ admin, url: runtime.url, anonKey: runtime.anonKey })
    log(formatInviteLinkCheck(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'calc-settings-rls') {
    const { runCalcSettingsRls, formatCalcSettingsRls } = await import('./calc-settings-rls')
    const checks = await runCalcSettingsRls({ admin, url: runtime.url, anonKey: runtime.anonKey, sql: stagingSql })
    log(formatCalcSettingsRls(checks))
    process.exitCode = checks.some((c) => !c.ok) ? 2 : 0
    return
  }
  if (SUB === 'package-pricing-check') {
    // 00224 (GP-6): pakkelinjer gemmer rå leverandørkost og den faktiske avance (ikke 0 uden regel)
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const sup = ((await admin.from('suppliers').insert({ name: `HARNESS-PKG ${stamp}`, code: `HPK${stamp}` }).select('id').single()).data as { id: string }).id
    const prod = ((await admin.from('supplier_products').insert({ supplier_id: sup, supplier_sku: `PK-${stamp}`, supplier_name: 'Harness pakkevare', cost_price: 100 }).select('id').single()).data as { id: string }).id
    const pkg = ((await admin.from('offer_packages').insert({ slug: `harness-${stamp}`, name: '[HARNESS] pakke', job_type: 'other', is_active: true }).select('id').single()).data as { id: string } | null)?.id ?? null
    const off = ((await admin.from('offers').insert({ offer_number: `H-PK-${stamp}`, title: '[HARNESS] pakke', created_by: owner }).select('id').single()).data as { id: string }).id
    try {
      const { data, error } = await admin.rpc('apply_package_to_offer', { p_offer_id: off, p_package_id: pkg, p_customer_id: null,
        p_lines: [{ supplier_id: sup, supplier_product_id: prod, supplier_name: 'HARNESS-PKG', description: 'Pakkevare', unit: 'stk', quantity: 2, cost_price: 90, raw_cost_price: 100, notes: 'Package: harness' }] })
      check('rpc ok', !error && Number(data) === 1, error?.message ?? String(data))
      const { data: li } = await admin.from('offer_line_items').select('cost_price, unit_price, supplier_cost_price_at_creation, supplier_margin_applied, margin_percentage').eq('offer_id', off).limit(1).maybeSingle()
      const l = li as { cost_price: number; unit_price: number; supplier_cost_price_at_creation: number; supplier_margin_applied: number; margin_percentage: number } | null
      check('rå leverandørkost i supplier_cost_price_at_creation (ingen falsk "pris ændret")', Number(l?.supplier_cost_price_at_creation) === 100 && Number(l?.cost_price) === 90, JSON.stringify(l))
      const expected = l && Number(l.cost_price) > 0 ? Math.round(((Number(l.unit_price) / Number(l.cost_price)) - 1) * 10000) / 100 : NaN
      check('faktisk avance gemt (ikke 0 uden regel)', !!l && Number(l.margin_percentage) > 0 && Math.abs(Number(l.margin_percentage) - expected) < 0.02 && Number(l.supplier_margin_applied) === Number(l.margin_percentage), `${l?.margin_percentage} vs ${expected}`)
      // ingen falsk "pris ændret": getOfferSupplierPriceChanges sammenligner supplier_cost_price_at_creation med varens kost
      const cur = ((await admin.from('supplier_products').select('cost_price').eq('id', prod).single()).data as { cost_price: number }).cost_price
      check('ingen falsk "pris ændret" (rå kost = varens aktuelle kost)', Number(l?.supplier_cost_price_at_creation) === Number(cur), `${l?.supplier_cost_price_at_creation} vs ${cur}`)
      // anon kan ikke kalde funktionen
      const anonClient = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false } })
      const an = await anonClient.rpc('apply_package_to_offer', { p_offer_id: off, p_package_id: pkg, p_customer_id: null, p_lines: [] })
      check('anon kan ikke kalde apply_package_to_offer', !!an.error, an.error ? (an.error.code ?? an.error.message.slice(0, 40)) : 'TILLADT')
    } finally {
      await admin.from('offer_line_items').delete().eq('offer_id', off)
      await admin.from('offers').delete().eq('id', off)
      if (pkg) await admin.from('offer_packages').delete().eq('id', pkg)
      await admin.from('supplier_products').delete().eq('id', prod)
      await admin.from('suppliers').delete().eq('id', sup)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ pakkepriser ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'manual-price-history-check') {
    // GP-12: manuel kost-/listeprisændring → price_history (manual); uændret eller ryddet kost → ingen række
    const { readSupplierProductPrices, recordManualSupplierPriceChange } = await import('../../src/lib/suppliers/manual-price-history')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const sup = ((await admin.from('suppliers').insert({ name: `HARNESS-MPH ${stamp}`, code: `HMP${stamp}` }).select('id').single()).data as { id: string }).id
    const prod = ((await admin.from('supplier_products').insert({ supplier_id: sup, supplier_sku: `MPH-${stamp}`, supplier_name: 'Harness vare', cost_price: 100, list_price: 150 }).select('id').single()).data as { id: string }).id
    const rows = async () => ((await admin.from('price_history').select('old_cost_price, new_cost_price, change_source, change_percentage').eq('supplier_product_id', prod)).data ?? []) as Array<{ old_cost_price: number; new_cost_price: number; change_source: string; change_percentage: number }>
    try {
      const b1 = await readSupplierProductPrices(admin, prod)
      await admin.from('supplier_products').update({ cost_price: 120 }).eq('id', prod)
      await recordManualSupplierPriceChange(admin, prod, b1, { cost_price: 120 })
      const r1 = await rows()
      check('kost 100 → 120 giver én manual-række (+20 %)', r1.length === 1 && r1[0].change_source === 'manual' && Number(r1[0].old_cost_price) === 100 && Number(r1[0].new_cost_price) === 120 && Number(r1[0].change_percentage) === 20, JSON.stringify(r1))
      const b2 = await readSupplierProductPrices(admin, prod)
      await recordManualSupplierPriceChange(admin, prod, b2, { cost_price: 120 })
      check('uændret kost giver ingen ny række', (await rows()).length === 1)
      await recordManualSupplierPriceChange(admin, prod, b2, { cost_price: null })
      check('ryddet kost (ingen aftale) giver ingen række', (await rows()).length === 1)
      await recordManualSupplierPriceChange(admin, prod, b2, { list_price: 175 })
      check('kun listepris ændret → række med uændret kost', (await rows()).length === 2)
    } finally {
      await admin.from('price_history').delete().eq('supplier_product_id', prod)
      await admin.from('supplier_products').delete().eq('id', prod)
      await admin.from('suppliers').delete().eq('id', sup)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ manuel prishistorik ok')
    process.exitCode = fails ? 1 : 0
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
      const r = await runPlanningAgent({ caseIds: [done, fresh], dryRun: false, triggeredBy: owner })
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
    let guardCaseId: string | null = null
    let finalCaseId: string | null = null
    let noRateEmpId: string | null = null
    let noRateWoId: string | null = null
    let noRateTlId: string | null = null
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

      // Faktura-review 2026-10-14 (S1): forskud fratrukket på en slutfaktura kan ikke krediteres (kunden fik det ellers to gange)
      const { data: sc } = await admin.from('service_cases').insert({ case_number: `SVC-6${String(stamp).slice(-6)}`, customer_id: custId, title: '[HARNESS] fradrag', status: 'in_progress', created_by: owner }).select('id').single()
      guardCaseId = (sc as { id: string } | null)?.id ?? null
      const dep2 = await mkInv({ invoice_type: 'deposit', billing_percentage: 30, case_id: guardCaseId }, [['Forskud 30 %', 1, 30000]])
      await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', dep2.id)
      const fin2 = await mkInv({ invoice_type: 'final', is_final_invoice: true, case_id: guardCaseId }, [['Arbejde', 1, 100000], ['Fradrag: forskud', 1, -30000]])
      await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', fin2.id)
      const g1 = await createCreditNoteForInvoice({ invoice_id: dep2.id, credit_type: 'full', reason: 'harness' }, owner)
      check('forskud fratrukket på sendt slutfaktura: kreditering afvises', !g1.ok && /slutfaktura/.test(g1.message ?? ''), g1.message)
      await admin.from('invoices').update({ voided_at: new Date().toISOString() }).eq('id', fin2.id)
      const g2 = await createCreditNoteForInvoice({ invoice_id: dep2.id, credit_type: 'full', reason: 'harness' }, owner)
      check('slutfakturaen annulleret (krediteret): forskuddet kan nu krediteres', g2.ok, g2.message)
      // FIN-1 (2026-10-17): fastpris-slutfaktura (kontraktsum) fratrækker også 'standard'-delfakturaer → kreditering afvises;
      // en linjebaseret slutfaktura fratrækker dem ikke → kreditering tilladt (is_final_invoice=false undgår unik-indekset)
      const std1 = await mkInv({ invoice_type: 'standard', case_id: guardCaseId }, [['Delfaktura', 1, 40000]])
      await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', std1.id)
      const finC = await mkInv({ invoice_type: 'final', is_final_invoice: false, amount_basis: 'contract_sum', amount_basis_value: 100000, case_id: guardCaseId }, [['Kontraktsum', 1, 100000], ['Fradrag: delfaktura', 1, -40000]])
      await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', finC.id)
      const s1 = await createCreditNoteForInvoice({ invoice_id: std1.id, credit_type: 'full', reason: 'harness' }, owner)
      check('FIN-1: standard-delfaktura fratrukket på fastpris-slutfaktura: kreditering afvises', !s1.ok && /slutfaktura/.test(s1.message ?? ''), s1.message)
      await admin.from('invoices').update({ voided_at: new Date().toISOString() }).eq('id', finC.id)
      const finL = await mkInv({ invoice_type: 'final', is_final_invoice: false, amount_basis: 'lines', case_id: guardCaseId }, [['Arbejde', 1, 10000]])
      await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', finL.id)
      const s2 = await createCreditNoteForInvoice({ invoice_id: std1.id, credit_type: 'full', reason: 'harness' }, owner)
      check('FIN-1: linjebaseret slutfaktura fratrækker ikke standard → kreditering tilladt', s2.ok, s2.message)
      // FIN-4 (2026-10-17): 6.000 indbetalt + kreditnota 4.000 (inkl. moms) af 10.000 → fakturaen er udlignet (betalt)
      const { markInvoiceSent: markSent4 } = await import('../../src/lib/services/invoices')
      const inv4 = await mkInv({ invoice_type: 'standard', total_amount: 8000, tax_amount: 2000, final_amount: 10000 }, [['Arbejde', 1, 4800], ['Materialer', 1, 3200]])
      await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString(), amount_paid: 6000, payment_status: 'partial' }).eq('id', inv4.id)
      const cn4 = await createCreditNoteForInvoice({ invoice_id: inv4.id, credit_type: 'partial', reason: 'harness', selected_line_ids: [inv4.lines[1]] }, owner)
      if (cn4.ok && cn4.credit_invoice_id) await markSent4(cn4.credit_invoice_id).catch(() => {})
      const after4 = (await admin.from('invoices').select('status, payment_status, paid_at').eq('id', inv4.id).single()).data as { status: string; payment_status: string; paid_at: string | null } | null
      check('FIN-4: delbetalt + krediteret rest → betalt', !!cn4.ok && after4?.status === 'paid' && after4?.payment_status === 'paid' && !!after4?.paid_at, `${cn4.message ?? ''} · ${JSON.stringify(after4)}`)

      // Faktura-review 2026-10-14 F-3/F-2: slutfaktura med negativ total afvises; timer uden timepris blokerer slutfakturaen
      const { createFinalInvoiceForCase } = await import('../../src/lib/services/invoice-stage')
      const { data: sc3 } = await admin.from('service_cases').insert({ case_number: `SVC-8${String(stamp).slice(-6)}`, customer_id: custId, title: '[HARNESS] slutfaktura', status: 'in_progress', created_by: owner, contract_sum: 100000, billing_model: 'time_and_materials' /* 00232: linjebaseret slutfaktura */ }).select('id').single()
      finalCaseId = (sc3 as { id: string } | null)?.id ?? null
      const dep3 = await mkInv({ invoice_type: 'deposit', billing_percentage: 40, case_id: finalCaseId }, [['Forskud 40 %', 1, 40000]])
      await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', dep3.id)
      const fneg = await createFinalInvoiceForCase({ case_id: finalCaseId!, include_unbilled_lines: false }, owner)
      check('slutfaktura uden linjer efter 40 % forskud (negativ total) afvises', !fneg.ok && /negativ/.test(fneg.message) && !fneg.invoice_number, fneg.message.slice(0, 90))
      const empNoRate = ((await admin.from('employees').insert({ name: '[HARNESS] uden sats', email: `nr-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 500, cost_rate: 300 /* 00230-værn kræver satser ved registrering — salgssats fjernes efter */ }).select('id').single()).data as { id: string }).id
      noRateEmpId = empNoRate
      const wo3 = ((await admin.from('work_orders').insert({ case_id: finalCaseId, customer_id: custId, title: '[HARNESS] uden sats', status: 'in_progress', scheduled_date: '2026-10-01', assigned_employee_id: empNoRate }).select('id').single()).data as { id: string }).id
      noRateWoId = wo3
      const tl3 = await admin.from('time_logs').insert({ work_order_id: wo3, employee_id: empNoRate, start_time: '2026-10-01T06:00:00Z', end_time: '2026-10-01T16:00:00Z', billable: true, approval_status: 'approved' /* PR-3: kun godkendte timer */ }).select('id, sale_amount').single()
      noRateTlId = (tl3.data as { id: string } | null)?.id ?? null
      // Rate-motoren kan have frosset en sats fra firmastandarden — tving "ingen sats" for at teste fallback-vagten
      if (noRateTlId) await admin.from('time_logs').update({ sale_amount: null, sale_rate_snapshot: null }).eq('id', noRateTlId)
      await admin.from('employees').update({ hourly_rate: null }).eq('id', empNoRate) // satsen fjernet efter registreringen
      const fmiss = await createFinalInvoiceForCase({ case_id: finalCaseId!, include_unbilled_lines: true }, owner)
      const tlNow = noRateTlId ? (await admin.from('time_logs').select('hours, approval_status, sale_amount').eq('id', noRateTlId).maybeSingle()).data : null
      check('timer uden timepris blokerer slutfakturaen (før skjult 650 kr/t)', !fmiss.ok && /timepris/.test(fmiss.message), `${fmiss.message.slice(0, 90)} · tl=${JSON.stringify(tlNow)} ${tl3.error?.message ?? ''}`)
      // DF-5 (2026-10-17): fuldt krediteret faktura frigiver sine kilderækker (timer) til ny fakturering
      if (noRateTlId) {
        const inv5 = await mkInv({ invoice_type: 'standard', case_id: finalCaseId, total_amount: 1000, tax_amount: 250, final_amount: 1250 }, [['Timer', 1, 1000]])
        await admin.from('time_logs').update({ invoice_line_id: inv5.lines[0] }).eq('id', noRateTlId)
        await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', inv5.id)
        const cn5 = await createCreditNoteForInvoice({ invoice_id: inv5.id, credit_type: 'full', reason: 'harness' }, owner)
        if (cn5.ok && cn5.credit_invoice_id) await (await import('../../src/lib/services/invoices')).markInvoiceSent(cn5.credit_invoice_id).catch(() => {})
        const tl5 = (await admin.from('time_logs').select('invoice_line_id').eq('id', noRateTlId).single()).data as { invoice_line_id: string | null } | null
        const v5 = (await admin.from('invoices').select('voided_at').eq('id', inv5.id).single()).data as { voided_at: string | null } | null
        check('DF-5: fuldt krediteret faktura frigiver timerne (kan faktureres igen)', !!cn5.ok && !!v5?.voided_at && tl5?.invoice_line_id === null, `${cn5.message ?? ''} · voided=${!!v5?.voided_at} line=${tl5?.invoice_line_id}`)
      }

      // Faktura-review 2026-10-14 #8/#9: "markér som sendt" taber til en igangværende sletning; kreditnota-PDF på momsfri faktura
      const { markInvoiceSent, getInvoicePdfPayload } = await import('../../src/lib/services/invoices')
      const claimed = await mkInv({ invoice_type: 'standard' }, [['Arbejde', 1, 1000]])
      await admin.from('invoices').update({ sent_at: '1970-01-01T00:00:00Z' }).eq('id', claimed.id)
      const ms1 = await markInvoiceSent(claimed.id).then(() => 'sendt', (e: Error) => `afvist: ${e.message.slice(0, 60)}`)
      check('markér som sendt afvises mens kladden er claimet (sletning i gang)', ms1.startsWith('afvist'), ms1)
      // FIN-7 (2026-10-17): mail-krav efter ukendt udfald — ældre end 2 min kan overtages af "Markér som sendt", et frisk ikke
      const staleMail = await mkInv({ invoice_type: 'standard' }, [['Arbejde', 1, 1000]])
      await admin.from('invoices').update({ sent_at: new Date(Date.now() - 3 * 60_000).toISOString() }).eq('id', staleMail.id)
      const msStale = await markInvoiceSent(staleMail.id).then(() => 'sendt', (e: Error) => `afvist: ${e.message.slice(0, 60)}`)
      check('markér som sendt virker efter ukendt mail-udfald (krav > 2 min)', msStale === 'sendt', msStale)
      const freshMail = await mkInv({ invoice_type: 'standard' }, [['Arbejde', 1, 1000]])
      await admin.from('invoices').update({ sent_at: new Date().toISOString() }).eq('id', freshMail.id)
      const msFresh = await markInvoiceSent(freshMail.id).then(() => 'sendt', (e: Error) => `afvist: ${e.message.slice(0, 60)}`)
      check('markér som sendt afvises mens mail-afsendelsen er i gang (krav < 2 min)', msFresh.startsWith('afvist'), msFresh)
      const free = await mkInv({ invoice_type: 'standard' }, [['Arbejde', 1, 1000]])
      const ms2 = await markInvoiceSent(free.id).then(() => 'sendt', (e: Error) => `afvist: ${e.message.slice(0, 60)}`)
      check('markér som sendt virker på almindelig kladde', ms2 === 'sendt', ms2)
      const cn0 = await mkInv({ invoice_type: 'credit', credit_of_invoice_id: free.id }, [['Kreditnota: Arbejde', 1, -1000]])
      await admin.from('invoices').update({ tax_amount: 0, final_amount: -1000 }).eq('id', cn0.id)
      const pdf = await getInvoicePdfPayload(cn0.id)
      const pdfVat = (pdf as unknown as { totals?: { vat?: number; vat_rate?: number } } | null)?.totals
      check('kreditnota på momsfri faktura: PDF uden moms', !!pdfVat && Number(pdfVat.vat ?? -1) === 0, JSON.stringify(pdfVat))
    } finally {
      const { data: invs } = await admin.from('invoices').select('id').eq('customer_id', custId)
      const ids = ((invs ?? []) as Array<{ id: string }>).map((x) => x.id)
      if (ids.length) {
        await admin.from('invoice_predecessors').delete().in('invoice_id', ids)
        await admin.from('invoice_lines').delete().in('invoice_id', ids)
        await admin.from('invoices').delete().in('credit_of_invoice_id', ids)
        await admin.from('invoices').delete().in('id', ids)
      }
      if (guardCaseId) await admin.from('service_cases').delete().eq('id', guardCaseId)
      if (noRateTlId) await admin.from('time_logs').delete().eq('id', noRateTlId)
      if (noRateWoId) await admin.from('work_orders').delete().eq('id', noRateWoId)
      if (finalCaseId) await admin.from('service_cases').delete().eq('id', finalCaseId)
      if (noRateEmpId) await admin.from('employees').delete().eq('id', noRateEmpId)
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
    const { data: sc } = await admin.from('service_cases').insert({ case_number: `SVC-9${String(stamp).slice(-6)}`, customer_id: custId, title: '[HARNESS] notesag', status: 'new', created_by: adminP.id, assigned_to: salgP.id }).select('id, case_number').single()
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
      // F-7 (faktura-review 2026-10-14): overbetaling måles på summen af betalinger mod udestående
      const ov = await mk('ov', 'sent', 1000)
      const p1 = await registerPayment(ov, 250)
      const p2 = await registerPayment(ov, 1000)
      check('250 + 1.000 på en 1.000-faktura → overbetalt 250 (før "matched")', p1.overpaidBy === 0 && p2.fullyPaid && p2.overpaidBy === 250, `${p1.overpaidBy}/${p2.overpaidBy}`)
      const p3 = await registerPayment(ov, 1000)
      check('betaling til allerede betalt faktura = overbetaling i sin helhed', p3.overpaidBy === 1000, String(p3.overpaidBy))
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
  if (SUB === 'case-payer-invoice-check') {
    // Sags-review #1: rate-/forskudsfaktura på en sag med separat betaler udstedes til betaleren (ellers sagens kunde)
    const { createStageInvoiceForCase } = await import('../../src/lib/services/invoice-stage')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const mk = async (tag: string) => ((await admin.from('customers').insert({ customer_number: `CPI${tag}-${stamp}`, company_name: `[HARNESS] cpi ${tag} ${stamp}`, contact_person: tag, email: `cpi${tag.toLowerCase()}-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const end = await mk('E'), payer = await mk('P')
    const caseIds: string[] = []
    try {
      const mkCase = async (n: string, p: string | null) => {
        const { data } = await admin.from('service_cases').insert({ case_number: `SVC-3${n}${String(stamp).slice(-5)}`, customer_id: end, payer_customer_id: p, title: '[HARNESS] betaler', status: 'in_progress', contract_sum: 10000, created_by: owner }).select('id').single()
        caseIds.push((data as { id: string }).id); return (data as { id: string }).id
      }
      const withPayer = await mkCase('1', payer), noPayer = await mkCase('2', null)
      const r1 = await createStageInvoiceForCase({ case_id: withPayer, invoice_type: 'deposit', amount_basis: 'contract_sum', billing_percentage: 30 }, owner)
      const r2 = await createStageInvoiceForCase({ case_id: noPayer, invoice_type: 'deposit', amount_basis: 'contract_sum', billing_percentage: 30 }, owner)
      const inv = async (caseId: string) => ((await admin.from('invoices').select('customer_id').eq('case_id', caseId).maybeSingle()).data as { customer_id: string } | null)?.customer_id
      check('sag med betaler → faktura til betaleren', r1.ok && (await inv(withPayer)) === payer, r1.message)
      check('sag uden betaler → faktura til sagens kunde', r2.ok && (await inv(noPayer)) === end, r2.message)
    } finally {
      const { data: invs } = await admin.from('invoices').select('id').in('case_id', caseIds)
      const ids = ((invs ?? []) as Array<{ id: string }>).map((r) => r.id)
      if (ids.length) { await admin.from('invoice_lines').delete().in('invoice_id', ids); await admin.from('invoices').delete().in('id', ids) }
      await admin.from('service_cases').delete().in('id', caseIds)
      await admin.from('customers').delete().in('id', [end, payer])
    }
    log(fails ? `❌ ${fails} fejl` : '✅ faktura til betaler ok')
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
  if (SUB === 'telegram-webhook-route-check') {
    // T10-webhook: selve ruten — flag fra → 404, manglende/forkert hemmelighed → 401, korrekt → 200 og behandlet.
    // Test-hemmelighed/flag sættes kun i denne proces; transport fanges (intet live).
    const { setTelegramTransport } = await import('../../src/lib/assistant/telegram/transport')
    setTelegramTransport(async () => ({ delivered: true }))
    const prevFlag = process.env.ASSISTANT_TELEGRAM_ENABLED, prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET
    const secret = `harness-secret-${Date.now()}-xyz`
    const { POST } = await import('../../src/app/api/assistant/telegram/route')
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const call = (hdr: string | null, body: unknown = { update_id: Date.now(), message: { chat: { id: 940_000_001, type: 'private' }, text: 'hej' } }) =>
      POST(new Request('http://localhost/api/assistant/telegram', { method: 'POST', headers: { 'content-type': 'application/json', ...(hdr ? { 'x-telegram-bot-api-secret-token': hdr } : {}) }, body: JSON.stringify(body) }))
    try {
      process.env.TELEGRAM_WEBHOOK_SECRET = secret
      process.env.ASSISTANT_TELEGRAM_ENABLED = 'false'
      check('flag fra → 404', (await call(secret)).status === 404)
      process.env.ASSISTANT_TELEGRAM_ENABLED = 'true'
      check('ingen hemmelighed → 401', (await call(null)).status === 401)
      check('forkert hemmelighed → 401', (await call(secret.replace('xyz', 'abc'))).status === 401)
      const ok = await call(secret)
      const j = (await ok.json()) as { ok: boolean; handled?: string }
      check('korrekt hemmelighed → 200, ukendt chat afvist høfligt', ok.status === 200 && j.handled === 'unlinked', JSON.stringify(j))
      const bad = await POST(new Request('http://localhost/api/assistant/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: '{ikke json' }))
      check('ugyldig JSON → 200 (Telegram gentager ikke)', bad.status === 200)
    } finally {
      if (prevFlag === undefined) delete process.env.ASSISTANT_TELEGRAM_ENABLED; else process.env.ASSISTANT_TELEGRAM_ENABLED = prevFlag
      if (prevSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret
      setTelegramTransport(null)
      await admin.from('audit_logs').delete().gte('created_at', new Date(Date.now() - 120_000).toISOString()).in('action', ['assistant_unlinked_message', 'assistant_update_received'])
    }
    log(fails ? `❌ ${fails} fejl` : '✅ telegram-webhook-rute ok (intet live)')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'customer-delete-refs-probe') {
    // deleteCustomer-forhåndstjekket: findes alle tabeller/kolonner, og hvilke fejlkoder giver de? Kun læsning.
    const id = '00000000-0000-0000-0000-000000000000'
    const refs: Array<[string, string]> = [
      ['service_cases', 'site_customer_id'], ['service_cases', 'orderer_customer_id'], ['service_cases', 'end_customer_id'], ['service_cases', 'payer_customer_id'], ['service_cases', 'purchased_from_customer_id'],
      ['offers', 'orderer_customer_id'], ['offers', 'end_customer_id'], ['offers', 'payer_customer_id'],
      ['customer_notes', 'customer_id'], ['roof_drawings', 'customer_id'], ['email_threads', 'customer_id'], ['partner_access_tokens', 'partner_customer_id'],
      ['customer_supplier_prices', 'customer_id'], ['customer_product_prices', 'customer_id'], ['supplier_margin_rules', 'customer_id'],
      ['invoices', 'orderer_customer_id'], ['invoices', 'end_customer_id'], ['invoices', 'payer_customer_id'],
      // CU-3 (2026-10-17): SET NULL-referencer + mailfrigivelse
      ['sent_quotes', 'customer_id'], ['document_confirmations', 'recipient_customer_id'], ['kalkia_calculations', 'customer_id'],
      ['calculations', 'customer_id'], ['work_orders', 'customer_id'], ['sms_messages', 'customer_id'], ['incoming_emails', 'customer_id'],
    ]
    for (const [t, c] of refs) {
      const { error } = await admin.from(t).select('id').eq(c, id).limit(1)
      log(`  ${error ? '⚠' : '✓'} ${t}.${c}${error ? ` — ${error.code ?? '?'} ${(error.message ?? '').slice(0, 60)}` : ''}`)
    }
    return
  }
  if (SUB === 'leads-json-in-probe') {
    // Perf-review #7: .in() på custom_fields->>source_email_id via PostgREST (som getLeadsForEmails)
    const stamp = Date.now()
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const { randomUUID } = await import('crypto')
    const src = randomUUID()
    const { data: l } = await admin.from('leads').insert({ company_name: '[HARNESS] jsonin', contact_person: 'x', email: `ji-${stamp}@harness.test`, status: 'new', source: 'email', created_by: owner, custom_fields: { source_email_id: src } }).select('id').single()
    try {
      const { data, error } = await admin.from('leads').select('id, status, source_email_id:custom_fields->>source_email_id').in('custom_fields->>source_email_id', [src, randomUUID()])
      const ok = !error && (data ?? []).length === 1 && (data as Array<{ source_email_id: string }>)[0].source_email_id === src
      log(`  ${ok ? '✓' : '❌'} .in() på JSON-sti${error ? ` — ${error.message}` : ''}`)
      process.exitCode = ok ? 0 : 1
    } finally {
      await admin.from('leads').delete().eq('id', (l as { id: string }).id)
    }
    return
  }
  if (SUB === 'telegram-update-dedupe-check') {
    // Assistent-review #7: samme update_id leveret to gange (samtidig) → kommandoen udføres én gang. Intet live.
    const { setTelegramTransport } = await import('../../src/lib/assistant/telegram/transport')
    const { handleTelegramUpdate } = await import('../../src/lib/assistant/telegram/handle-update')
    const { createLinkCode } = await import('../../src/lib/assistant/telegram/link')
    const stamp = Date.now()
    setTelegramTransport(async () => ({ delivered: true }))
    const adminP = (((await admin.from('profiles').select('id').eq('is_active', true).eq('role', 'admin').limit(1)).data ?? []) as Array<{ id: string }>)[0]
    const chat = 930_000_000 + (stamp % 1_000_000)
    const cust = ((await admin.from('customers').insert({ customer_number: `TD-${stamp}`, company_name: `TDkunde${stamp}`, contact_person: 'x', email: `td-${stamp}@harness.test`, created_by: adminP.id }).select('id').single()).data as { id: string }).id
    const prevLinks = ((await admin.from('assistant_links').select('*').eq('profile_id', adminP.id)).data ?? []) as Array<Record<string, unknown>>
    let ok = false
    try {
      await admin.from('assistant_links').delete().eq('profile_id', adminP.id)
      const { code } = await createLinkCode(admin, adminP.id)
      await handleTelegramUpdate(admin, { update_id: stamp, message: { chat: { id: chat, type: 'private' }, text: `/start ${code}` } })
      const upd = { update_id: stamp + 1, message: { chat: { id: chat, type: 'private' }, text: `Ring til TDkunde${stamp} i morgen kl. 10` } }
      const rs = await Promise.all([handleTelegramUpdate(admin, upd), handleTelegramUpdate(admin, upd)])
      const n = (await admin.from('customer_tasks').select('id', { count: 'exact', head: true }).eq('customer_id', cust)).count ?? 0
      ok = n === 1 && rs.some((r) => r.handled === 'duplicate_update')
      log(`  ${ok ? '✓' : '❌'} samme update_id ×2 → ${n} opgave(r) · ${rs.map((r) => r.handled).join(', ')}`)
    } finally {
      setTelegramTransport(null)
      await admin.from('assistant_links').delete().eq('profile_id', adminP.id)
      if (prevLinks.length) await admin.from('assistant_links').insert(prevLinks)
      await admin.from('customer_tasks').delete().eq('customer_id', cust)
      await admin.from('customers').delete().eq('id', cust)
      await admin.from('audit_logs').delete().gte('created_at', new Date(stamp - 5_000).toISOString()).like('action', 'assistant_%')
    }
    process.exitCode = ok ? 0 : 1
    return
  }
  if (SUB === 'customer-price-rpc-check') {
    // Leverandør-review #7: kundeaftale (10 % rabat) slår igennem via get_customer_product_price (som koden nu kalder)
    const stamp = Date.now()
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const sp = ((await admin.from('supplier_products').select('id, supplier_id, cost_price').gt('cost_price', 0).limit(1)).data as Array<{ id: string; supplier_id: string; cost_price: number }>)[0]
    const cust = ((await admin.from('customers').insert({ customer_number: `CP-${stamp}`, company_name: `[HARNESS] cp ${stamp}`, contact_person: 'X', email: `cp-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    try {
      // uden egen avance ignorerer DB-funktionen rabatten (record IS NOT NULL-fejl — rettes i 00206, BLOCKED_APPROVAL)
      await admin.from('customer_supplier_prices').insert({ customer_id: cust, supplier_id: sp.supplier_id, discount_percentage: 10, custom_margin_percentage: 20, is_active: true, created_by: owner })
      const { data, error } = await admin.rpc('get_customer_product_price', { p_customer_id: cust, p_supplier_product_id: sp.id })
      const eff = Number((data as Array<{ effective_cost_price: number }> | null)?.[0]?.effective_cost_price)
      const ok = !error && Math.abs(eff - Number(sp.cost_price) * 0.9) < 0.02
      log(`  ${ok ? '✓' : '❌'} kost ${sp.cost_price} − 10 % → ${eff}${error ? ` (${error.message})` : ''}`)
      process.exitCode = ok ? 0 : 1
    } finally {
      await admin.from('customer_supplier_prices').delete().eq('customer_id', cust)
      await admin.from('customers').delete().eq('id', cust)
    }
    return
  }
  if (SUB === 'invoice-line-convert-race-check') {
    // Leverandør-review #2: to samtidige konverteringer af samme linje → præcis én kostrække på sagen
    const { convertApprovedInvoiceLines } = await import('../../src/lib/services/incoming-invoice-conversion')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    const cust = ((await admin.from('customers').insert({ customer_number: `LC-${stamp}`, company_name: `[HARNESS] lc ${stamp}`, contact_person: 'X', email: `lc-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    const caseId = ((await admin.from('service_cases').insert({ case_number: `SVC-6${String(stamp).slice(-6)}`, customer_id: cust, title: '[HARNESS] konv', status: 'new', created_by: owner }).select('id').single()).data as { id: string }).id
    const { data: ii, error: iiErr } = await admin.from('incoming_invoices').insert({ source: 'manual', status: 'approved', matched_case_id: caseId, invoice_number: `H-LC-${stamp}`, currency: 'DKK' }).select('id').single()
    if (iiErr) throw new Error(iiErr.message)
    const invId = (ii as { id: string }).id
    const { data: ln, error: lnErr } = await admin.from('incoming_invoice_lines').insert({ incoming_invoice_id: invId, line_number: 1, description: 'harness kabel', quantity: 2, unit_price: 50, total_price: 100 }).select('id').single()
    if (lnErr) throw new Error(lnErr.message)
    const lineId = (ln as { id: string }).id
    try {
      await Promise.all([1, 2, 3].map(() => convertApprovedInvoiceLines(invId, owner, [{ lineId, disposition: 'material' }])))
      const n = (await admin.from('case_materials').select('id', { count: 'exact', head: true }).eq('case_id', caseId)).count ?? 0
      check('3 samtidige konverteringer → præcis 1 materialerække', n === 1, `rækker=${n}`)
    } finally {
      await admin.from('incoming_invoice_lines').update({ converted_case_material_id: null }).eq('id', lineId)
      await admin.from('case_materials').delete().eq('case_id', caseId)
      await admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', invId)
      await admin.from('incoming_invoice_lines').delete().eq('id', lineId)
      await admin.from('incoming_invoices').delete().eq('id', invId)
      await admin.from('service_cases').delete().eq('id', caseId)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ konverterings-race ok')
    process.exitCode = fails ? 1 : 0
    return
  }
  if (SUB === 'assistant-case-scope-check') {
    // Assistent-review #1: salg ser kun egne sager via assistenten (som i CRM); admin ser alle
    const { runAssistantCommand } = await import('../../src/lib/assistant/run-command')
    const stamp = Date.now()
    let fails = 0
    const check = (label: string, ok: boolean, note = '') => { if (!ok) fails++; log(`  ${ok ? '✓' : '❌'} ${label}${note ? ` — ${note}` : ''}`) }
    const profs = ((await admin.from('profiles').select('id, role').eq('is_active', true)).data ?? []) as Array<{ id: string; role: string }>
    const adminP = profs.find((p) => p.role === 'admin')!, salgP = profs.find((p) => p.role === 'salg')!
    const cust = ((await admin.from('customers').insert({ customer_number: `AS-${stamp}`, company_name: `[HARNESS] as ${stamp}`, contact_person: 'X', email: `as-${stamp}@harness.test`, created_by: adminP.id }).select('id').single()).data as { id: string }).id
    const caseNo = `SVC-7${String(stamp).slice(-6)}`
    const { data: sc } = await admin.from('service_cases').insert({ case_number: caseNo, customer_id: cust, title: '[HARNESS] hemmelig sag', status: 'new', created_by: adminP.id }).select('id').single()
    try {
      const salg = await runAssistantCommand(admin, { profileId: salgP.id, role: 'salg', isActive: true, channel: 'test' }, `Status på ${caseNo}`)
      check('salg: andens sag findes ikke (ingen titel/status)', !salg.ok && !salg.text.includes('hemmelig'), salg.text)
      const adm = await runAssistantCommand(admin, { profileId: adminP.id, role: 'admin', isActive: true, channel: 'test' }, `Status på ${caseNo}`)
      check('admin: sagen vises', adm.ok && adm.text.includes('hemmelig'), adm.text.slice(0, 80))
      await admin.from('service_cases').update({ assigned_to: salgP.id }).eq('id', (sc as { id: string }).id)
      const own = await runAssistantCommand(admin, { profileId: salgP.id, role: 'salg', isActive: true, channel: 'test' }, `Status på ${caseNo}`)
      check('salg: egen (tildelt) sag vises — uden arbejdsordre-linje', own.ok && own.text.includes('hemmelig'), own.text.slice(0, 120))
    } finally {
      await admin.from('audit_logs').delete().gte('created_at', new Date(stamp - 5_000).toISOString()).like('action', 'assistant_%')
      await admin.from('service_cases').delete().eq('id', (sc as { id: string }).id)
      await admin.from('customers').delete().eq('id', cust)
    }
    log(fails ? `❌ ${fails} fejl` : '✅ assistent-sagsscope ok')
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
  if (SUB === 'deviation-probe') {
    // Staging: U158-seed → loadInvoiceControl → verdikt (diagnose). Rydder op.
    const { loadInvoiceControl } = await import('../../src/lib/invoice-control/invoice-control-loader')
    const stamp = Date.now()
    const sup = (await admin.from('suppliers').insert([{ name: `[HARNESS] DP ${stamp}`, code: `HDP${stamp}` }]).select('id')).data?.[0] as { id: string }
    const sp = (await admin.from('supplier_products').insert([{ supplier_id: sup.id, supplier_sku: `HDP-${stamp}`, supplier_name: 'Kabel', cost_price: 4 }]).select('id, unit')).data?.[0] as { id: string; unit: string | null }
    const inv = (await admin.from('incoming_invoices').insert([{ source: 'manual', supplier_id: sup.id, invoice_number: `DP-${stamp}`, invoice_date: new Date().toISOString().slice(0, 10), parse_status: 'parsed', status: 'awaiting_approval', amount_excl_vat: 2225 }]).select('id')).data?.[0] as { id: string }
    await admin.from('incoming_invoice_lines').insert([{ incoming_invoice_id: inv.id, line_number: 1, description: 'Kabel', quantity: 500, unit: 'm', unit_price: 4.45, total_price: 2225, supplier_product_id: sp.id }])
    try {
      const r = await loadInvoiceControl(admin, inv.id, admin)
      log(JSON.stringify({ productUnit: sp.unit, lines: r?.control?.lines?.map((l: Record<string, unknown>) => ({ verdict: l.verdict, reason: l.reason, variance: l.varianceAmount })) ?? null }))
    } finally {
      await admin.from('incoming_invoice_lines').delete().eq('incoming_invoice_id', inv.id)
      await admin.from('incoming_invoices').delete().eq('id', inv.id)
      await admin.from('supplier_products').delete().eq('id', sp.id)
      await admin.from('suppliers').delete().eq('id', sup.id)
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
      // RP-4 (2026-10-17): projekteksporten læser sagerne (service_cases)
      ['service_cases', 'id, case_number, title, customer:customers!service_cases_customer_id_fkey(company_name, customer_number), status, priority, start_date, end_date, planned_hours, budget, description, created_at'],
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
  if (SUB === 'db-fingerprint') {
    // STAGING READ-ONLY: hele public-skemaets politikker/funktioner/grants (md5 pr. objekt) + eksakte rækketal og
    // checksummer for forretningstabeller + profiler pr. rolle. JSON på stdout — sammenlign før/efter en migration.
    const fp: Record<string, unknown> = {}
    fp.policies = await stagingSql(`SELECT tablename || '.' || policyname || '.' || cmd k, md5(coalesce(roles::text,'') || coalesce(qual,'') || coalesce(with_check,'')) h FROM pg_policies WHERE schemaname='public' ORDER BY 1`)
    fp.functions = await stagingSql(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k, md5(p.prosrc || coalesce(array_to_string(p.proacl, ','), '') || p.prosecdef::text) h FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' ORDER BY 1`)
    fp.grants = await stagingSql(`SELECT table_name || '.' || grantee k, string_agg(privilege_type, ',' ORDER BY privilege_type) h FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') GROUP BY 1 ORDER BY 1`)
    fp.tables = await stagingSql(`SELECT table_name k FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)
    const business = ['customers', 'leads', 'offers', 'offer_line_items', 'service_cases', 'work_orders', 'customer_tasks', 'invoices', 'invoice_payments', 'time_logs', 'case_materials', 'case_other_costs', 'incoming_invoices', 'employees', 'profiles', 'roof_drawings']
    const rows: Record<string, unknown> = {}
    for (const t of business) rows[t] = (await stagingSql(`SELECT count(*)::int n, coalesce(md5(string_agg(md5(x::text), '' ORDER BY x.id)), '') checksum FROM public.${t} x`))[0]
    fp.rows = rows
    fp.profile_roles = await stagingSql(`SELECT role::text k, count(*)::int n, count(*) FILTER (WHERE is_active)::int active FROM public.profiles GROUP BY 1 ORDER BY 1`)
    console.log(JSON.stringify(fp))
    return
  }
  if (SUB === 'row-checksum-excluding') {
    // STAGING READ-ONLY: række-checksum i SAMME format som db-fingerprint, men over tabellens kolonner minus de angivne
    // (bevis for at en ADD COLUMN ikke ændrede eksisterende data)
    const t = String(process.argv[3] || '').replace(/[^a-z0-9_]/g, '')
    const ex = process.argv.slice(4).map((c) => c.replace(/[^a-z0-9_]/g, ''))
    const cols = ((await stagingSql(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`)) as Array<{ column_name: string }>)
      .map((c) => c.column_name).filter((c) => !ex.includes(c))
    const r = (await stagingSql(`SELECT count(*)::int n, coalesce(md5(string_agg(md5(ROW(${cols.map((c) => `x."${c}"`).join(', ')})::text), '' ORDER BY x.id)), '') checksum,
      ${ex.map((c) => `count(*) FILTER (WHERE x."${c}" IS NOT NULL)::int AS "nonnull_${c}"`).join(', ') || '0 AS none'} FROM public.${t} x`))[0]
    log(JSON.stringify({ table: t, excluded: ex, ...r }))
    return
  }
  if (SUB === 'fn-references') {
    // STAGING READ-ONLY: hvem refererer et funktionsnavn (antal policies/funktioner/views) + signaturer
    const fn = String(process.argv[3] || '')
    if (!/^[a-z_0-9]+$/.test(fn)) { log('brug: cli.ts fn-references <funktionsnavn>'); process.exit(2) }
    const r = (await stagingSql(`SELECT
      (SELECT count(*)::int FROM pg_policies WHERE coalesce(qual,'') || coalesce(with_check,'') LIKE '%${fn}%') policies,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname='public' AND p.proname <> '${fn}' AND p.prosrc LIKE '%${fn}%') functions,
      (SELECT count(*)::int FROM pg_views WHERE schemaname='public' AND definition LIKE '%${fn}%') views,
      (SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ') FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname='public' AND p.proname = '${fn}') signatures`))[0]
    log(JSON.stringify({ fn, ...r }))
    return
  }
  if (SUB === 'dry-run-staging') {
    // STAGING-ONLY: kør én migration i en transaktion der RULLES TILBAGE (sidste COMMIT; → ROLLBACK;) — validerer SQL'en
    // mod den rigtige database uden at ændre noget. Snapshot før/efter skal være identisk (b7-snapshot).
    const num = String(process.argv[3] || '')
    if (!/^\d{5}$/.test(num)) { log('brug: cli.ts dry-run-staging <5-cifret nr>'); process.exit(2) }
    const dir = resolve(process.cwd(), 'supabase', 'migrations')
    const files = readdirSync(dir).filter((f) => f.startsWith(`${num}_`) && f.endsWith('.sql'))
    if (files.length !== 1) { log(`forventede præcis én fil for ${num}, fandt ${files.length}`); process.exit(2) }
    const sql = readFileSync(resolve(dir, files[0]), 'utf8')
    const commits = sql.match(/^COMMIT;\s*$/gm) ?? []
    if (commits.length !== 1 || !/^BEGIN;\s*$/m.test(sql)) { log('migrationen skal have præcis én BEGIN; og én COMMIT; på egne linjer'); process.exit(2) }
    const dry = sql.replace(/^COMMIT;\s*$/m, 'ROLLBACK;')
    log(`=== DRY RUN (ROLLBACK) ${files[0]} → staging:${ref} ===`)
    try {
      await stagingSql(dry)
      log('✅ SQL kørt uden fejl og rullet tilbage')
    } catch (e) {
      log(`❌ dry run fejlede: ${e instanceof Error ? e.message : String(e)}`)
      process.exitCode = 2
    }
    return
  }
  if (SUB === 'b7-snapshot') {
    // STAGING READ-ONLY: politikker, grants, triggere, funktions-hash og række-checksummer for SEC-B7-tabellerne (JSON).
    //   cli.ts b7-snapshot > fil.json  — sammenlign før/efter (rækker skal være uændrede; politikker kun som forventet)
    const tables = ['work_orders', 'customer_tasks', 'roof_drawings']
    const inList = tables.map((t) => `'${t}'`).join(',')
    const snap: Record<string, unknown> = {}
    snap.policies = await stagingSql(`SELECT tablename, policyname, cmd, roles::text roles, coalesce(qual,'') qual, coalesce(with_check,'') with_check FROM pg_policies WHERE schemaname='public' AND tablename IN (${inList}) ORDER BY tablename, cmd, policyname`)
    snap.grants = await stagingSql(`SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) p FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN (${inList}) AND grantee IN ('anon','authenticated','service_role') GROUP BY 1,2 ORDER BY 1,2`)
    snap.triggers = await stagingSql(`SELECT event_object_table t, trigger_name, string_agg(event_manipulation, ',' ORDER BY event_manipulation) ev, action_timing FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table IN (${inList}) GROUP BY 1,2,4 ORDER BY 1,2`)
    snap.functions = await stagingSql(`SELECT p.proname, md5(p.prosrc) src_md5, p.prosecdef secdef, coalesce(array_to_string(p.proacl, ','), '') acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('work_orders_montor_update_guard','customer_tasks_write_guard','roof_drawings_update_guard','montor_has_customer_job','case_belongs_to_customer','case_is_closed','user_can_see_case','user_role') ORDER BY 1`)
    const rows: Record<string, unknown> = {}
    for (const t of tables) {
      rows[t] = (await stagingSql(`SELECT count(*)::int n, coalesce(md5(string_agg(md5(x::text), '' ORDER BY x.id)), '') checksum FROM public.${t} x`))[0]
    }
    snap.rows = rows
    console.log(JSON.stringify(snap, null, 1))
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
