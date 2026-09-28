/**
 * UI-tilstande (P1 #8) — KUN staging + statisk.
 *
 *   U1  Stale beslutning: godkend/afvis paa et forslag der allerede er afgjort giver en forstaaelig fejl
 *       (ikke "Godkendt"), og et slettet forslag giver "findes ikke" (decision-guard.ts)
 *   U2  Udfoer paa et allerede afgjort forslag giver 'noop' + aarsag (UI viser info, ikke "Udfoert")
 *   U3  Statisk UI-guard-audit (G1–G4): alle menu-gatede sider har server-guard, ingen blindgyder, boundaries
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface UiCheck { id: string; ok: boolean; note: string }
type Sql = (sql: string) => Promise<any[]>
const lit = (v: string) => { if (!/^[0-9a-f-]{36}$/i.test(v)) throw new Error('ikke-uuid'); return `'${v}'` }

export async function runUiStates(c: { admin: SupabaseClient; sql: Sql; ownerUid: string }): Promise<UiCheck[]> {
  const out: UiCheck[] = []
  const { staleDecisionError } = await import('../../src/lib/agents/decision-guard')
  const { runOfferAgent } = await import('../../src/lib/agents/offer-proposal')
  const { executeAction } = await import('../../src/lib/agents/executor')
  const { runUiGuardAudit } = await import('../ui-guard-audit')

  const cs = (await c.sql(`SELECT s.id FROM service_cases s WHERE s.title LIKE '[HARNESS %' AND s.is_proposal = false
    AND s.status NOT IN ('closed','converted') AND s.customer_id IS NOT NULL AND s.source_offer_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM agent_actions a WHERE a.capability='offer.propose_draft_from_case' AND a.payload->>'case_id' = s.id::text)
    AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.source_case_id = s.id) ORDER BY s.id LIMIT 1`))[0]
  if (!cs) return [{ id: 'setup', ok: false, note: 'ingen egnet harness-sag' }]
  const r = await runOfferAgent(cs.id, { dryRun: true })
  const runId = r.data?.runId
  if (!runId) return [{ id: 'setup', ok: false, note: `intet forslag: ${r.data?.reason ?? r.error}` }]
  try {
    const actId = (await c.sql(`SELECT id FROM agent_actions WHERE run_id=${lit(runId)}`))[0].id as string
    const open = await staleDecisionError(c.admin, actId)
    const texts: Record<string, string | null> = {}
    // 'executed' kraever en gyldig approval (00163) — fixturen simulerer en reelt godkendt+udfoert action.
    await c.admin.from('agent_action_approvals').insert([{ action_id: actId, decision: 'approved', decided_by: c.ownerUid }])
    for (const st of ['rejected', 'executed', 'failed']) {
      await c.sql(`UPDATE agent_actions SET status='${st}', executed_at=${st === 'executed' ? 'now()' : 'NULL'} WHERE id=${lit(actId)}`)
      texts[st] = await staleDecisionError(c.admin, actId)
    }
    const missing = await staleDecisionError(c.admin, '00000000-0000-4000-8000-0000000000a1')
    out.push({ id: 'U1 stale godkend/afvis', ok: open === null && /afvist/.test(texts.rejected ?? '') && /udført/.test(texts.executed ?? '') && /fejlet/.test(texts.failed ?? '') && /findes ikke/.test(missing ?? ''),
      note: `aaben=${open === null ? 'tilladt' : 'BLOKERET'} · rejected="${texts.rejected}" · executed/failed/slettet afvist=${[texts.executed, texts.failed, missing].every(Boolean)}` })

    await c.sql(`UPDATE agent_actions SET status='rejected', executed_at=NULL WHERE id=${lit(actId)}`)
    const ex = await executeAction(actId)
    out.push({ id: 'U2 udfoer paa afgjort forslag', ok: ex.success && ex.data?.status === 'noop' && !!ex.data?.reason, note: `status=${ex.data?.status} · aarsag="${ex.data?.reason ?? ''}"` })
  } finally {
    await c.sql(`DELETE FROM audit_logs WHERE entity_type='agent_action' AND entity_id IN (SELECT id FROM agent_actions WHERE run_id=${lit(runId)}); DELETE FROM agent_runs WHERE id=${lit(runId)};`)
  }

  const audit = runUiGuardAudit()
  out.push({ id: 'U3 UI-guard-audit (G1–G4)', ok: audit.findings.length === 0, note: `${audit.checked} sider · fund=${audit.findings.length}${audit.findings.length ? ': ' + audit.findings.slice(0, 2).join(' | ') : ''}` })
  return out
}

export function formatUiStates(c: UiCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'UI-TILSTANDE:', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(34)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} UI-tilstands-checks som forventet`].join('\n')
}
