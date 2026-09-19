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
import { scoreLinkConfidence, type CustomerCandidate } from '@/lib/agents/mail-confidence'

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

/** Find kunde-kandidater for en mail (email-exact = staerkt, navn = svagt). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findLinkCandidates(admin: any, mail: IncomingEmailLite): Promise<CustomerCandidate[]> {
  const byId = new Map<string, CustomerCandidate>()

  if (mail.sender_email) {
    const { data } = await admin
      .from('customers')
      .select('id, company_name, customer_number, email')
      .eq('email', mail.sender_email)
      .limit(5)
    for (const c of data ?? []) {
      byId.set(c.id, {
        id: c.id,
        company_name: c.company_name,
        customer_number: c.customer_number ?? null,
        email: c.email ?? null,
        signals: [{ kind: 'email', detail: mail.sender_email, strong: true }],
      })
    }
  }

  // Navne-match (svagt). Saniter for ilike-wildcards.
  const nameTerm = (mail.sender_name ?? '').replace(/[%_\\]/g, '').trim()
  if (nameTerm.length >= 3) {
    const { data } = await admin
      .from('customers')
      .select('id, company_name, customer_number, email')
      .ilike('company_name', `%${nameTerm}%`)
      .limit(5)
    for (const c of data ?? []) {
      const sig = { kind: 'name' as const, detail: nameTerm, strong: false }
      const existing = byId.get(c.id)
      if (existing) existing.signals.push(sig)
      else
        byId.set(c.id, {
          id: c.id,
          company_name: c.company_name,
          customer_number: c.customer_number ?? null,
          email: c.email ?? null,
          signals: [sig],
        })
    }
  }

  return [...byId.values()]
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

  // Foreslaaede actions (INGEN eksekvering her). Hver baerer confidence + rationale.
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
      payload: {
        email_id: mail.id,
        draft: buildReplyDraft(mail),
        confidence_level: 'low',
        confidence_score: 0.4,
        rationale: 'Generisk kvitteringssvar — tilpas og udfyld [BRUGER UDFYLDER] foer afsendelse',
      },
    },
  ]

  // Foreslå kunde-kobling hvis ikke koblet OG der findes kandidater.
  let topConfidence = 0.4
  if (!mail.customer_id) {
    const candidates = await findLinkCandidates(admin, mail)
    if (candidates.length > 0) {
      const conf = scoreLinkConfidence(candidates)
      topConfidence = Math.max(topConfidence, conf.score)
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
        payload: {
          email_id: mail.id,
          sender_email: mail.sender_email,
          candidates,
          confidence_level: conf.level,
          confidence_score: conf.score,
          rationale: conf.rationale,
          conflicts: conf.conflicts,
        },
      })
    }
  }

  // Opdater task.confidence (hoejeste review-relevante score).
  await admin.from('agent_tasks').update({ confidence: topConfidence }).eq('id', taskId)

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
