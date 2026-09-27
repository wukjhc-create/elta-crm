/**
 * Agent Core — Opfølgningsagent (Fase 5, intern del).
 *
 * Finder sendte/sete tilbud uden svar (ældre end N dage, stadig gyldige, ingen åben opfølgningsopgave) og FORESLÅR
 * pr. tilbud:
 *   - followup.draft_offer_reminder (read)  : et påmindelses-udkast, der kan redigeres i Agent Inbox. Sendes ALDRIG.
 *   - followup.create_task          (create): en intern opgave til sælgeren - kun efter approval.
 * Ingen mail, ingen SMS, ingen cron: agenten køres manuelt af en admin.
 *
 * Idempotens: nøgler pr. (tilbud, afsendelses-cyklus = sent_at) er UNIQUE i agent_actions, så en gentaget kørsel
 * ikke laver dubletter; et gensendt tilbud er en ny cyklus. Handleren genkontrollerer tilbudsstatus, kunde og åben
 * opgave (stale/dublet) før oprettelse.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import type { CapabilityContext, CapabilityResult } from '@/types/agent-core.types'

export const FOLLOWUP_AUTO_RULE = 'agent_followup_offer'
const OPEN_OFFER_STATUSES = ['sent', 'viewed']
const DAY_MS = 86_400_000

export interface FollowupOffer {
  id: string
  offer_number: string
  title: string
  status: string
  customer_id: string | null
  created_by: string | null
  sent_at: string | null
  valid_until: string | null
  customer_name: string | null
  contact_person: string | null
}

export interface FollowupPayload {
  offer_id: string
  offer_number: string
  offer_title: string
  customer_id: string
  customer_name: string | null
  sent_at: string
  days_since_sent: number
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Hvorfor tilbuddet ikke skal følges op - eller null. Ren funktion. */
export function followupBlocker(o: FollowupOffer, now: Date, minAgeDays: number): string | null {
  if (!o.customer_id) return 'tilbuddet har ingen kunde'
  if (!OPEN_OFFER_STATUSES.includes(o.status)) return `tilbuddet er ${o.status}`
  if (!o.sent_at) return 'tilbuddet er ikke sendt'
  if (now.getTime() - new Date(o.sent_at).getTime() < minAgeDays * DAY_MS) return `sendt for under ${minAgeDays} dage siden`
  if (o.valid_until && new Date(`${o.valid_until}T23:59:59`) < now) return 'tilbuddet er udloebet'
  return null
}

export function buildFollowupPayload(o: FollowupOffer, now: Date): FollowupPayload {
  return {
    offer_id: o.id,
    offer_number: o.offer_number,
    offer_title: o.title,
    customer_id: o.customer_id!,
    customer_name: o.customer_name,
    sent_at: o.sent_at!,
    days_since_sent: Math.floor((now.getTime() - new Date(o.sent_at!).getTime()) / DAY_MS),
  }
}

/** Deterministisk påmindelses-udkast (ingen LLM). Markerer hvor sælgeren skal tilpasse. */
export function buildReminderDraft(o: FollowupOffer): string {
  const first = o.contact_person?.trim().split(/\s+/)[0] || 'der'
  return [
    `Hej ${first},`,
    '',
    `Vi sendte dig tilbud ${o.offer_number} (${o.title}) den ${fmtDate(o.sent_at!)}. Har du haft mulighed for at kigge paa det?`,
    ...(o.valid_until ? [`Tilbuddet er gaeldende til og med ${fmtDate(`${o.valid_until}T12:00:00`)}.`] : []),
    'Du er meget velkommen til at kontakte os, hvis du har spoergsmaal eller oensker justeringer.',
    '',
    '[BRUGER UDFYLDER: evt. personlig tilfoejelse]',
    '',
    'Med venlig hilsen,',
    'Elta Solar',
  ].join('\n')
}

// offers har fire FK'er til customers (kunde/bestiller/slutkunde/betaler) -> embed skal navngive FK'en.
const OFFER_COLUMNS =
  'id, offer_number, title, status, customer_id, created_by, sent_at, valid_until, is_proposal, customers:customers!offers_customer_id_fkey ( company_name, contact_person )'

