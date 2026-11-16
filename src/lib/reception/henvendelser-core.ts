/**
 * Henvendelser — server-kerne (AI-receptionist fase 2). Server-only: bevidst IKKE 'use server' og aldrig importeret i
 * klientkode (scripts/assert-server-only-helpers.ts). Alle læsninger/skrivninger sker med den INDLOGGEDE medarbejders
 * RLS-klient — ingen service-role. Handlinger udføres via de EKSISTERENDE server-actions (createCustomerTask …).
 *
 *   ingestCommunication: kontrakt (+ engine-tur) → conversations + conversation_items (idempotent på dedupe-nøgler)
 *   recordAndExecuteActions: planlagte handlinger → conversation_actions (idempotent) → auto-udførelse gennem
 *                            AI-aktørens allowlist + medarbejderens rettigheder + politikken; resten gemmes som forslag
 */
import type { Permission } from '@/lib/auth/permissions'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { SERVICE_CASE_STATUS_LABELS, type ServiceCaseStatus } from '@/types/service-cases.types'
import type { InboundCommunication } from './contract'
import { clip } from './contract'
import { matchIdentity, type IdentityResult } from './identity-match'
import type { EnginePorts, OpenCase, PlannedAction, ReceptionTurn } from './engine'
import { normStreet } from './disclosure'
import { ACTION_PERMISSIONS, AI_ACTOR, aiActorMayExecute } from './ai-actor'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface ActorCtx { supabase: Db; userId: string; hasPermission: (p: Permission) => boolean }

/** Engine-porte mod CRM'et med brugerens klient (RLS) */
export function enginePortsFor(supabase: Db, preset?: { confirmedCustomerId?: string | null; candidateCustomerId?: string | null }): EnginePorts {
  return {
    identify: async (input): Promise<IdentityResult> => {
      const fixed = preset?.confirmedCustomerId ?? preset?.candidateCustomerId
      if (fixed) return { state: 'unique_match', candidates: [{ customerId: fixed, via: [], contactIds: [] }], leadIds: [], keysUsed: [], error: null }
      return matchIdentity(supabase, input)
    },
    candidateFacts: async (customerId) => {
      const [c, s] = await Promise.all([
        supabase.from('customers').select('billing_postal_code, shipping_postal_code, billing_address, shipping_address').eq('id', customerId).maybeSingle(),
        supabase.from('service_cases').select('case_number').eq('customer_id', customerId).limit(200),
      ])
      if (c.error || s.error || !c.data) return { ok: false, error: 'read' }
      const row = c.data as Record<string, string | null>
      return { ok: true, value: {
        postalCodes: [row.billing_postal_code, row.shipping_postal_code].filter(Boolean) as string[],
        streetNames: [row.billing_address, row.shipping_address].map((a) => normStreet(a)).filter(Boolean) as string[],
        caseNumbers: ((s.data ?? []) as Array<{ case_number: string | null }>).map((x) => x.case_number).filter(Boolean) as string[],
      } }
    },
    openCases: async (customerId) => {
      const { data, error } = await supabase.from('service_cases').select('id, case_number, title, status')
        .eq('customer_id', customerId).eq('is_proposal', false).not('status', 'in', '(closed,converted)').order('created_at', { ascending: false }).limit(20)
      if (error) return { ok: false, error: 'read' }
      return { ok: true, value: ((data ?? []) as Array<{ id: string; case_number: string | null; title: string | null; status: string }>).map((r): OpenCase => ({
        id: r.id, caseNumber: r.case_number, title: r.title ?? 'Sag', statusLabel: SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? 'Under behandling',
      })) }
    },
  }
}

export type IngestResult = { outcome: 'created'; conversationId: string; itemId: string } | { outcome: 'duplicate'; conversationId: string | null } | { outcome: 'error'; error: string }

const isUnique = (e: { code?: string } | null) => e?.code === '23505'

