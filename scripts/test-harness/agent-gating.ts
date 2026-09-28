/**
 * P2 #11 — capability-audit mod approval/executor-modellen. KUN staging + statisk.
 *
 * Dynamisk (rigtige agent_actions-raekker, agent midlertidigt enabled, deaktiveres i finally):
 *   G1-G3, G5, G6  DB-guarden (00163) afviser manipulerede raekker ved INSERT: lavere klasse, forkert agent,
 *                  requires_approval=false for approval-capability, ukendt capability
 *   G7  UPDATE af klasse/approval/capability efter oprettelse                  -> afvist af DB
 *   G8  status -> executing direkte (uden om Executor) uden approval           -> afvist af DB
 *   G4  positiv kontrol: gyldig raekke + approval                              -> udfoert, 1 tilbud
 *   G9  Executor (andet lag): gyldig send_external uden approval               -> afvist FOER handler
 *   S4  DB-spejlet agent_capabilities = capability-registeret
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

  // Opret run+task og forsoeg at indsaette en action. Returnerer id ELLER DB-afvisningen (00163-guarden).
  const tryAction = async (agentType: string, a: { capability: string; side_effect_class: string; requires_approval: boolean; payload: Record<string, unknown>; approve?: boolean }) => {
    const { data: run } = await c.admin.from('agent_runs').insert({ agent_type: agentType, trigger: 'manual', status: 'awaiting_approval', safety_mode: 'suggest',
      dry_run: true, input_context: { harness: 'agent-gating' }, summary: '[HARNESS] gating', started_at: new Date().toISOString() }).select('id').single()
    const runId = (run as { id: string }).id
    runs.push(runId)
    const { data: task } = await c.admin.from('agent_tasks').insert({ run_id: runId, seq: 0, kind: 'harness', title: '[HARNESS] gating', status: 'proposed' }).select('id').single()
    const { data: act, error } = await c.admin.from('agent_actions').insert({ task_id: (task as { id: string }).id, run_id: runId, action_type: 'harness_gating',
      capability: a.capability, side_effect_class: a.side_effect_class, requires_approval: a.requires_approval, min_approvals: 1,
      idempotency_key: `harness-gating:${runId}`, status: 'awaiting_approval', payload: a.payload }).select('id').single()
    const id = (act as { id?: string } | null)?.id
    if (id && a.approve) await c.admin.from('agent_action_approvals').insert([{ action_id: id, decision: 'approved', decided_by: c.ownerUid }])
    return { id, error: error ? `${error.code ?? ''} ${error.message}`.trim() : null }
  }
  const mustAction = async (...args: Parameters<typeof tryAction>) => {
    const r = await tryAction(...args)
    if (!r.id) throw new Error(`action-insert: ${r.error}`)
    return r.id
  }
  const dbRejected = (r: { id?: string; error: string | null }, re: RegExp) => !r.id && !!r.error && re.test(r.error)
  const offerPayload = { case_id: cs.id, customer_id: cs.customer_id, proposed_title: `Tilbud - ${cs.title}` }
  const offerCap = { capability: 'offer.propose_draft_from_case', side_effect_class: 'create', requires_approval: true, payload: offerPayload }
  const setEnabled = (t: string, on: boolean) => c.sql(`UPDATE agent_configs SET enabled = ${on} WHERE agent_type = '${t}'`)
  const note = (r: { id?: string; error: string | null }) => (r.id ? 'INDSAT (ikke afvist)' : `DB afviste: ${(r.error ?? '').slice(0, 70)}`)

  try {
    await setEnabled('offer', true)
    await setEnabled('mail', true)

    // ---- DB-guarden (00163): manipulerede raekker kan slet ikke oprettes
    const g1 = await tryAction('offer', { ...offerCap, side_effect_class: 'read', requires_approval: false })
    out.push({ id: 'G1 klasse-mismatch (DB)', ok: dbRejected(g1, /side_effect_class/) && (await offersFor()) === 0, note: note(g1) })
    const g2 = await tryAction('mail', { ...offerCap, approve: true })
    out.push({ id: 'G2 forkert agent (DB)', ok: dbRejected(g2, /maa ikke bruge capability/) && (await offersFor()) === 0, note: note(g2) })
    const g3 = await tryAction('offer', { ...offerCap, requires_approval: false })
    out.push({ id: 'G3 approval kan ikke fjernes (DB)', ok: dbRejected(g3, /kraever approval/), note: note(g3) })
    const g6 = await tryAction('offer', { ...offerCap, capability: 'offer.send_to_customer' })
    out.push({ id: 'G6 ukendt capability (DB)', ok: dbRejected(g6, /ukendt capability/), note: note(g6) })
    const g5a = await tryAction('mail', { capability: 'mail.send_reply', side_effect_class: 'send_external', requires_approval: false, payload: { email_id: '00000000-0000-4000-8000-0000000000a5' } })
    out.push({ id: 'G5 send_external uden approval (DB)', ok: dbRejected(g5a, /kraever approval/), note: note(g5a) })

    // ---- manipulation efter oprettelse
    const legit = await mustAction('offer', offerCap)
    const upClass = await c.admin.from('agent_actions').update({ side_effect_class: 'read' }).eq('id', legit).select('id')
    const upApproval = await c.admin.from('agent_actions').update({ requires_approval: false }).eq('id', legit).select('id')
    const upCap = await c.admin.from('agent_actions').update({ capability: 'mail.draft_reply' }).eq('id', legit).select('id')
    const row = (await c.sql(`SELECT capability, side_effect_class, requires_approval FROM agent_actions WHERE id=${lit(legit)}`))[0]
    out.push({ id: 'G7 UPDATE kan ikke loesne (DB)', ok: !!upClass.error && !!upApproval.error && !!upCap.error && row.side_effect_class === 'create' && row.requires_approval === true && row.capability === offerCap.capability,
      note: `klasse=${upClass.error ? 'afvist' : 'ÆNDRET'} · approval=${upApproval.error ? 'afvist' : 'ÆNDRET'} · capability=${upCap.error ? 'afvist' : 'ÆNDRET'}` })

    // ---- status -> executing uden om Executor, uden approval (tidligere kun blokeret for hard-blocked klasser)
    const bypass = await c.admin.from('agent_actions').update({ status: 'executing' }).eq('id', legit).select('id')
    out.push({ id: 'G8 executing uden approval (DB)', ok: !!bypass.error && /approval/.test(bypass.error.message),
      note: bypass.error ? `DB afviste: ${bypass.error.message.slice(0, 70)}` : 'TILLADT' })

    // ---- positiv kontrol: gyldig raekke + approval -> Executor udfoerer
    await c.admin.from('agent_action_approvals').insert([{ action_id: legit, decision: 'approved', decided_by: c.ownerUid }])
    const g4 = await executeAction(legit)
    out.push({ id: 'G4 positiv kontrol (med approval)', ok: g4.data?.status === 'executed' && (await offersFor()) === 1,
      note: `${g4.data?.status ?? g4.error} · tilbud=${await offersFor()}` })

    // ---- Executor-laget (andet lag): gyldig send_external-raekke uden approval afvises foer handler
    const { isGraphConfigured } = await import('../../src/lib/services/microsoft-graph')
    if (isGraphConfigured()) {
      out.push({ id: 'G9 Executor: send uden approval', ok: false, note: 'SPRUNGET OVER: Graph er konfigureret i harness-processen (vil ikke risikere en afsendelse)' })
    } else {
      const sendId = await mustAction('mail', { capability: 'mail.send_reply', side_effect_class: 'send_external', requires_approval: true,
        payload: { email_id: '00000000-0000-4000-8000-0000000000a6', to: 'harness@harness.test', subject: '[HARNESS]', body: 'probe' } })
      const g9 = await executeAction(sendId)
      out.push({ id: 'G9 Executor: send uden approval', ok: g9.data?.status === 'refused' && /mangler gyldig/.test(g9.data?.reason ?? ''), note: `${g9.data?.status}: ${g9.data?.reason ?? g9.error}` })
    }
  } finally {
    await setEnabled('offer', false)
    await setEnabled('mail', false)
    await c.sql(`DELETE FROM offers WHERE source_case_id=${lit(cs.id)}`)
    for (const r of runs) await c.sql(`DELETE FROM audit_logs WHERE entity_type='agent_action' AND entity_id IN (SELECT id FROM agent_actions WHERE run_id=${lit(r)}); DELETE FROM agent_runs WHERE id=${lit(r)};`)
  }

  // ---- S4 paritet: DB-spejlet = registeret
  const dbCaps = (await c.sql(`SELECT key, side_effect_class, requires_approval, min_approvals, agent_types FROM agent_capabilities ORDER BY key`)) as Array<{ key: string; side_effect_class: string; requires_approval: boolean; min_approvals: number; agent_types: string[] }>
  const diff: string[] = []
  for (const k of caps) {
    const d = dbCaps.find((x) => x.key === k.key)
    if (!d) { diff.push(`${k.key} mangler i DB`); continue }
    if (d.side_effect_class !== k.sideEffectClass || d.requires_approval !== k.defaultRequiresApproval || d.min_approvals !== k.minApprovals
      || [...d.agent_types].sort().join() !== [...k.agentTypes].sort().join()) diff.push(`${k.key} afviger`)
  }
  for (const d of dbCaps) if (!caps.some((k) => k.key === d.key)) diff.push(`${d.key} kun i DB`)
  out.push({ id: 'S4 DB-spejl = register', ok: diff.length === 0, note: diff.length ? diff.join(' | ') : `${dbCaps.length} capabilities identiske (klasse, approval, min, agenter)` })
  return out
}

export function formatAgentGating(c: GateCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'AGENT-GATING (capability vs. approval/executor):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(36)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} gating-checks som forventet`].join('\n')
}
