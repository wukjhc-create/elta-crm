/**
 * Agent Core — offer.propose_draft_from_case (Fase 5, intern del).
 *
 * Tilbudsagenten FORESLÅR et tomt, internt tilbudsudkast ud fra en eksisterende sag. Først efter menneskelig
 * approval (og kun med enabled agent) kalder Executor handleren, som opretter udkastet som FORSLAG:
 * status 'draft', is_proposal=true, beløb 0. Intet sendes, intet posteres, ingen linjer/priser beregnes.
 *
 * Idempotens:
 *   - højst ét aktivt (ikke-afvist) forslag pr. sag; idempotency_key `case-offer:<case>:<n>` (UNIQUE i DB)
 *   - handleren skriver en markør `[agent-action:<id>]` i tilbuddets interne notes og genbruger et tilbud med
 *     samme markør (gentaget kald) eller et tilbud fra et tidligere udført forslag for samme sag.
 * Tamper/stale: sagen skal findes, være bekræftet (ikke et sagsforslag), ikke lukket/konverteret, ikke selv
 * stamme fra et tilbud, og have samme kunde som da forslaget blev lavet.
 *
 * offers.converted_case_id bruges bevidst IKKE: den betyder "tilbuddet blev konverteret til sag".
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { insertOfferWithNumber } from '@/lib/services/offer-number'
import type { ActionResult } from '@/types/common.types'
import type { CapabilityContext, CapabilityResult } from '@/types/agent-core.types'

export const OFFER_CAPABILITY = 'offer.propose_draft_from_case'
const CLOSED_CASE_STATUSES = ['closed', 'converted']
const INACTIVE_ACTION_STATUSES = ['rejected', 'failed', 'rolled_back']

export interface OfferProposalCase {
  id: string
  case_number: string | null
  title: string
  description: string | null
  status: string
  customer_id: string | null
  source_offer_id: string | null
  is_proposal: boolean
  orderer_customer_id: string | null
  end_customer_id: string | null
  payer_customer_id: string | null
}

export interface OfferProposalPayload {
  case_id: string
  case_number: string | null
  customer_id: string
  proposed_title: string
}

const CASE_COLUMNS =
  'id, case_number, title, description, status, customer_id, source_offer_id, is_proposal, orderer_customer_id, end_customer_id, payer_customer_id'

/** Hvorfor sagen ikke må få et tilbudsforslag - eller null når den må. Ren funktion. */
export function offerProposalBlocker(c: OfferProposalCase): string | null {
  if (!c.customer_id) return 'sagen har ingen kunde'
  if (c.is_proposal) return 'sagen er stadig et sagsforslag - bekraeft den foerst'
  if (CLOSED_CASE_STATUSES.includes(c.status)) return `sagen er ${c.status}`
  if (c.source_offer_id) return 'sagen stammer fra et tilbud'
  return null
}

export function buildOfferProposal(c: OfferProposalCase): OfferProposalPayload | null {
  if (offerProposalBlocker(c)) return null
  return { case_id: c.id, case_number: c.case_number, customer_id: c.customer_id!, proposed_title: `Tilbud - ${c.title}` }
}

const marker = (actionId: string) => `[agent-action:${actionId}]`

/** Tilbudsforslag for sagen der stadig er aktive eller udførte (ikke afviste/fejlede). */
async function activeProposalsForCase(admin: any, caseId: string): Promise<Array<{ id: string; status: string; result: Record<string, unknown> | null }>> {
  const { data } = await admin
    .from('agent_actions')
    .select('id, status, result')
    .eq('capability', OFFER_CAPABILITY)
    .eq('payload->>case_id', caseId)
  return ((data ?? []) as Array<{ id: string; status: string; result: Record<string, unknown> | null }>)
    .filter((a) => !INACTIVE_ACTION_STATUSES.includes(a.status))
}

