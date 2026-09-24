/**
 * Test Harness — applyPlan: skriver en deterministisk PLAN til STAGING via
 * service-role klient. Guard-gated (assertRuntimeConfig hard-blokerer prod).
 *
 * - Klient-genererede UUIDs => FK-wiring uden readback.
 * - Alle rows markeres SYNTHETIC (custom_fields/metadata/input_context.harness=seed,
 *   HARNESS-praefiks paa numre, @harness.test paa mails) => sikker cleanup.
 * - Batch-inserts med per-batch timing => latency-metrics.
 * - Indsaetter KUN gyldige rows (constraints/triggers skal holde). Ugyldige
 *   forsoeg hoerer til security-scenarier, ikke her.
 *
 * Skemaet er introspiceret (ingen antagelser): se scripts/dev/introspect-target-tables.ts.
 */
import { randomUUID } from 'crypto'
import { assertRuntimeConfig } from './env-guard'
import type { HarnessPlan } from './planner'
import { SYNTHETIC_TAG } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any

export interface Actors { ownerUid: string; nonAdminUid: string; nonAdminEmail: string; nonAdminPassword: string }

export interface ApplyMetrics {
  seedRunId: string
  perTable: Record<string, number>
  batchLatenciesMs: number[]
  inserts: number
  errors: number
  errorSamples: string[]
  totalMs: number
}

const BATCH = 500

async function insertBatched(admin: Supa, table: string, rows: Record<string, unknown>[], m: ApplyMetrics) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const t0 = Date.now()
    const { error } = await admin.from(table).insert(slice)
    const ms = Date.now() - t0
    m.batchLatenciesMs.push(ms)
    if (error) {
      m.errors += slice.length
      if (m.errorSamples.length < 8) m.errorSamples.push(`${table}: ${error.message}`)
    } else {
      m.inserts += slice.length
      m.perTable[table] = (m.perTable[table] ?? 0) + slice.length
    }
  }
}

/** Opret/genbrug 2 auth-brugere (+profiler): en admin-ejer og en non-admin. */
export async function ensureActors(admin: Supa, seed: string): Promise<Actors> {
  const ownerEmail = `harness-owner+${seed}@harness.test`
  const nonAdminEmail = `harness-montor+${seed}@harness.test`
  const password = `Harness!${seed}!${Math.random().toString(36).slice(2, 10)}`

  async function ensureUser(email: string, pw: string): Promise<string> {
    // findes allerede? (idempotent paa tvaers af koersler)
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = list?.users?.find((u: any) => u.email === email)
    if (existing) return existing.id
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })
    if (error) throw new Error(`createUser(${email}): ${error.message}`)
    return data.user.id
  }

  const ownerUid = await ensureUser(ownerEmail, password)
  const nonAdminUid = await ensureUser(nonAdminEmail, password)

  // Profiler (id -> auth.users). Owner=admin, non-admin uden admin-rolle.
  await admin.from('profiles').upsert([{ id: ownerUid, role: 'admin', is_active: true }], { onConflict: 'id' })
  await admin.from('profiles').upsert([{ id: nonAdminUid, role: 'montoer', is_active: true }], { onConflict: 'id' })

  return { ownerUid, nonAdminUid, nonAdminEmail, nonAdminPassword: password }
}

/**
 * Anvend planen mod staging. Rene tabeller i FK-sikker raekkefoelge.
 * Returnerer metrics (latenser, fejl, per-tabel-tal).
 */
