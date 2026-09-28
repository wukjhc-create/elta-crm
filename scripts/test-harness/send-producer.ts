/**
 * P2-rest B — send_reply-producer paa staging. SENDER ALDRIG:
 *   forudsaetning (ellers afbrydes FOER noget oprettes): Graph IKKE konfigureret i processen OG AGENT_LIVE_SEND_ENABLED off.
 *
 *   B1  skabelon-udkast (ikke reviewet)                 -> producer afviser
 *   B2  reviewet, udfoert udkast                         -> send-forslag (awaiting_approval, send_external, til afsender, "Re:")
 *   B3  forbered igen                                    -> afvist (ét aktivt forslag pr. mail)
 *   B4  godkendt + mail-agent enabled + live-send OFF   -> Executor afviser (ikke-terminalt), status forbliver approved
 *   B5  afvis forslaget -> forbered igen                -> nyt forslag tilladt (ny generation)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SendCheck { id: string; ok: boolean; note: string }
type Sql = (sql: string) => Promise<any[]>
const lit = (v: string) => { if (!/^[0-9a-f-]{36}$/i.test(v)) throw new Error('ikke-uuid'); return `'${v}'` }

export async function runSendProducer(c: { admin: SupabaseClient; sql: Sql; ownerUid: string }): Promise<SendCheck[]> {
  const { isGraphConfigured } = await import('../../src/lib/services/microsoft-graph')
  const { isLiveSendEnabled } = await import('../../src/lib/agents/live-gates')
  if (isGraphConfigured() || isLiveSendEnabled()) {
    return [{ id: 'sikkerhed', ok: false, note: `AFBRUDT: graph=${isGraphConfigured()} live=${isLiveSendEnabled()} — kører kun når afsendelse er umulig` }]
  }
  const { runMailAgent } = await import('../../src/lib/agents/mail-agent')
  const { executeAction } = await import('../../src/lib/agents/executor')
  const { produceSendReplyProposal } = await import('../../src/lib/agents/send-reply-producer')
  const out: SendCheck[] = []
  const stamp = Date.now()
  const created: Array<{ table: string; id: string }> = []
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.unshift({ table, id })
    return id
  }
  const sender = `send-${stamp}@harness.test`
  await ins('customers', { customer_number: `HARNESS-SP-${stamp}`, company_name: '[HARNESS] send-producer', contact_person: 'S', email: sender, created_by: c.ownerUid, custom_fields: { harness: 'send-producer' } })
  const mailId = await ins('incoming_emails', { sender_email: sender, sender_name: '', subject: 'Spørgsmål om tavle', body_text: 'Hej, kan I skifte vores eltavle?' })
  const sendActions = async () => (await c.sql(`SELECT id, status, side_effect_class, payload FROM agent_actions WHERE capability='mail.send_reply' AND payload->>'email_id'='${mailId}' ORDER BY created_at`)) as Array<{ id: string; status: string; side_effect_class: string; payload: Record<string, any> }>

  await c.sql(`UPDATE agent_configs SET enabled = true WHERE agent_type = 'mail'`)
  try {
    const r = await runMailAgent(mailId, { dryRun: true })
    const draft = (await c.sql(`SELECT id FROM agent_actions WHERE run_id=${lit(r.data!.runId)} AND capability='mail.draft_reply'`))[0]
    await executeAction(draft.id) // materialiserer skabelon-udkastet

    const b1 = await produceSendReplyProposal(c.admin, draft.id)
    out.push({ id: 'B1 skabelon-udkast afvises', ok: !b1.ok && /pladsholderen/.test(b1.ok ? '' : b1.error) && (await sendActions()).length === 0, note: b1.ok ? 'OPRETTET' : b1.error })

    // Fixture: reviewer har udfyldt udkastet (materialiseret resultat)
    await c.sql(`UPDATE agent_actions SET result = jsonb_set(result, '{draft}', to_jsonb('Hej,\n\nVi kan komme tirsdag og se på tavlen.\n\nMvh Elta'::text)) WHERE id=${lit(draft.id)}`)
    const b2 = await produceSendReplyProposal(c.admin, draft.id)
    const s2 = await sendActions()
    out.push({ id: 'B2 reviewet udkast -> forslag', ok: b2.ok && s2.length === 1 && s2[0].status === 'awaiting_approval' && s2[0].side_effect_class === 'send_external' && s2[0].payload.to === sender && s2[0].payload.subject === 'Re: Spørgsmål om tavle',
      note: b2.ok ? `${s2[0]?.status} · til afsender · "${s2[0]?.payload.subject}"` : b2.error })

    const b3 = await produceSendReplyProposal(c.admin, draft.id)
    out.push({ id: 'B3 kun ét aktivt forslag', ok: !b3.ok && (await sendActions()).length === 1, note: b3.ok ? 'DUBLET' : b3.error })

    const sendId = s2[0]?.id
    if (sendId) {
      await c.admin.from('agent_action_approvals').insert([{ action_id: sendId, decision: 'approved', decided_by: c.ownerUid }])
      await c.sql(`UPDATE agent_actions SET status='approved' WHERE id=${lit(sendId)}`)
      const ex = await executeAction(sendId)
      const st = (await c.sql(`SELECT status FROM agent_actions WHERE id=${lit(sendId)}`))[0].status
      out.push({ id: 'B4 live-send OFF blokerer', ok: ex.data?.status === 'refused' && /live afsendelse/.test(ex.data?.reason ?? '') && st === 'approved',
        note: `${ex.data?.status}: ${ex.data?.reason} · status=${st}` })

      await c.admin.from('agent_action_approvals').insert([{ action_id: sendId, decision: 'rejected', decided_by: c.ownerUid }])
      await c.sql(`UPDATE agent_actions SET status='rejected' WHERE id=${lit(sendId)}`)
      const b5 = await produceSendReplyProposal(c.admin, draft.id)
      out.push({ id: 'B5 efter afvisning: nyt forslag', ok: b5.ok && (await sendActions()).length === 2, note: b5.ok ? 'ny generation oprettet' : b5.error })
    }
  } finally {
    await c.sql(`UPDATE agent_configs SET enabled = false WHERE agent_type = 'mail'`)
    const runs = (await c.sql(`SELECT DISTINCT run_id FROM agent_actions WHERE payload->>'email_id'='${mailId}'`)) as Array<{ run_id: string }>
    for (const x of runs) await c.sql(`DELETE FROM audit_logs WHERE entity_type='agent_action' AND entity_id IN (SELECT id FROM agent_actions WHERE run_id=${lit(x.run_id)}); DELETE FROM agent_runs WHERE id=${lit(x.run_id)};`)
    for (const x of created) await c.admin.from(x.table).delete().eq('id', x.id)
  }
  return out
}

export function formatSendProducer(c: SendCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'SEND_REPLY-PRODUCER (ingen afsendelse):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(36)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} producer-checks som forventet`].join('\n')
}