function toFollowupOffer(r: Record<string, unknown>): FollowupOffer {
  const raw = r.customers as unknown
  const cust = (Array.isArray(raw) ? raw[0] : raw) as { company_name?: string; contact_person?: string } | null
  return {
    id: r.id as string, offer_number: r.offer_number as string, title: r.title as string, status: r.status as string,
    customer_id: (r.customer_id as string | null) ?? null, created_by: (r.created_by as string | null) ?? null,
    sent_at: (r.sent_at as string | null) ?? null, valid_until: (r.valid_until as string | null) ?? null,
    customer_name: cust?.company_name ?? null, contact_person: cust?.contact_person ?? null,
  }
}

async function openFollowupTaskId(admin: any, offerId: string): Promise<string | null> {
  const { data } = await admin
    .from('customer_tasks')
    .select('id')
    .eq('offer_id', offerId)
    .eq('auto_rule', FOLLOWUP_AUTO_RULE)
    .neq('status', 'done')
    .limit(1)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

// ---------------------------------------------------------------- handlers (kaldes KUN af Executor)

export async function materializeFollowupDraft(ctx: CapabilityContext): Promise<CapabilityResult> {
  const draft = (ctx.action.payload?.draft as string | undefined) ?? ''
  if (!draft) return { ok: false, error: 'intet udkast i payload' }
  return { ok: true, data: { draft, materialized_at: new Date().toISOString(), sent: false } }
}

export async function executeFollowupTask(ctx: CapabilityContext): Promise<CapabilityResult> {
  const p = (ctx.action.payload ?? {}) as Partial<FollowupPayload>
  if (!p.offer_id || !p.customer_id) return { ok: false, error: 'mangler offer_id/customer_id i payload' }

  const { data: row, error } = await ctx.admin.from('offers').select(OFFER_COLUMNS).eq('id', p.offer_id).maybeSingle()
  if (error || !row) return { ok: false, error: 'tilbuddet findes ikke' }
  const o = toFollowupOffer(row as Record<string, unknown>)
  if (o.customer_id !== p.customer_id) return { ok: false, error: 'tilbuddets kunde er aendret siden forslaget' }
  if (!OPEN_OFFER_STATUSES.includes(o.status)) return { ok: false, error: `tilbuddet er ${o.status} - opfoelgning ikke laengere relevant` }
  if (o.valid_until && new Date(`${o.valid_until}T23:59:59`) < new Date()) return { ok: false, error: 'tilbuddet er udloebet' }

  const existing = await openFollowupTaskId(ctx.admin, o.id)
  if (existing) return { ok: true, data: { task_id: existing, created: false, already_existed: true, offer_id: o.id } }

  const { data: appr } = await ctx.admin
    .from('agent_action_approvals')
    .select('decided_by')
    .eq('action_id', ctx.action.id)
    .eq('decision', 'approved')
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: task, error: tErr } = await ctx.admin
    .from('customer_tasks')
    .insert({
      customer_id: o.customer_id,
      offer_id: o.id,
      title: `Opfoelgning: tilbud ${o.offer_number}`,
      description: `Tilbud ${o.offer_number} (${o.title}) blev sendt ${fmtDate(o.sent_at!)} uden svar. Foreslaaet af Opfoelgningsagenten; et paamindelses-udkast ligger i Agent Inbox (sendes ikke automatisk).`,
      status: 'pending',
      priority: 'normal',
      assigned_to: o.created_by,
      due_date: new Date(Date.now() + DAY_MS).toISOString(),
      created_by: (appr?.decided_by as string | undefined) ?? null,
      auto_generated: true,
      auto_rule: FOLLOWUP_AUTO_RULE,
    })
    .select('id')
    .single()
  if (tErr || !task) {
    logger.error('executeFollowupTask: insert fejlede', { error: tErr, metadata: { offerId: o.id } })
    return { ok: false, error: 'opgaven kunne ikke oprettes' }
  }
  return { ok: true, data: { task_id: task.id, created: true, offer_id: o.id, customer_id: o.customer_id } }
}

// ---------------------------------------------------------------- runner (manuel; ingen cron)

export interface FollowupRunOptions {
  minAgeDays?: number
  limit?: number
  offerIds?: string[]
  triggeredBy?: string | null
  dryRun?: boolean
  now?: Date
}