export async function ingestCommunication(ctx: ActorCtx, comm: InboundCommunication, turn: ReceptionTurn | null): Promise<IngestResult> {
  // Allerede indtaget? (item-nøglen er kanonisk; en henvendelse pr. kilde-item i fase 2)
  const existing = await ctx.supabase.from('conversation_items').select('conversation_id').eq('dedupe_key', comm.dedupeKey).maybeSingle()
  if (existing.error) return { outcome: 'error', error: 'read_failed' }
  if (existing.data) return { outcome: 'duplicate', conversationId: (existing.data as { conversation_id: string }).conversation_id }
  // Review-fund M3: en tidligere kørsel kan have oprettet henvendelsen men ikke item'et → genoptag (item-indsæt nedenfor)
  const prior = await ctx.supabase.from('conversations').select('id').eq('dedupe_key', comm.dedupeKey).maybeSingle()
  if (prior.error) return { outcome: 'error', error: 'read_failed' }
  const resumeId = (prior.data as { id: string } | null)?.id ?? null

  const confirmed = comm.customer.state === 'confirmed' ? comm.customer.customerId : null
  const idState = confirmed ? 'confirmed' : (turn?.identity.state ?? comm.customer.state)
  const candidate = confirmed ? null : (comm.customer.candidateId ?? (turn?.identity.state === 'unique_match' ? turn.identity.candidates[0].customerId : null))
  const caseConfirmed = confirmed && comm.case.state === 'confirmed' ? comm.case.caseId : null
  const conv = {
    channel: comm.channel,
    status: turn?.handoff ? 'handoff' : 'new',
    title: clip(turn?.title || comm.title, 200) || 'Henvendelse',
    ai_summary: turn ? clip(turn.summary, 2000) : (comm.message ? clip(comm.message, 2000) : null),
    intent: turn?.intent ?? null,
    urgency: turn ? turn.urgency : comm.urgency,
    ai_confidence: turn ? Math.round(turn.confidence * 100) / 100 : null,
    customer_id: confirmed,
    customer_candidate_id: candidate,
    customer_match_state: idState,
    candidate_count: confirmed ? 1 : (turn?.identity.candidates.length ?? comm.customer.candidateCount),
    service_case_id: caseConfirmed,
    case_candidate_id: caseConfirmed ? null : (turn?.caseMatch.candidateId ?? null),
    case_match_state: caseConfirmed ? 'confirmed' : (turn?.caseMatch.state ?? comm.case.state),
    assigned_team: turn?.handoff?.team ?? null,
    next_action: turn?.handoff ? clip(turn.handoff.suggestedNextAction, 300) : null,
    handoff_reasons: turn?.handoff?.reasons ?? [],
    dedupe_key: comm.dedupeKey,
    first_at: comm.occurredAt,
    last_at: comm.occurredAt,
    created_by: ctx.userId,
  }
  const ins = resumeId ? { data: { id: resumeId }, error: null } : await ctx.supabase.from('conversations').insert(conv).select('id').single()
  if (ins.error) {
    if (isUnique(ins.error)) {
      const again = await ctx.supabase.from('conversations').select('id').eq('dedupe_key', comm.dedupeKey).maybeSingle()
      return { outcome: 'duplicate', conversationId: (again.data as { id: string } | null)?.id ?? null }
    }
    return { outcome: 'error', error: ins.error.code === '42501' ? 'permission_denied' : 'insert_failed' }
  }
  const conversationId = (ins.data as { id: string }).id
  const item = await ctx.supabase.from('conversation_items').insert({
    conversation_id: conversationId, channel: comm.channel, direction: comm.direction, provider: comm.provider,
    provider_event_id: comm.providerEventId, source_table: comm.source.table, source_id: comm.source.id,
    occurred_at: comm.occurredAt, title: clip(comm.title, 200), body_preview: comm.message ? clip(comm.message, 500) : null,
    sender_label: comm.sender.label ? clip(comm.sender.label, 200) : null,
    attachment_document_ids: comm.attachments.map((a) => a.documentId).filter(Boolean),
    transcript_status: comm.transcript.state, transcript_ref: comm.transcript.ref,
    dedupe_key: comm.dedupeKey, created_by: ctx.userId,
  }).select('id').single()
  if (item.error) {
    if (isUnique(item.error)) return { outcome: 'duplicate', conversationId }
    return { outcome: 'error', error: 'item_insert_failed' }
  }
  await insertAuditRow({ user_id: ctx.userId, entity_type: 'conversation', entity_id: conversationId, action: 'conversation_ingested',
    action_description: `Henvendelse indtaget (${comm.channel})`, metadata: { source_table: comm.source.table, actor: turn ? AI_ACTOR : 'system', on_behalf_of: ctx.userId } })
  return { outcome: 'created', conversationId, itemId: (item.data as { id: string }).id }
}

export interface ActionOutcome { type: string; state: 'executed' | 'proposed' | 'blocked' | 'failed' | 'duplicate'; detail: string | null }

