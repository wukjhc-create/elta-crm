/**
 * Test Harness — app-lags sikkerhedsscenarier (KUN staging).
 *
 * Koerer RIGTIG app-kode (executor, capability-handler, portal-validering,
 * storage-klient) mod staging. Forudsaetning: bindAppEnvToStaging() er kaldt,
 * saa createAdminClient() peger paa staging — kalderen verificerer dette.
 *
 * Scenarier (fra SECURITY_SCENARIOS):
 *   disabled_agent_execute      executor afviser naar agent_configs.enabled=false
 *   duplicate_execution         executeAction paa executed => noop, ingen ny effekt
 *   manipulated_customer_id_link valgt kunde udenfor kandidater => afvist, mail uaendret
 *   invalid_portal_token        malformet/ukendt/udloebet/inaktivt token => afvist
 *   storage_access_no_right     anon list/download/sign i private buckets => afvist
 *
 * Probe-rows tagges 'harness-sec:' / harness-kunder og ryddes efter hvert scenarie.
 * Probe-actions bruger en UKENDT capability, saa intet kan udfoeres selv hvis en
 * agent ved en fejl var enabled (executor refuser paa capability-opslag).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export interface ScenarioResult { id: string; ok: boolean; note: string; skipped?: boolean }
type Sql = (sql: string) => Promise<any[]>

interface Ctx { admin: SupabaseClient; anon: SupabaseClient; sql: Sql; ownerUid: string }

const PROBE_CAPABILITY = 'harness.probe_noop'
const uuidRe = /^[0-9a-f-]{36}$/i
const lit = (v: string) => { if (!uuidRe.test(v)) throw new Error('ikke-uuid i probe-SQL'); return `'${v}'` }

async function harnessRunTask(sql: Sql): Promise<{ rid: string; tid: string } | null> {
  const r = (await sql(`SELECT r.id rid, t.id tid FROM agent_runs r JOIN agent_tasks t ON t.run_id=r.id WHERE r.input_context->>'harness' IS NOT NULL LIMIT 1`))[0]
  return r ? { rid: r.rid, tid: r.tid } : null
}

async function auditCount(sql: Sql, actionId: string): Promise<number> {
  return Number((await sql(`SELECT count(*) n FROM audit_logs WHERE entity_type='agent_action' AND entity_id=${lit(actionId)}`))[0].n)
}

async function disabledAgentExecute(c: Ctx): Promise<ScenarioResult> {
  const id = 'disabled_agent_execute'
  const enabled = Number((await c.sql(`SELECT count(*) n FROM agent_configs WHERE enabled=true`))[0].n)
  if (enabled !== 0) return { id, ok: false, note: `precondition brudt: ${enabled} agent(er) enabled` }
  const rt = await harnessRunTask(c.sql)
  if (!rt) return { id, ok: false, note: 'ingen harness-run (kør pilot/persist foerst)' }
  const ins = await c.admin.from('agent_actions').insert([{
    run_id: rt.rid, task_id: rt.tid, action_type: 'probe', capability: PROBE_CAPABILITY,
    side_effect_class: 'read', status: 'planned', requires_approval: false, idempotency_key: `harness-sec:dis:${Date.now()}`,
  }]).select('id')
  const aid = ins.data?.[0]?.id as string | undefined
  if (!aid) return { id, ok: false, note: `kunne ikke oprette probe: ${ins.error?.message?.slice(0, 60)}` }
  try {
    const { executeAction } = await import('../../src/lib/agents/executor')
    const r = await executeAction(aid)
    const after = (await c.sql(`SELECT status FROM agent_actions WHERE id=${lit(aid)}`))[0]?.status
    const refused = r.data?.status === 'refused' && r.data?.reason === 'agent disabled'
    const audited = (await auditCount(c.sql, aid)) >= 1
    return { id, ok: refused && after === 'planned' && audited, note: `executor=${r.data?.status}/${r.data?.reason ?? '-'} status=${after} audit=${audited}` }
  } finally {
    await c.sql(`DELETE FROM audit_logs WHERE entity_type='agent_action' AND entity_id=${lit(aid)}; DELETE FROM agent_actions WHERE id=${lit(aid)};`)
  }
}

async function duplicateExecution(c: Ctx): Promise<ScenarioResult> {
  const id = 'duplicate_execution'
  const a = (await c.sql(`SELECT a.id, a.updated_at::text u, a.executed_at::text e FROM agent_actions a JOIN agent_runs r ON r.id=a.run_id WHERE r.input_context->>'harness' IS NOT NULL AND a.status='executed' LIMIT 1`))[0]
  if (!a) return { id, ok: false, note: 'ingen executed harness-action at teste mod' }
  const auditBefore = await auditCount(c.sql, a.id)
  const { executeAction } = await import('../../src/lib/agents/executor')
  const r = await executeAction(a.id)
  const after = (await c.sql(`SELECT status, updated_at::text u, executed_at::text e FROM agent_actions WHERE id=${lit(a.id)}`))[0]
  const auditAfter = await auditCount(c.sql, a.id)
  const unchanged = after.status === 'executed' && after.u === a.u && after.e === a.e && auditAfter === auditBefore
  return { id, ok: r.data?.status === 'noop' && unchanged, note: `executor=${r.data?.status} uaendret=${unchanged} audit ${auditBefore}->${auditAfter}` }
}

async function manipulatedCustomerLink(c: Ctx): Promise<ScenarioResult> {
  const id = 'manipulated_customer_id_link'
  const { validateCandidateSelection } = await import('../../src/lib/agents/mail-confidence')
  const { getCapability } = await import('../../src/lib/agents/capability-registry')
  const custs = await c.sql(`SELECT id FROM customers WHERE custom_fields->>'harness' IS NOT NULL LIMIT 3`)
  const mail = (await c.sql(`SELECT id, customer_id FROM incoming_emails WHERE sender_email LIKE '%@harness.test' AND customer_id IS NOT NULL LIMIT 1`))[0]
  if (custs.length < 3 || !mail) return { id, ok: false, note: 'mangler harness-kunder/mails' }
  const [A, B, X] = custs.map((r: any) => r.id as string)
  // Server-action-laget: valg udenfor kandidater + stale kandidatliste afvises
  const tamper = validateCandidateSelection([A, B], [A, B], X)
  const stale = validateCandidateSelection([A, B], [A], A)
  // Handler-laget (rigtig handler, staging-admin): manipuleret selected => afvist, mail uaendret
  const handler = getCapability('mail.link_customer')?.handler
  if (!handler) return { id, ok: false, note: 'mail.link_customer uden handler' }
  const res = await handler({
    action: { payload: { email_id: mail.id, conflicts: true, candidates: [{ id: A }, { id: B }], selected_customer_id: X } },
    run: {}, admin: c.admin,
  } as any)
  const after = (await c.sql(`SELECT customer_id FROM incoming_emails WHERE id=${lit(mail.id)}`))[0]
  const unchanged = after.customer_id === mail.customer_id
  return {
    id, ok: !tamper.ok && !stale.ok && !res.ok && unchanged,
    note: `action-lag tamper=${tamper.ok ? 'ACCEPT' : 'afvist'} stale=${stale.ok ? 'ACCEPT' : 'afvist'} | handler=${res.ok ? 'LINKEDE' : 'afvist'} mail uaendret=${unchanged}`,
  }
}

async function invalidPortalToken(c: Ctx): Promise<ScenarioResult> {
  const id = 'invalid_portal_token'
  const cust = (await c.sql(`SELECT id, email FROM customers WHERE custom_fields->>'harness' IS NOT NULL AND email IS NOT NULL LIMIT 1`))[0]
  if (!cust) return { id, ok: false, note: 'ingen harness-kunde' }
  const expiredTok = randomBytes(32).toString('hex')
  const inactiveTok = randomBytes(32).toString('hex')
  const ins = await c.admin.from('portal_access_tokens').insert([
    { customer_id: cust.id, token: expiredTok, email: cust.email, is_active: true, expires_at: new Date(Date.now() - 86_400_000).toISOString(), created_by: c.ownerUid },
    { customer_id: cust.id, token: inactiveTok, email: cust.email, is_active: false, created_by: c.ownerUid },
  ]).select('id')
  const ids = (ins.data ?? []).map((r: any) => r.id as string)
  try {
    if (ids.length !== 2) return { id, ok: false, note: `kunne ikke oprette probe-tokens: ${ins.error?.message?.slice(0, 60)}` }
    const { validatePortalToken } = await import('../../src/lib/actions/portal')
    const cases: Record<string, string> = {
      malformet: 'abc; drop table', ukendt: randomBytes(32).toString('hex'), udloebet: expiredTok, inaktiv: inactiveTok,
    }
    const accepted: string[] = []
    for (const [name, tok] of Object.entries(cases)) if ((await validatePortalToken(tok)).success) accepted.push(name)
    // Anon maa ikke kunne enumerere tokens direkte
    const { data: anonRows, error: anonErr } = await c.anon.from('portal_access_tokens').select('id').limit(5)
    const anonDenied = !!anonErr || !anonRows || anonRows.length === 0
    return {
      id, ok: accepted.length === 0 && anonDenied,
      note: `afvist ${4 - accepted.length}/4${accepted.length ? ` (ACCEPTERET: ${accepted.join(',')})` : ''} | anon enumerate=${anonDenied ? 'afvist' : `${anonRows!.length} rows SYNLIGE`}`,
    }
  } finally {
    if (ids.length) await c.sql(`DELETE FROM portal_access_tokens WHERE id IN (${ids.map(lit).join(',')})`)
  }
}

/** Private buckets som migrationerne (00035, 00113, 00133) definerer i production. */
const EXPECTED_PRIVATE_BUCKETS = ['attachments', 'portal-attachments', 'service-case-files']

