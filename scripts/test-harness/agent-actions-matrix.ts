/**
 * P2 #12 — stale-state / idempotens / samtidighed for ALLE agent-actions. KUN staging.
 * (Tilbud + opfoelgning er daekket af fase5-flows + harness:concurrency C1–C5; her daekkes mail-capabilities
 *  og sagsforslag gennem den rigtige Executor. Mail-agenten er kun enabled inden for scenariet.)
 *
 *   M1  3x parallel runMailAgent paa samme mail            -> præcis 1 action pr. capability
 *   M2  3x parallel udfoer draft_reply                      -> 1 executed, resten noop; gentag = noop
 *   M3  STALE link: mailen kobles manuelt til en ANDEN kunde efter forslaget -> agenten overskriver IKKE
 *   M4  3x parallel udfoer godkendt link_customer            -> 1 executed; mailen koblet til rette kunde
 *   M5  3x parallel udfoer godkendt case.propose_from_email  -> 1 executed; præcis 1 sag
 *   M6  genkoersel af mailagent efter afgjorte forslag       -> ingen nye dubletter (idempotency_key)
 *   M7  action der haenger i 'executing' (crash) >15 min    -> Pilot Health roed; Executor genoptager den IKKE
 * Probe-kunder/-mails/-sager/-runs oprettes og slettes af scenariet selv.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MatrixCheck { id: string; ok: boolean; note: string }
type Sql = (sql: string) => Promise<any[]>
const lit = (v: string) => { if (!/^[0-9a-f-]{36}$/i.test(v)) throw new Error('ikke-uuid'); return `'${v}'` }

export async function runAgentActionsMatrix(c: { admin: SupabaseClient; sql: Sql; ownerUid: string }): Promise<MatrixCheck[]> {
  const out: MatrixCheck[] = []
  const { runMailAgent } = await import('../../src/lib/agents/mail-agent')
  const { executeAction } = await import('../../src/lib/agents/executor')
  const stamp = Date.now()
  const created: Array<{ table: string; id: string }> = []
  const runIds = new Set<string>()
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.unshift({ table, id })
    return id
  }
  const actionsFor = async (mailId: string) => (await c.sql(`SELECT a.id, a.capability, a.status, a.run_id FROM agent_actions a
    WHERE a.payload->>'email_id' = '${mailId}' ORDER BY a.capability`)) as Array<{ id: string; capability: string; status: string; run_id: string }>
  const approve = (actionId: string) => c.admin.from('agent_action_approvals').insert([{ action_id: actionId, decision: 'approved', decided_by: c.ownerUid }])
  const parallelExec = async (actionId: string, n = 3) => (await Promise.all(Array.from({ length: n }, () => executeAction(actionId)))).map((r) => r.data?.status ?? `fejl:${r.error}`)
  const mailCustomer = async (mailId: string) => ((await c.sql(`SELECT customer_id FROM incoming_emails WHERE id=${lit(mailId)}`))[0]?.customer_id ?? null) as string | null

  const custA = await ins('customers', { customer_number: `HARNESS-MX-A-${stamp}`, company_name: '[HARNESS] matrix A', contact_person: 'A', email: `mx-a-${stamp}@harness.test`, created_by: c.ownerUid, custom_fields: { harness: 'matrix' } })
  const custB = await ins('customers', { customer_number: `HARNESS-MX-B-${stamp}`, company_name: '[HARNESS] matrix B', contact_person: 'B', email: `mx-b-${stamp}@harness.test`, created_by: c.ownerUid, custom_fields: { harness: 'matrix' } })
  const mail1 = await ins('incoming_emails', { sender_email: `mx-a-${stamp}@harness.test`, sender_name: '', subject: '[HARNESS] matrix stale', body_text: 'Hej, vi vil gerne have et tilbud på en elinstallation.' })
  const mail2 = await ins('incoming_emails', { sender_email: `mx-a-${stamp}@harness.test`, sender_name: '', subject: '[HARNESS] matrix race', body_text: 'Hej, vi vil gerne have et tilbud på en elinstallation.' })

  await c.sql(`UPDATE agent_configs SET enabled = true WHERE agent_type = 'mail'`)
  try {
    // M1
    const r1 = await Promise.all(Array.from({ length: 3 }, () => runMailAgent(mail1, { dryRun: true })))
    for (const r of r1) if (r.data?.runId) runIds.add(r.data.runId)
    const a1 = await actionsFor(mail1)
    const byCap = a1.reduce<Record<string, number>>((m, a) => ({ ...m, [a.capability]: (m[a.capability] ?? 0) + 1 }), {})
    out.push({ id: 'M1 3x parallel mailagent', ok: byCap['mail.draft_reply'] === 1 && byCap['mail.link_customer'] === 1 && Object.values(byCap).every((n) => n === 1),
      note: `actions=${JSON.stringify(byCap)} · forslag pr. kald=[${r1.map((r) => r.data?.proposals ?? 'fejl').join(',')}]` })

    // M2
    const draft = a1.find((a) => a.capability === 'mail.draft_reply')
    if (draft) {
      const st = await parallelExec(draft.id)
      const again = (await executeAction(draft.id)).data?.status
      out.push({ id: 'M2 parallel udkast-materialisering', ok: st.filter((s) => s === 'executed').length === 1 && st.every((s) => s === 'executed' || s === 'noop') && again === 'noop',
        note: `udfald=[${st.join(',')}] · gentag=${again}` })
    }

    // M3 stale link
    const link1 = a1.find((a) => a.capability === 'mail.link_customer')
    if (link1) {
      await approve(link1.id)
      await c.sql(`UPDATE incoming_emails SET customer_id=${lit(custB)}, link_status='linked' WHERE id=${lit(mail1)}`) // menneske kobler til B
      const ex = await executeAction(link1.id)
      const after = await mailCustomer(mail1)
      out.push({ id: 'M3 stale link overskriver ikke', ok: after === custB && ex.data?.status !== 'executed',
        note: `udfald=${ex.data?.status ?? ex.error} (${(ex.error ?? ex.data?.reason ?? '').slice(0, 70)}) · mail koblet til ${after === custB ? 'B (menneskets valg bevaret)' : after === custA ? 'A — OVERSKREVET' : after}` })
    }

    // M4 parallel link
    const r2 = await runMailAgent(mail2, { dryRun: true })
    if (r2.data?.runId) runIds.add(r2.data.runId)
    const link2 = (await actionsFor(mail2)).find((a) => a.capability === 'mail.link_customer')
    if (link2) {
      await approve(link2.id)
      const st = await parallelExec(link2.id)
      const linked = await mailCustomer(mail2)
      out.push({ id: 'M4 parallel godkendt kobling', ok: st.filter((s) => s === 'executed').length === 1 && linked === custA,
        note: `udfald=[${st.join(',')}] · koblet til ${linked === custA ? 'A (korrekt)' : linked}` })
    } else out.push({ id: 'M4 parallel godkendt kobling', ok: false, note: 'intet link-forslag for mail2' })

    // M5 parallel case proposal (mail2 er nu koblet -> ny koersel foreslaar sag)
    const r3 = await runMailAgent(mail2, { dryRun: true })
    if (r3.data?.runId) runIds.add(r3.data.runId)
    const caseAct = (await actionsFor(mail2)).find((a) => a.capability === 'case.propose_from_email')
    if (caseAct) {
      await approve(caseAct.id)
      const st = await parallelExec(caseAct.id)
      const cases = Number((await c.sql(`SELECT count(*)::int n FROM service_cases WHERE source_email_id=${lit(mail2)}`))[0].n)
      out.push({ id: 'M5 parallel godkendt sagsforslag', ok: st.filter((s) => s === 'executed').length === 1 && cases === 1,
        note: `udfald=[${st.join(',')}] · sager=${cases}` })
    } else out.push({ id: 'M5 parallel godkendt sagsforslag', ok: false, note: 'intet sagsforslag for mail2' })

    // M6 genkoersel
    const before = (await actionsFor(mail2)).length
    const r4 = await runMailAgent(mail2, { dryRun: true })
    if (r4.data?.runId) runIds.add(r4.data.runId)
    const afterN = (await actionsFor(mail2)).length
    out.push({ id: 'M6 genkoersel giver ingen dubletter', ok: afterN === before && r4.data?.proposals === 0, note: `actions ${before} → ${afterN} · nye forslag=${r4.data?.proposals}` })

    // M7 haengende udfoerelse
    const draft2 = (await actionsFor(mail2)).find((a) => a.capability === 'mail.draft_reply')
    if (draft2) {
      await c.sql(`UPDATE agent_actions SET status='executing', executed_at=NULL WHERE id=${lit(draft2.id)}`)
      await new Promise((r) => setTimeout(r, 1500)) // updated_at saettes af trigger -> taerskel 0 min i testen
      const { collectPilotHealthSnapshot } = await import('../../src/lib/ops/pilot-health')
      const item = (await collectPilotHealthSnapshot(c.admin, { stuckMinutes: 0 })).sections.find((s) => s.key === 'agents')?.items.find((i) => i.label.startsWith('Hængende'))
      const ex = await executeAction(draft2.id)
      const still = (await c.sql(`SELECT status FROM agent_actions WHERE id=${lit(draft2.id)}`))[0].status
      out.push({ id: 'M7 haengende executing', ok: item?.level === 'red' && ex.data?.status === 'noop' && still === 'executing',
        note: `pilot-health=${item?.level} (${item?.detail.slice(0, 50)}) · executor=${ex.data?.status} · status forbliver ${still}` })
    }
  } finally {
    await c.sql(`UPDATE agent_configs SET enabled = false WHERE agent_type = 'mail'`)
    for (const r of (await c.sql(`SELECT DISTINCT run_id FROM agent_actions WHERE payload->>'email_id' IN ('${mail1}','${mail2}')`)) as Array<{ run_id: string }>) runIds.add(r.run_id)
    await c.sql(`DELETE FROM service_cases WHERE source_email_id IN (${lit(mail1)}, ${lit(mail2)})`)
    for (const r of runIds) await c.sql(`DELETE FROM audit_logs WHERE entity_type='agent_action' AND entity_id IN (SELECT id FROM agent_actions WHERE run_id=${lit(r)}); DELETE FROM agent_runs WHERE id=${lit(r)};`)
    for (const x of created) await c.admin.from(x.table).delete().eq('id', x.id)
  }
  return out
}

export function formatAgentActionsMatrix(c: MatrixCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'AGENT-ACTIONS (stale/idempotens/samtidighed):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(38)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} action-checks som forventet`].join('\n')
}