async function executeAuto(ctx: ActorCtx, a: PlannedAction, conversationId: string, summary: string): Promise<{ ok: true; ref: string } | { ok: false; code: string }> {
  const customerId = typeof a.payload.customerCandidateId === 'string' ? a.payload.customerCandidateId : null
  const caseId = typeof a.payload.caseCandidateId === 'string' ? a.payload.caseCandidateId : undefined
  const note = `${summary}\n\nOprettet af AI-receptionisten fra Henvendelse ${conversationId}. Kunden er en kandidat (deterministisk match) — kontrollér før kontakt.`
  switch (a.type) {
    case 'find_customer': case 'find_contact': case 'find_case': return { ok: true, ref: 'read' }
    case 'append_communication': return { ok: true, ref: 'item' }
    case 'create_task': case 'create_callback': case 'create_planning_request': {
      if (!customerId) return { ok: false, code: 'no_customer' }
      const { createCustomerTask } = await import('@/lib/actions/customer-tasks')
      const title = a.type === 'create_callback' ? 'Ring tilbage (Henvendelse)' : a.type === 'create_planning_request'
        ? `Planlægning: ${String(a.payload.title ?? 'ønsker besøg/tid')}` : String(a.payload.title ?? 'Opgave fra Henvendelse')
      const r = await createCustomerTask({
        customer_id: customerId, title: clip(title, 300), description: clip(note, 10_000), priority: 'normal',
        ...(a.type === 'create_callback' ? { callbackQueue: true } : caseId ? { service_case_id: caseId } : {}),
      })
      if (!r.success) return { ok: false, code: 'task_failed' }
      return { ok: true, ref: r.existingCallback ? 'callback:existing' : 'task:created' }
    }
  }
  return { ok: false, code: 'not_executable' }
}

/** execute=false (fx indtag fra mail/portal): også auto-handlinger gemmes kun som FORSLAG */
export async function recordAndExecuteActions(ctx: ActorCtx, conversationId: string, turn: ReceptionTurn, opts: { execute: boolean }): Promise<ActionOutcome[]> {
  const out: ActionOutcome[] = []
  for (const a of turn.actions) {
    // AI-aktøren: allowlist + lånte rettigheder (fællesmængde). En 'auto' fra politikken kan stadig afvises her.
    const actor = a.outcome === 'auto' ? aiActorMayExecute(a.type, ctx.hasPermission, ACTION_PERMISSIONS[a.type] ?? []) : null
    const blockedByActor = actor && !actor.allowed
    const initialState = a.outcome === 'forbidden' || a.outcome === 'handoff' ? 'blocked' : a.outcome === 'proposal' || blockedByActor || !opts.execute ? 'proposed' : 'approved'
    const reasons = [...a.reasons, ...(blockedByActor ? [`ai_actor:${actor!.allowed ? '' : actor!.reason}`] : []), ...(!opts.execute && a.outcome === 'auto' && !blockedByActor ? ['indtaget fra kilde: kun forslag'] : [])]
    const ins = await ctx.supabase.from('conversation_actions').insert({
      conversation_id: conversationId, action_type: a.type.slice(0, 40), policy_outcome: a.outcome, state: initialState, actor: AI_ACTOR,
      payload: { ...a.payload, proposedBy: a.proposedBy }, reasons, idempotency_key: a.idempotencyKey, created_by: ctx.userId,
    }).select('id').single()
    if (ins.error) {
      out.push(isUnique(ins.error) ? { type: a.type, state: 'duplicate', detail: null } : { type: a.type, state: 'failed', detail: 'record_failed' })
      continue
    }
    const id = (ins.data as { id: string }).id
    if (initialState !== 'approved') { out.push({ type: a.type, state: initialState === 'blocked' ? 'blocked' : 'proposed', detail: reasons[0] ?? null }); continue }
    const r = await executeAuto(ctx, a, conversationId, turn.summary)
    const upd = await ctx.supabase.from('conversation_actions').update(r.ok ? { state: 'executed', executed_ref: r.ref, decided_at: new Date().toISOString() } : { state: 'failed', error_code: r.code })
      .eq('id', id)
    if (upd.error) { out.push({ type: a.type, state: 'failed', detail: 'state_update_failed' }); continue }
    await insertAuditRow({ user_id: ctx.userId, entity_type: 'conversation', entity_id: conversationId, action: `${AI_ACTOR}.${a.type}`,
      action_description: r.ok ? `AI-receptionist: ${a.type} udført` : `AI-receptionist: ${a.type} fejlede`,
      metadata: { actor: AI_ACTOR, on_behalf_of: ctx.userId, outcome: r.ok ? 'executed' : 'failed', ref: r.ok ? r.ref : r.code } })
    out.push(r.ok ? { type: a.type, state: 'executed', detail: r.ref } : { type: a.type, state: 'failed', detail: r.code })
  }
  return out
}
