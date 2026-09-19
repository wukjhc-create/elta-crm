/**
 * Mailagent — orchestrator (Fase 3 MVP, suggest-mode).
 *
 * PROPOSE-fasen: laeser en indgaaende mail (READ) og opretter en agent_run
 * med foreslaaede tasks/actions. Udfoerer INGEN side effects — actions
 * oprettes som forslag ('planned'/'awaiting_approval') og eksekveres foerst
 * af Executor efter menneskelig godkendelse (for approval-kraevende).
 *
 * MVP-graenser (haardt):
 *  - Ingen mail sendes. draft_reply producerer kun et udkast (intern).
 *  - Ingen finance/delete/push_external/send_external.
 *  - Agenten aktiveres ikke automatisk; en run trigges eksplicit (manual).
 *  - Idempotent pr. mail via idempotency_key.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

export interface MailAgentRunResult {
  runId: string
  proposals: number
}

interface IncomingEmailLite {
  id: string
  subject: string
  sender_email: string
  sender_name: string | null
  body_text: string | null
  body_preview: string | null
  customer_id: string | null
}

/** Simpelt, deterministisk svar-udkast (ingen LLM). Markerer huller. */
function buildReplyDraft(email: IncomingEmailLite): string {
  const name = email.sender_name?.split(' ')[0] || 'der'
  return [
    `Hej ${name},`,
    '',
    'Tak for din henvendelse. Vi har modtaget din mail og vender tilbage hurtigst muligt.',
    '',
    '[BRUGER UDFYLDER: konkret svar]',
    '',
    'Med venlig hilsen,',
    'Elta Solar',
  ].join('\n')
}

/**
 * Kør Mailagenten mod én indgaaende mail. Opretter forslag; eksekverer intet.
 */
export async function runMailAgent(
  emailId: string,
  opts: { triggeredBy?: string | null; dryRun?: boolean } = {},
): Promise<ActionResult<MailAgentRunResult>> {
  const admin = createAdminClient()

  // Config (safety_mode). Agenten behoever ikke vaere enabled for at FORESLAA;
  // Executor haandhaever enabled ved faktisk udfoerelse.
  const { data: cfg } = await admin
    .from('agent_configs')
    .select('safety_mode')
    .eq('agent_type', 'mail')
    .maybeSingle()
  const safetyMode = (cfg?.safety_mode as string) ?? 'suggest'

  // Read email (READ-only)
  const { data: email, error: eErr } = await admin
    .from('incoming_emails')
    .select('id, subject, sender_email, sender_name, body_text, body_preview, customer_id')
    .eq('id', emailId)
    .maybeSingle()
  if (eErr || !email) {
    return { success: false, error: 'Mail ikke fundet' }
  }
  const mail = email as IncomingEmailLite

  // Create run
  const { data: run, error: rErr } = await admin
    .from('agent_runs')
    .insert({
      agent_type: 'mail',
      trigger: 'manual',
      triggered_by: opts.triggeredBy ?? null,
      status: 'running',
      safety_mode: safetyMode,
      dry_run: opts.dryRun ?? false,
      input_context: { email_id: mail.id, subject: mail.subject },
      summary: `Mailagent-forslag for "${mail.subject}"`,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (rErr || !run) {
    logger.error('runMailAgent: kunne ikke oprette run', { error: rErr })
    return { success: false, error: 'Kunne ikke oprette agent-run' }
  }
  const runId = run.id as string

  // Task
  const { data: task, error: tErr } = await admin
    .from('agent_tasks')
    .insert({
      run_id: runId,
      seq: 0,
      kind: 'triage_email',
      title: `Triage af mail: ${mail.subject}`,
      rationale: 'Indgaaende mail kraever svar/opfoelgning.',
      target_entity_type: 'incoming_email',
      target_entity_id: mail.id,
      status: 'proposed',
    })
    .select('id')
    .single()
  if (tErr || !task) {
    await admin.from('agent_runs').update({ status: 'failed', error: 'task-oprettelse fejlede', finished_at: new Date().toISOString() }).eq('id', runId)
    return { success: false, error: 'Kunne ikke oprette task' }
  }
  const taskId = task.id as string

  // Foreslaaede actions (INGEN eksekvering her).
  const actions: Array<Record<string, unknown>> = [
    {
      task_id: taskId,
      run_id: runId,
      action_type: 'draft_reply',
      capability: 'mail.draft_reply',
      side_effect_class: 'read',
      requires_approval: false,
      min_approvals: 1,
      idempotency_key: `mail-reply:${mail.id}`,
      status: 'planned', // read/no-approval -> Executor maa materialisere udkastet
      payload: { email_id: mail.id, draft: buildReplyDraft(mail) },
    },
  ]

  // Foreslå kunde-kobling hvis ikke koblet (kraever approval; 'update').
  if (!mail.customer_id) {
    actions.push({
      task_id: taskId,
      run_id: runId,
      action_type: 'link_customer',
      capability: 'mail.link_customer',
      side_effect_class: 'update',
      requires_approval: true,
      min_approvals: 1,
      idempotency_key: `mail-link:${mail.id}`,
      status: 'awaiting_approval',
      payload: { email_id: mail.id, sender_email: mail.sender_email },
    })
  }

  // Insert actions idempotent (unik idempotency_key). Dublet-mail -> ignoreres.
  let proposals = 0
  for (const a of actions) {
    const { error: aErr } = await admin.from('agent_actions').insert(a)
    if (aErr) {
      // 23505 = unique violation (forslag findes allerede for denne mail)
      if ((aErr as { code?: string }).code === '23505') continue
      logger.error('runMailAgent: action-insert fejlede', { error: aErr })
      continue
    }
    proposals++
  }

  // Suggest-mode: run afventer menneskelig gennemgang.
  await admin
    .from('agent_runs')
    .update({ status: 'awaiting_approval', finished_at: new Date().toISOString() })
    .eq('id', runId)

  return { success: true, data: { runId, proposals } }
}