/** Handler (kaldes KUN af Executor efter approval-gating). */
export async function executeOfferProposal(ctx: CapabilityContext): Promise<CapabilityResult> {
  const p = (ctx.action.payload ?? {}) as Partial<OfferProposalPayload>
  if (!p.case_id || !p.customer_id) return { ok: false, error: 'mangler case_id/customer_id i payload' }

  const { data: row, error } = await ctx.admin.from('service_cases').select(CASE_COLUMNS).eq('id', p.case_id).maybeSingle()
  if (error || !row) return { ok: false, error: 'sagen findes ikke' }
  const c = row as OfferProposalCase
  if (c.customer_id !== p.customer_id) return { ok: false, error: 'sagens kunde er aendret siden forslaget - koer tilbudsagenten igen' }
  const blocker = offerProposalBlocker(c)
  if (blocker) return { ok: false, error: `${blocker} - intet tilbud oprettet` }

  // Idempotens 1: denne action har allerede oprettet tilbuddet (gentaget kald).
  const { data: mine } = await ctx.admin.from('offers').select('id, offer_number').ilike('notes', `%${marker(ctx.action.id)}%`).limit(1).maybeSingle()
  if (mine?.id) return { ok: true, data: { offer_id: mine.id, offer_number: mine.offer_number, created: false, already_existed: true, case_id: c.id } }

  // Idempotens 2: et andet forslag for samme sag er allerede udført, og dets tilbud findes stadig.
  for (const a of await activeProposalsForCase(ctx.admin, c.id)) {
    const offerId = a.id !== ctx.action.id && a.status === 'executed' ? (a.result?.offer_id as string | undefined) : undefined
    if (!offerId) continue
    const { data: prior } = await ctx.admin.from('offers').select('id, offer_number').eq('id', offerId).maybeSingle()
    if (prior?.id) return { ok: true, data: { offer_id: prior.id, offer_number: prior.offer_number, created: false, already_existed: true, case_id: c.id } }
  }

  // created_by: den der godkendte forslaget (fallback: første admin).
  const { data: appr } = await ctx.admin
    .from('agent_action_approvals')
    .select('decided_by')
    .eq('action_id', ctx.action.id)
    .eq('decision', 'approved')
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  let createdBy = (appr?.decided_by as string | undefined) ?? null
  if (!createdBy) {
    const { data: admin } = await ctx.admin.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
    createdBy = (admin?.id as string | undefined) ?? null
  }
  if (!createdBy) return { ok: false, error: 'ingen bruger at registrere som opretter' }

  const res = await insertOfferWithNumber(ctx.admin, {
    title: p.proposed_title || `Tilbud - ${c.title}`,
    description: c.description ? c.description.substring(0, 500) : null,
    status: 'draft',
    customer_id: c.customer_id,
    orderer_customer_id: c.orderer_customer_id,
    end_customer_id: c.end_customer_id,
    payer_customer_id: c.payer_customer_id,
    total_amount: 0,
    final_amount: 0,
    tax_percentage: 25,
    currency: 'DKK',
    notes: `Tilbudsudkast foreslaaet af Agent Core ud fra sag ${c.case_number ?? c.id}. Tomt udkast - linjer og priser tilfoejes manuelt. ${marker(ctx.action.id)}`,
    created_by: createdBy,
    is_proposal: true,
  })
  if (res.error || !res.data) {
    logger.error('executeOfferProposal: insert fejlede', { error: res.error, metadata: { caseId: c.id, actionId: ctx.action.id } })
    return { ok: false, error: 'tilbudsudkastet kunne ikke oprettes' }
  }
  return {
    ok: true,
    data: { offer_id: res.data.id, offer_number: res.data.offer_number, created: true, is_proposal: true, case_id: c.id, customer_id: c.customer_id },
  }
}

/** Kør tilbudsagenten mod én sag. Opretter et forslag; eksekverer intet. */
export async function runOfferAgent(
  caseId: string,
  opts: { triggeredBy?: string | null; dryRun?: boolean } = {},
): Promise<ActionResult<{ runId: string | null; proposals: number; reason?: string }>> {
  const admin = createAdminClient()
  const { data: row } = await admin.from('service_cases').select(CASE_COLUMNS).eq('id', caseId).maybeSingle()
  if (!row) return { success: false, error: 'Sag ikke fundet' }
  const c = row as OfferProposalCase
  const proposal = buildOfferProposal(c)
  if (!proposal) return { success: true, data: { runId: null, proposals: 0, reason: offerProposalBlocker(c) ?? undefined } }
  const existing = await activeProposalsForCase(admin, c.id)
  if (existing.length > 0) return { success: true, data: { runId: null, proposals: 0, reason: 'der findes allerede et tilbudsforslag for sagen' } }

  const { data: cfg } = await admin.from('agent_configs').select('safety_mode').eq('agent_type', 'offer').maybeSingle()
  const { data: run, error: rErr } = await admin
    .from('agent_runs')
    .insert({
      agent_type: 'offer',
      trigger: 'manual',
      triggered_by: opts.triggeredBy ?? null,
      status: 'running',
      safety_mode: (cfg?.safety_mode as string) ?? 'suggest',
      dry_run: opts.dryRun ?? false,
      input_context: { case_id: c.id, case_number: c.case_number },
      summary: `Tilbudsforslag for sag ${c.case_number ?? ''} "${c.title}"`,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (rErr || !run) return { success: false, error: 'Kunne ikke oprette agent-run' }
  const runId = run.id as string

  const { data: task } = await admin
    .from('agent_tasks')
    .insert({
      run_id: runId, seq: 0, kind: 'propose_offer', title: `Tilbudsudkast for sag ${c.case_number ?? ''}`,
      rationale: 'Sagen har ingen tilbud endnu.', target_entity_type: 'service_case', target_entity_id: c.id, status: 'proposed',
    })
    .select('id')
    .single()
  if (!task) {
    await admin.from('agent_runs').update({ status: 'failed', error: 'task-oprettelse fejlede', finished_at: new Date().toISOString() }).eq('id', runId)
    return { success: false, error: 'Kunne ikke oprette task' }
  }

  // Attempt-nummer i noeglen: et afvist forslag kan erstattes af et nyt; samtidige koersler kolliderer (UNIQUE).
  const { count } = await admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('capability', OFFER_CAPABILITY).eq('payload->>case_id', c.id)
  const { error: aErr } = await admin.from('agent_actions').insert({
    task_id: task.id, run_id: runId, action_type: 'propose_offer', capability: OFFER_CAPABILITY, side_effect_class: 'create',
    requires_approval: true, min_approvals: 1, idempotency_key: `case-offer:${c.id}:${count ?? 0}`, status: 'awaiting_approval',
    payload: {
      ...proposal, confidence_level: 'medium', confidence_score: 0.6,
      rationale: 'Sagen er bekraeftet og har intet tilbud. Opretter et tomt internt udkast (ingen linjer/priser, sendes ikke) efter godkendelse.',
    },
  })
  const proposals = aErr ? 0 : 1
  if (aErr && (aErr as { code?: string }).code !== '23505') logger.error('runOfferAgent: action-insert fejlede', { error: aErr })
  await admin.from('agent_runs').update({ status: proposals ? 'awaiting_approval' : 'completed', finished_at: new Date().toISOString() }).eq('id', runId)
  return { success: true, data: { runId, proposals, reason: aErr ? 'forslaget fandtes allerede' : undefined } }
}