async function storageAccessNoRight(c: Ctx): Promise<ScenarioResult> {
  const id = 'storage_access_no_right'
  const rows = await c.sql(`SELECT id, public FROM storage.buckets ORDER BY id`)
  const priv = rows.filter((b: any) => b.public === false).map((b: any) => b.id as string)
  const wronglyPublic = rows.filter((b: any) => b.public === true && EXPECTED_PRIVATE_BUCKETS.includes(b.id)).map((b: any) => b.id)
  const missing = EXPECTED_PRIVATE_BUCKETS.filter((b) => !rows.some((r: any) => r.id === b))
  if (!priv.length) return { id, ok: wronglyPublic.length === 0, skipped: true, note: `ingen private buckets i staging — ikke testbar (mangler: ${missing.join(',') || '-'})` }

  const leaks: string[] = [...wronglyPublic.map((b: string) => `${b}:PUBLIC`)]
  let probed = 0
  for (const b of priv) {
    // Probe-objekt uploades med service-role saa download/sign testes mod et objekt der FINDES
    const path = `harness-sec/probe-${Date.now()}.pdf`
    const up = await c.admin.storage.from(b).upload(path, Buffer.from('%PDF-1.4 harness probe'), { contentType: 'application/pdf', upsert: false })
    try {
      const { data: listed, error: listErr } = await c.anon.storage.from(b).list('harness-sec', { limit: 5 })
      if (!listErr && listed && listed.length > 0) leaks.push(`${b}:list`)
      if (!up.error) {
        probed++
        const dl = await c.anon.storage.from(b).download(path)
        if (!dl.error && dl.data) leaks.push(`${b}:download`)
        const su = await c.anon.storage.from(b).createSignedUrl(path, 60)
        if (!su.error && su.data?.signedUrl) leaks.push(`${b}:sign`)
      }
    } finally {
      if (!up.error) await c.admin.storage.from(b).remove([path])
    }
  }
  if (leaks.length) {
    // Diagnose: hvilke storage.objects-policies giver anon/public adgang?
    const pol = await c.sql(`SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[]) ORDER BY 1`)
    leaks.push(`anon/public-policies=[${pol.map((p: any) => `${p.policyname}(${p.cmd})`).join('; ') || 'ingen'}]`)
  }
  return {
    id, ok: leaks.length === 0,
    note: `private=${priv.join(',')} probe-objekter=${probed}/${priv.length}${missing.length ? ` | PARITET mangler: ${missing.join(',')}` : ''}${leaks.length ? ` | LAEK: ${leaks.join(',')}` : ' | alt afvist'}`,
  }
}

export async function runAppLayerScenarios(c: Ctx): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = []
  for (const fn of [disabledAgentExecute, duplicateExecution, manipulatedCustomerLink, invalidPortalToken, storageAccessNoRight]) {
    try { out.push(await fn(c)) } catch (e: any) { out.push({ id: fn.name, ok: false, note: `EXCEPTION: ${String(e.message).slice(0, 100)}` }) }
  }
  return out
}