export async function applyPlan(admin: Supa, plan: HarnessPlan, actors: Actors): Promise<ApplyMetrics> {
  assertRuntimeConfig() // hard-blokerer prod, ingen management-token
  const seed = plan.seedRunId.replace(/^harness-/, '')
  const m: ApplyMetrics = { seedRunId: plan.seedRunId, perTable: {}, batchLatenciesMs: [], inserts: 0, errors: 0, errorSamples: [], totalMs: 0 }
  const started = Date.now()
  const owner = actors.ownerUid
  const hz = { harness: seed }
  const seedSafe = seed.replace(/[^a-z0-9]/gi, '') // email-sikker; sikrer global unikhed pr. profil
  const nsEmail = (email: unknown) => `${seedSafe}.${String(email)}`

  // ref -> uuid for alle entiteter (klient-genereret)
  const id = new Map<string, string>()
  const uid = (ref: string) => { let v = id.get(ref); if (!v) { v = randomUUID(); id.set(ref, v) } return v }
  const E = plan.entities
  const of = (kind: string) => E.filter((e) => e.kind === kind)

  // 1) customers
  await insertBatched(admin, 'customers', of('customer').map((e, i) => ({
    id: uid(e.ref), customer_number: `HARNESS-${seed}-C${i + 1}`,
    company_name: e.data.company_name, contact_person: e.data.company_name,
    email: nsEmail(e.data.email), phone: e.data.phone ?? null, created_by: owner,
    notes: SYNTHETIC_TAG, custom_fields: hz, created_at: e.createdAt,
  })), m)

  // 2) leads
  await insertBatched(admin, 'leads', of('lead').map((e) => ({
    id: uid(e.ref), company_name: e.data.name, contact_person: e.data.name,
    email: nsEmail(e.data.email), status: 'won', created_by: owner, // 'won' = konverteret (gyldig lead_status)
    custom_fields: hz, created_at: e.createdAt,
  })), m)

  // 3) incoming_emails (parent = customer)
  await insertBatched(admin, 'incoming_emails', of('incoming_email').map((e) => ({
    id: uid(e.ref), sender_email: e.data.sender_email, subject: e.data.subject,
    customer_id: e.parentRef ? uid(e.parentRef) : null, received_at: e.createdAt, created_at: e.createdAt,
  })), m)

  // 4) service_cases (parent = customer)
  await insertBatched(admin, 'service_cases', of('service_case').map((e, i) => ({
    id: uid(e.ref), title: `[HARNESS ${seed}] Sag ${i + 1}`,
    customer_id: e.parentRef ? uid(e.parentRef) : null, created_by: owner, created_at: e.createdAt,
  })), m)

  // 5) offers (parent = case -> find kundens uuid via case)
  const caseCustomer = new Map<string, string>()
  for (const e of of('service_case')) if (e.parentRef) caseCustomer.set(e.ref, uid(e.parentRef))
  const offers = of('offer')
  await insertBatched(admin, 'offers', offers.map((e) => ({
    id: uid(e.ref), offer_number: e.data.offer_number, title: `[HARNESS ${seed}] Tilbud`,
    customer_id: e.parentRef ? caseCustomer.get(e.parentRef) ?? null : null,
    created_by: owner, total_amount: e.data.total, final_amount: e.data.total, created_at: e.createdAt,
  })), m)

  // 5b) offer_line_items (2 pr. tilbud)
  const lines: Record<string, unknown>[] = []
  for (const e of offers) {
    const oid = uid(e.ref); const total = Number(e.data.total) || 1000
    lines.push({ id: randomUUID(), offer_id: oid, position: 1, description: `[${SYNTHETIC_TAG}] Materialer`, quantity: 1, unit_price: Math.round(total * 0.6), total: Math.round(total * 0.6) })
    lines.push({ id: randomUUID(), offer_id: oid, position: 2, description: `[${SYNTHETIC_TAG}] Arbejde`, quantity: 1, unit_price: Math.round(total * 0.4), total: Math.round(total * 0.4) })
  }
  await insertBatched(admin, 'offer_line_items', lines, m)

  // 5c) customer_documents (parent = case -> kundens uuid)
  await insertBatched(admin, 'customer_documents', of('document').map((e, i): Record<string, unknown> | null => {
    const custId = e.parentRef ? caseCustomer.get(e.parentRef) ?? null : null
    return custId ? {
      id: uid(e.ref), customer_id: custId, service_case_id: e.parentRef ? uid(e.parentRef) : null,
      title: `[HARNESS ${seed}] Dok ${i + 1}`, file_url: `harness://doc/${seed}/${i + 1}`,
      file_name: `doc-${seed}-${i + 1}.pdf`, document_type: 'other', mime_type: 'application/pdf', created_at: e.createdAt,
    } : null
  }).filter((r): r is Record<string, unknown> => r !== null), m)

  // 6) portal_messages (parent = customer)
  await insertBatched(admin, 'portal_messages', of('portal_activity').map((e) => ({
    id: uid(e.ref), customer_id: e.parentRef ? uid(e.parentRef) : null,
    sender_type: 'customer', message: `[${SYNTHETIC_TAG}] portal-besked`, created_at: e.createdAt,
  })).filter((r) => r.customer_id), m)

  // 6b) audit_logs for status-aendringer + medarbejder-handlinger (audit completeness)
  const caseAudit = [
    ...of('status_change').map((e) => ({ id: randomUUID(), entity_type: 'service_case', entity_id: e.parentRef ? uid(e.parentRef) : null, action: 'status_change', user_id: owner, metadata: hz })),
    ...of('employee_action').map((e) => ({ id: randomUUID(), entity_type: 'service_case', entity_id: e.parentRef ? uid(e.parentRef) : null, action: 'employee_action', user_id: owner, metadata: hz })),
  ].filter((r) => r.entity_id)
  await insertBatched(admin, 'audit_logs', caseAudit, m)

  // 7) agent_runs
  await insertBatched(admin, 'agent_runs', of('agent_run').map((e) => ({
    id: uid(e.ref), agent_type: e.data.agent_type ?? 'mail', trigger: e.data.trigger ?? 'manual',
    safety_mode: 'suggest', status: 'awaiting_approval', input_context: hz, created_at: e.createdAt,
  })), m)

  // 8) agent_tasks (parent = run)
  await insertBatched(admin, 'agent_tasks', of('agent_task').map((e, i) => ({
    id: uid(e.ref), run_id: e.parentRef ? uid(e.parentRef) : null, seq: 1,
    kind: e.data.kind ?? 'triage_email', title: `[HARNESS] task ${i + 1}`, created_at: e.createdAt,
  })).filter((r) => r.run_id), m)

  // 9) agent_actions (parent = run; task = task-<mref> udledt af act-ref)
  //    act-<mref> og task-<mref> deler mref => map task pr. run.
  const taskByRun = new Map<string, string>()
  for (const e of of('agent_task')) if (e.parentRef) taskByRun.set(uid(e.parentRef), uid(e.ref))
  const actions = of('agent_action')
  const actionRows = actions.map((e, i) => {
    const runId = e.parentRef ? uid(e.parentRef) : null
    return {
      id: uid(e.ref), run_id: runId, task_id: runId ? taskByRun.get(runId) ?? null : null,
      action_type: 'draft_reply', capability: e.data.capability ?? 'mail.draft_reply',
      side_effect_class: 'read', status: 'planned',
      idempotency_key: `harness:${seed}:${i}`, payload: hz, created_at: e.createdAt,
    }
  }).filter((r) => r.run_id && r.task_id)
  await insertBatched(admin, 'agent_actions', actionRows, m)

  // 9b) en delmaengde eksekveres (status=executed) + audit-spor (invariant-daekning)
  //     bulk-update via .in() (én request pr. batch, ikke pr. row)
  //     read-actions eksekveres: status=executed KRAEVER executed_at (CHECK-constraint).
  const executed = actionRows.filter((_, i) => i % 2 === 0)
  const executedOk: string[] = []
  for (let i = 0; i < executed.length; i += BATCH) {
    const slice = executed.slice(i, i + BATCH)
    const ids = slice.map((a) => a.id)
    const t0 = Date.now()
    const { error } = await admin.from('agent_actions')
      .update({ status: 'executed', executed_by: owner, executed_at: new Date().toISOString() })
      .in('id', ids)
    m.batchLatenciesMs.push(Date.now() - t0)
    if (error) { m.errors += slice.length; if (m.errorSamples.length < 8) m.errorSamples.push(`agent_actions.update: ${error.message}`) }
    else executedOk.push(...ids)
  }
  // audit KUN for faktisk eksekverede (konsistens: ingen orphan-audit)
  await insertBatched(admin, 'audit_logs', executedOk.map((id) => ({
    id: randomUUID(), entity_type: 'agent_action', entity_id: id, action: 'executed',
    user_id: owner, metadata: hz,
  })), m)

  // 10) agent_action_approvals (planens 'agent_approval' -> approved, decided_by=auth uid)
  await insertBatched(admin, 'agent_action_approvals', of('agent_approval').map((e) => ({
    id: randomUUID(), action_id: e.parentRef ? uid(e.parentRef) : null,
    decision: 'approved', decided_by: owner,
  })).filter((r) => r.action_id), m)

  m.totalMs = Date.now() - started
  return m
}

/** Fjern alle syntetiske rows for et seed (SQL via Management API-runner). */
export function cleanupStatements(seed: string): string[] {
  const j = `'${seed}'`
  return [
    `DELETE FROM audit_logs WHERE metadata->>'harness'=${j};`,
    `DELETE FROM agent_runs WHERE input_context->>'harness'=${j};`, // cascader tasks/actions/approvals
    `DELETE FROM offers WHERE offer_number LIKE 'HARNESS-${seed}-%';`, // cascader line_items
    `DELETE FROM incoming_emails WHERE sender_email LIKE '%@harness.test';`,
    `DELETE FROM service_cases WHERE title LIKE '[HARNESS ${seed}]%';`,
    `DELETE FROM customers WHERE custom_fields->>'harness'=${j};`, // cascader documents/portal_messages
    `DELETE FROM leads WHERE custom_fields->>'harness'=${j};`,
  ]
}
