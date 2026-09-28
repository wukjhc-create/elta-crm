/**
 * P2 #11 — capability-audit mod approval/executor-modellen. KUN staging + statisk.
 *
 * Dynamisk (rigtige agent_actions-raekker, agent midlertidigt enabled, deaktiveres i finally):
 *   G1  action-raekke paastaar lavere klasse end capabilityen ('read' i stedet for 'create')  -> afvist, 0 tilbud
 *   G2  capability udfoeres i en forkert agents run (offer-capability i mail-run)           -> afvist, 0 tilbud
 *   G3  raekken siger requires_approval=false for en skrivende capability, ingen approval   -> afvist, 0 tilbud
 *   G4  positiv kontrol: samme som G3 MED gyldig approval                                   -> udfoert, 1 tilbud
 *   G5  send_external med requires_approval=false og uden approval                          -> afvist FOER handler
 * Statisk:
 *   S1  registerets matrix + invarianter (ejer, klasse/approval-regel, handler)
 *   S2  hver agent_actions-insert i agent-koden bruger en registreret capability med matchende klasse
 *   S3  handler-funktionerne kaldes kun fra registeret (ingen genvej uden om Executor)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

export interface GateCheck { id: string; ok: boolean; note: string }
type Sql = (sql: string) => Promise<any[]>
const lit = (v: string) => { if (!/^[0-9a-f-]{36}$/i.test(v)) throw new Error('ikke-uuid'); return `'${v}'` }

export async function runAgentGating(c: { admin: SupabaseClient; sql: Sql; ownerUid: string }): Promise<GateCheck[]> {
  const out: GateCheck[] = []
  const { executeAction } = await import('../../src/lib/agents/executor')
  const { listCapabilities } = await import('../../src/lib/agents/capability-registry')
  const { isHardBlocked } = await import('../../src/types/agent-core.types')

  // ---------- statisk ----------
  const caps = listCapabilities()
  const matrix = caps.map((k) => `${k.key}[${k.agentTypes.join('/')}|${k.sideEffectClass}|${k.defaultRequiresApproval ? 'approval' : 'fri'}${isHardBlocked(k.sideEffectClass) ? '|HARD' : ''}]`)
  const badCaps = caps.filter((k) => !k.handler || k.agentTypes.length === 0 || (k.sideEffectClass !== 'read' && !k.defaultRequiresApproval))
  out.push({ id: 'S1 register-invarianter', ok: badCaps.length === 0, note: `${caps.length} capabilities: ${matrix.join(' ')}` })

  const agentDir = join(process.cwd(), 'src', 'lib', 'agents')
  const files = readdirSync(agentDir).filter((f) => f.endsWith('.ts'))
  const inserts: string[] = []
  const mismatches: string[] = []
  for (const f of files) {
    const src = readFileSync(join(agentDir, f), 'utf8')
    const re = /capability:\s*([A-Z_]+|'[a-z_.]+')[\s\S]{0,300}?side_effect_class:\s*'([a-z_]+)'/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      let key = m[1]
      if (!key.startsWith("'")) key = new RegExp(`const ${key}\\s*=\\s*'([a-z_.]+)'`).exec(src)?.[1] ?? key
      key = key.replace(/'/g, '')
      const cap = caps.find((k) => k.key === key)
      inserts.push(`${f}:${key}`)
      if (!cap) mismatches.push(`${f}: ukendt capability ${key}`)
      else if (cap.sideEffectClass !== m[2]) mismatches.push(`${f}: ${key} insert=${m[2]} register=${cap.sideEffectClass}`)
    }
  }
  // Capabilities uden producent i koden (kan kun opstaa ved direkte service-role-insert) rapporteres som info.
  const produced = new Set(inserts.map((i) => i.split(':')[1]))
  const noProducer = caps.filter((k) => !produced.has(k.key)).map((k) => k.key)
  out.push({ id: 'S2 agent-inserts = register', ok: inserts.length > 0 && mismatches.length === 0,
    note: `${inserts.length} inserts${mismatches.length ? ' · ' + mismatches.join(' | ') : ' · alle klasser matcher'}${noProducer.length ? ` · uden producent: ${noProducer.join(', ')}` : ''}` })

  const handlerFns = ['executeSendReply', 'executeCaseProposal', 'executeOfferProposal', 'executeFollowupTask', 'materializeFollowupDraft']
  const leaks: string[] = []
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [])
  for (const file of walk(join(process.cwd(), 'src'))) {
    const rel = file.replace(process.cwd(), '').replace(/\\/g, '/')
    if (rel.endsWith('capability-registry.ts')) continue
    const src = readFileSync(file, 'utf8')
    for (const fn of handlerFns) {
      if (!new RegExp(`\\b${fn}\\s*\\(`).test(src)) continue
      if (new RegExp(`export (async )?function ${fn}\\b`).test(src) && (src.match(new RegExp(`\\b${fn}\\s*\\(`, 'g')) ?? []).length === 1) continue
      leaks.push(`${rel}: ${fn}`)
    }
  }
  out.push({ id: 'S3 handlere kun via registeret', ok: leaks.length === 0, note: leaks.length ? leaks.join(' | ') : `${handlerFns.length} handlere kaldes kun fra capability-registry.ts` })

  // ---------- dynamisk ----------
  const cs = (await c.sql(`SELECT s.id, s.customer_id, s.case_number, s.title FROM service_cases s WHERE s.title LIKE '[HARNESS %' AND s.is_proposal = false
    AND s.status NOT IN ('closed','converted') AND s.customer_id IS NOT NULL AND s.source_offer_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM agent_actions a WHERE a.capability='offer.propose_draft_from_case' AND a.payload->>'case_id' = s.id::text)
    AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.source_case_id = s.id) ORDER BY s.id LIMIT 1`))[0]
  if (!cs) return [...out, { id: 'setup', ok: false, note: 'ingen egnet harness-sag' }]
  const runs: string[] = []
  const offersFor = async () => Number((await c.sql(`SELECT count(*)::int n FROM offers WHERE source_case_id=${lit(cs.id)}`))[0].n)

  const mkAction = async (agentType: string, a: { capability: string; side_effect_class: string; requires_approval: boolean; payload: Record<string, unknown>; approve?: boolean }) => {
    const { data: run } = await c.admin.from('agent_runs').insert({ agent_type: agentType, trigger: 'manual', status: 'awaiting_approval', safety_mode: 'suggest',
      dry_run: true, input_context: { harness: 'agent-gating' }, summary: '[HARNESS] gating', started_at: new Date().toISOString() }).select('id').single()
    const runId = (run as { id: string }).id
    runs.push(runId)
    const { data: task } = await c.admin.from('agent_tasks').insert({ run_id: runId, seq: 0, kind: 'harness', title: '[HARNESS] gating', status: 'proposed' }).select('id').single()
    const { data: act, error } = await c.admin.from('agent_actions').insert({ task_id: (task as { id: string }).id, run_id: runId, action_type: 'harness_gating',
      capability: a.capability, side_effect_class: a.side_effect_class, requires_approval: a.requires_approval, min_approvals: 1,
      idempotency_key: `harness-gating:${runId}`, status: 'awaiting_approval', payload: a.payload }).select('id').single()
    if (error || !act) throw new Error(`action-insert: ${error?.message}`)
    const id = (act as { id: string }).id
    if (a.approve) await c.admin.from('agent_action_approvals').insert([{ action_id: id, decision: 'approved', decided_by: c.ownerUid }])
    return id
  }
  const offerPayload = { case_id: cs.id, customer_id: cs.customer_id, proposed_title: `Tilbud - ${cs.title}` }
  const setEnabled = (t: string, on: boolean) => c.sql(`UPDATE agent_configs SET enabled = ${on} WHERE agent_type = '${t}'`)

  try {
    await setEnabled('offer', true)
    await setEnabled('mail', true)

    const g1 = await executeAction(await mkAction('offer', { capability: 'offer.propose_draft_from_case', side_effect_class: 'read', requires_approval: false, payload: offerPayload }))
    out.push({ id: 'G1 klasse-mismatch', ok: g1.data?.status === 'refused' && /klasse-mismatch/.test(g1.data?.reason ?? '') && (await offersFor()) === 0,
      note: `${g1.data?.status}: ${g1.data?.reason ?? g1.error} · tilbud=${await offersFor()}` })

    const g2 = await executeAction(await mkAction('mail', { capability: 'offer.propose_draft_from_case', side_effect_class: 'create', requires_approval: true, payload: offerPayload, approve: true }))
    out.push({ id: 'G2 forkert agent', ok: g2.data?.status === 'refused' && /tilhoerer ikke/.test(g2.data?.reason ?? '') && (await offersFor()) === 0,
      note: `${g2.data?.status}: ${g2.data?.reason ?? g2.error} · tilbud=${await offersFor()}` })

    const g3 = await executeAction(await mkAction('offer', { capability: 'offer.propose_draft_from_case', side_effect_class: 'create', requires_approval: false, payload: offerPayload }))
    out.push({ id: 'G3 raekke kan ikke fjerne approval', ok: g3.data?.status === 'refused' && /mangler gyldig/.test(g3.data?.reason ?? '') && (await offersFor()) === 0,
      note: `${g3.data?.status}: ${g3.data?.reason ?? g3.error} · tilbud=${await offersFor()}` })

    const g4 = await executeAction(await mkAction('offer', { capability: 'offer.propose_draft_from_case', side_effect_class: 'create', requires_approval: false, payload: offerPayload, approve: true }))
    out.push({ id: 'G4 positiv kontrol (med approval)', ok: g4.data?.status === 'executed' && (await offersFor()) === 1,
      note: `${g4.data?.status ?? g4.error} · tilbud=${await offersFor()}` })

    // G5 — kun hvis Graph IKKE er konfigureret i denne proces (dobbelt sikring: selv en fejlet gate kan ikke sende)
    const { isGraphConfigured } = await import('../../src/lib/services/microsoft-graph')
    if (isGraphConfigured()) {
      out.push({ id: 'G5 send_external uden approval', ok: false, note: 'SPRUNGET OVER: Graph er konfigureret i harness-processen (vil ikke risikere en afsendelse)' })
    } else {
      const g5 = await executeAction(await mkAction('mail', { capability: 'mail.send_reply', side_effect_class: 'send_external', requires_approval: false,
        payload: { email_id: '00000000-0000-4000-8000-00000000g500'.replace('g5', 'a5'), to: 'harness@harness.test', subject: '[HARNESS]', body: 'probe' } }))
      out.push({ id: 'G5 send_external uden approval', ok: g5.data?.status === 'refused' && /mangler gyldig/.test(g5.data?.reason ?? ''),
        note: `${g5.data?.status}: ${g5.data?.reason ?? g5.error}` })
    }
  } finally {
    await setEnabled('offer', false)
    await setEnabled('mail', false)
    await c.sql(`DELETE FROM offers WHERE source_case_id=${lit(cs.id)}`)
    for (const r of runs) await c.sql(`DELETE FROM audit_logs WHERE entity_type='agent_action' AND entity_id IN (SELECT id FROM agent_actions WHERE run_id=${lit(r)}); DELETE FROM agent_runs WHERE id=${lit(r)};`)
  }
  return out
}

export function formatAgentGating(c: GateCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'AGENT-GATING (capability vs. approval/executor):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(36)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} gating-checks som forventet`].join('\n')
}