export async function runFollowupAgent(opts: FollowupRunOptions = {}): Promise<ActionResult<{ runId: string | null; offers: number; proposals: number }>> {
  const admin = createAdminClient()
  const now = opts.now ?? new Date()
  const minAgeDays = opts.minAgeDays ?? 7
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100)

  let q = admin
    .from('offers')
    .select(OFFER_COLUMNS)
    .in('status', OPEN_OFFER_STATUSES)
    .eq('is_proposal', false)
    .not('sent_at', 'is', null)
    .lte('sent_at', new Date(now.getTime() - minAgeDays * DAY_MS).toISOString())
    .order('sent_at', { ascending: true })
    .limit(limit * 3)
  if (opts.offerIds?.length) q = q.in('id', opts.offerIds)
  const { data: rows, error } = await q
  if (error) return { success: false, error: 'Kunne ikke hente tilbud' }

  const candidates: FollowupOffer[] = []
  for (const r of (rows ?? []) as Record<string, unknown>[]) {
    const o = toFollowupOffer(r)
    if (followupBlocker(o, now, minAgeDays)) continue
    if (await openFollowupTaskId(admin, o.id)) continue
    // Allerede foreslaaet i denne afsendelses-cyklus (uanset udfald) -> ingen ny run.
    const { count } = await admin
      .from('agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('idempotency_key', `followup-task:${o.id}:${o.sent_at}`)
    if (count) continue
    candidates.push(o)
    if (candidates.length >= limit) break
  }
  if (!candidates.length) return { success: true, data: { runId: null, offers: 0, proposals: 0 } }

  const { data: cfg } = await admin.from('agent_configs').select('safety_mode').eq('agent_type', 'followup').maybeSingle()
  const { data: run, error: rErr } = await admin
    .from('agent_runs')
    .insert({
      agent_type: 'followup',
      trigger: 'manual',
      triggered_by: opts.triggeredBy ?? null,
      status: 'running',
      safety_mode: (cfg?.safety_mode as string) ?? 'suggest',
      dry_run: opts.dryRun ?? false,
      input_context: { min_age_days: minAgeDays, offer_ids: candidates.map((o) => o.id) },
      summary: `Opfoelgning paa ${candidates.length} tilbud uden svar`,
      started_at: now.toISOString(),
    })
    .select('id')
    .single()
  if (rErr || !run) return { success: false, error: 'Kunne ikke oprette agent-run' }
  const runId = run.id as string

  let proposals = 0
  for (const [seq, o] of candidates.entries()) {
    const { data: task } = await admin
      .from('agent_tasks')
      .insert({
        run_id: runId, seq, kind: 'followup_offer', title: `Opfoelgning paa tilbud ${o.offer_number}`,
        rationale: `Sendt ${fmtDate(o.sent_at!)} uden svar.`, target_entity_type: 'offer', target_entity_id: o.id, status: 'proposed',
      })
      .select('id')
      .single()
    if (!task) continue
    const base = buildFollowupPayload(o, now)
    const cycle = `${o.id}:${o.sent_at}`
    const actions = [
      {
        task_id: task.id, run_id: runId, action_type: 'draft_reminder', capability: 'followup.draft_offer_reminder', side_effect_class: 'read',
        requires_approval: false, min_approvals: 1, idempotency_key: `followup-draft:${cycle}`, status: 'planned',
        payload: { ...base, draft: buildReminderDraft(o), confidence_level: 'low', confidence_score: 0.4,
          rationale: 'Skabelon-udkast - tilpas foer brug. Sendes aldrig automatisk.' },
      },
      {
        task_id: task.id, run_id: runId, action_type: 'create_task', capability: 'followup.create_task', side_effect_class: 'create',
        requires_approval: true, min_approvals: 1, idempotency_key: `followup-task:${cycle}`, status: 'awaiting_approval',
        payload: { ...base, confidence_level: 'medium', confidence_score: 0.6,
          rationale: `Tilbuddet har ventet ${base.days_since_sent} dage uden svar. Opretter en intern opgave til saelgeren efter godkendelse.` },
      },
    ]
    for (const a of actions) {
      const { error: aErr } = await admin.from('agent_actions').insert(a)
      if (!aErr) proposals++
      else if ((aErr as { code?: string }).code !== '23505') logger.error('runFollowupAgent: action-insert fejlede', { error: aErr })
    }
  }
  await admin.from('agent_runs').update({ status: proposals ? 'awaiting_approval' : 'completed', finished_at: new Date().toISOString() }).eq('id', runId)
  return { success: true, data: { runId, offers: candidates.length, proposals } }
}
