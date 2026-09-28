/**
 * P2 #13 — Planlaegningsagent E2E paa staging (Fase 6-forberedelse). Agenten 'planning' er KUN enabled inden for
 * trin P3–P5 og deaktiveres i finally. Probe-montoer og alle oprettede arbejdsordrer/runs slettes igen.
 *
 *   P1  3x parallel runPlanningAgent paa samme sag   -> præcis 1 aktivt forslag
 *   P2  Executor med agent disabled                  -> afvist, 0 arbejdsordrer
 *   P3  godkendt + 3x parallel udfoerelse            -> 1 executed; 1 arbejdsordre med forslagets dato/montoer
 *   P4  gentagelse (Executor + handler direkte)      -> noop / created=false (ingen dublet)
 *   P5  stale: menneske planlaegger sagen imens      -> failed, kun menneskets arbejdsordre findes
 *   P6  stale: montoer inaktiv / dato passeret       -> afvist af handleren
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PlanCheck { id: string; ok: boolean; note: string }
type Sql = (sql: string) => Promise<any[]>
const lit = (v: string) => { if (!/^[0-9a-f-]{36}$/i.test(v)) throw new Error('ikke-uuid'); return `'${v}'` }

export async function runPlanningFlow(c: { admin: SupabaseClient; sql: Sql; ownerUid: string }): Promise<PlanCheck[]> {
  const out: PlanCheck[] = []
  const { runPlanningAgent, copenhagenToday, PLANNING_CAPABILITY } = await import('../../src/lib/agents/planning-agent')
  const { executeAction } = await import('../../src/lib/agents/executor')
  const { getCapability } = await import('../../src/lib/agents/capability-registry')
  const cases = (await c.sql(`SELECT s.id, s.customer_id FROM service_cases s WHERE s.title LIKE '[HARNESS %' AND s.is_proposal = false
    AND s.status NOT IN ('closed','converted') AND s.customer_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.case_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM agent_actions a WHERE a.capability='${PLANNING_CAPABILITY}' AND a.payload->>'case_id' = s.id::text)
    ORDER BY s.id LIMIT 3`)) as Array<{ id: string; customer_id: string }>
  if (cases.length < 3) return [{ id: 'setup', ok: false, note: 'mangler 3 uplanlagte harness-sager' }]
  const [A, B, D] = cases
  const runIds = new Set<string>()
  const { data: emp } = await c.admin.from('employees').insert([{ name: '[HARNESS] Planlægningsmontør', email: `plan-${Date.now()}@harness.test`, role: 'montør', active: true }]).select('id').single()
  const empId = (emp as { id: string } | null)?.id
  if (!empId) return [{ id: 'setup', ok: false, note: 'probe-montør kunne ikke oprettes' }]
  const woFor = async (caseId: string) => (await c.sql(`SELECT id, scheduled_date::text d, assigned_employee_id e, description FROM work_orders WHERE case_id=${lit(caseId)}`)) as Array<{ id: string; d: string; e: string; description: string | null }>
  const actionFor = async (caseId: string) => (await c.sql(`SELECT id, status, payload FROM agent_actions WHERE capability='${PLANNING_CAPABILITY}' AND payload->>'case_id'='${caseId}'`)) as Array<{ id: string; status: string; payload: Record<string, any> }>
  const approve = (id: string) => c.admin.from('agent_action_approvals').insert([{ action_id: id, decision: 'approved', decided_by: c.ownerUid }])
  const setEnabled = (on: boolean) => c.sql(`UPDATE agent_configs SET enabled = ${on} WHERE agent_type = 'planning'`)

  try {
    // P1
    const r1 = await Promise.all(Array.from({ length: 3 }, () => runPlanningAgent({ caseIds: [A.id], dryRun: true })))
    for (const r of r1) if (r.data?.runId) runIds.add(r.data.runId)
    const acts = await actionFor(A.id)
    out.push({ id: 'P1 3x parallel forslag', ok: acts.length === 1 && acts[0].status === 'awaiting_approval',
      note: `aktive forslag=${acts.length} · pr. kald=[${r1.map((r) => r.data?.proposals ?? `fejl:${r.error}`).join(',')}]${r1[0].data?.skipped?.length ? ` · sprunget over: ${r1.map((r) => r.data?.skipped?.[0]?.reason).filter(Boolean)[0]}` : ''}` })
    const act = acts[0]
    if (!act) return out

    // P2
    const ex0 = await executeAction(act.id)
    out.push({ id: 'P2 disabled agent', ok: ex0.data?.status === 'refused' && (await woFor(A.id)).length === 0, note: `${ex0.data?.status}: ${ex0.data?.reason ?? ex0.error}` })

    await setEnabled(true)
    // P3
    await approve(act.id)
    const st = (await Promise.all(Array.from({ length: 3 }, () => executeAction(act.id)))).map((r) => r.data?.status ?? `fejl:${r.error}`)
    const wos = await woFor(A.id)
    const p = act.payload
    out.push({ id: 'P3 godkendt + parallel udfoerelse', ok: st.filter((s) => s === 'executed').length === 1 && wos.length === 1 && wos[0].d === p.scheduled_date && wos[0].e === p.assigned_employee_id,
      note: `udfald=[${st.join(',')}] · arbejdsordrer=${wos.length} (${wos[0]?.d} / ${p.employee_name})` })

    // P4
    const again = (await executeAction(act.id)).data?.status
    const direct = await getCapability(PLANNING_CAPABILITY)!.handler!({ run: {} as never, admin: c.admin, action: { id: act.id, payload: p } } as never)
    out.push({ id: 'P4 gentagelse', ok: again === 'noop' && direct.ok && direct.data?.created === false && (await woFor(A.id)).length === 1,
      note: `executor=${again} · handler direkte created=${direct.data?.created} · arbejdsordrer=${(await woFor(A.id)).length}` })

    // P5 stale: menneske planlaegger B imens
    const r5 = await runPlanningAgent({ caseIds: [B.id], dryRun: true })
    if (r5.data?.runId) runIds.add(r5.data.runId)
    const actB = (await actionFor(B.id))[0]
    if (actB) {
      await c.admin.from('work_orders').insert([{ case_id: B.id, customer_id: B.customer_id, title: '[HARNESS] manuelt planlagt', status: 'planned' }])
      await approve(actB.id)
      const exB = await executeAction(actB.id)
      const wB = await woFor(B.id)
      out.push({ id: 'P5 stale: planlagt manuelt imens', ok: exB.data?.status === 'failed' && wB.length === 1 && wB[0].description === null,
        note: `${exB.data?.status}: ${(exB.error ?? '').slice(0, 70)} · arbejdsordrer=${wB.length}` })
    } else out.push({ id: 'P5 stale: planlagt manuelt imens', ok: false, note: 'intet forslag for sag B' })
  } finally {
    await setEnabled(false)
  }

  // P6 stale via handler (ingen aktivering noedvendig): inaktiv montoer + passeret dato
  const handler = getCapability(PLANNING_CAPABILITY)!.handler!
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
  const base = { case_id: D.id, customer_id: D.customer_id, title: '[HARNESS] plan', assigned_employee_id: empId, employee_name: 'probe' }
  const past = await handler({ run: {} as never, admin: c.admin, action: { id: '00000000-0000-4000-8000-0000000000p6'.replace('p6', 'b6'), payload: { ...base, scheduled_date: copenhagenToday() } } } as never)
  await c.admin.from('employees').update({ active: false }).eq('id', empId)
  const inactive = await handler({ run: {} as never, admin: c.admin, action: { id: '00000000-0000-4000-8000-0000000000b7', payload: { ...base, scheduled_date: future } } } as never)
  out.push({ id: 'P6 stale: dato passeret / montør inaktiv', ok: !past.ok && /passeret/.test(past.error ?? '') && !inactive.ok && /ikke længere aktiv/.test(inactive.error ?? '') && (await woFor(D.id)).length === 0,
    note: `dato i dag → ${past.ok ? 'OPRETTET' : 'afvist'} · inaktiv montør → ${inactive.ok ? 'OPRETTET' : 'afvist'}` })

  // oprydning
  for (const x of [A, B, D]) await c.sql(`DELETE FROM work_orders WHERE case_id=${lit(x.id)}`)
  for (const r of (await c.sql(`SELECT DISTINCT run_id FROM agent_actions WHERE capability='${PLANNING_CAPABILITY}' AND payload->>'case_id' IN ('${A.id}','${B.id}','${D.id}')`)) as Array<{ run_id: string }>) runIds.add(r.run_id)
  for (const r of runIds) await c.sql(`DELETE FROM audit_logs WHERE entity_type='agent_action' AND entity_id IN (SELECT id FROM agent_actions WHERE run_id=${lit(r)}); DELETE FROM agent_runs WHERE id=${lit(r)};`)
  await c.admin.from('employees').delete().eq('id', empId)
  return out
}

export function formatPlanningFlow(c: PlanCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'PLANLAEGNINGSAGENT (Fase 6-forberedelse):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(40)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} planlaegnings-checks som forventet`].join('\n')
}
