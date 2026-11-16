/**
 * Henvendelser — server-kerne (AI-receptionist fase 2 + final review). Server-only: bevidst IKKE 'use server' og aldrig
 * importeret i klientkode (scripts/assert-server-only-helpers.ts).
 *
 *   buildIngestPayload   kontrakt (+ engine-tur) → input til DB-funktionen reception_ingest (ÉN atomisk transaktion:
 *                        henvendelse + primært item + AI-forslag + audit). Kildens identitet (kanal, udbyder, tidspunkt,
 *                        nøgle, bekræftet kunde/sag) afledes i databasen af selve kilderækken — payloaden er kun forventning
 *                        og præsentation; en forkert forventning afvises af databasen.
 *   ingestCommunication  indtag med den INDLOGGEDE medarbejders klient (RLS + rettigheder i DB-funktionen)
 *   executeApprovedActions  'approved' (auto + medarbejderens rettigheder + AI-aktørens allowlist) udføres via de
 *                        EKSISTERENDE server-actions (createCustomerTask …); alt andet forbliver forslag.
 * Baggrundsaktøren (uden medarbejder) bruger samme payload via lib/reception/background-actor.ts — kun forslag.
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

/** Engine-porte mod CRM'et. Kun læsning (select) — bruges med medarbejderens klient eller baggrundsaktørens læse-port. */
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

export interface RpcAction { id: string | null; type: string; state: string; idempotency_key: string }
export type IngestResult =
  | { outcome: 'created'; conversationId: string; itemId: string; actions: RpcAction[] }
  | { outcome: 'duplicate'; conversationId: string | null }
  | { outcome: 'error'; error: IngestError }
export type IngestError = 'unavailable' | 'permission_denied' | 'source_mismatch' | 'invalid_input' | 'not_supported' | 'insert_failed'

/** DB-fejlkode → stabil fejl (ingen DB-tekst videre til UI) */
export function mapIngestError(e: { code?: string | null } | null): IngestError {
  switch (e?.code) {
    case '42501': return 'permission_denied'
    case '23514': return 'source_mismatch'
    case '22023': case '22P02': return 'invalid_input'
    case '0A000': return 'not_supported'
    case 'PGRST202': case '42883': case '42P01': case 'PGRST205': return 'unavailable'
    default: return 'insert_failed'
  }
}

/**
 * Payload til reception_ingest. `execute`-flaget pr. handling er kun et ØNSKE: databasen giver højst 'approved' til en
 * indlogget medarbejder og kun for typer AI-aktøren må udføre; baggrundsaktøren får altid 'proposed'.
 */
export function buildIngestPayload(comm: InboundCommunication, turn: ReceptionTurn | null, opts: { execute: boolean; mayExecute?: (a: PlannedAction) => { allowed: boolean; reason?: string } }): Record<string, unknown> {
  const confirmed = comm.customer.state === 'confirmed' ? comm.customer.customerId : null
  const candidate = confirmed ? null : (comm.customer.candidateId ?? (turn?.identity.state === 'unique_match' ? turn.identity.candidates[0].customerId : null))
  const p: Record<string, unknown> = {
    source_table: comm.source.table,
    source_id: comm.source.id,
    ...(comm.source.table === 'simulator' ? { dedupe_key: comm.dedupeKey } : {}),
    ...(comm.source.table === 'manual' ? { provider: comm.provider, provider_event_id: comm.providerEventId, channel: comm.channel, occurred_at: comm.occurredAt } : {}),
    ...(confirmed ? { confirmed_customer_id: confirmed } : {}),
    ...(confirmed && comm.case.state === 'confirmed' && comm.case.caseId ? { confirmed_case_id: comm.case.caseId } : {}),
    customer_candidate_id: candidate,
    customer_match_state: turn?.identity.state ?? comm.customer.state,
    candidate_count: turn?.identity.candidates.length ?? comm.customer.candidateCount,
    case_candidate_id: turn?.caseMatch.candidateId ?? comm.case.candidateId ?? null,
    case_match_state: turn?.caseMatch.state ?? comm.case.state,
    title: clip(turn?.title || comm.title, 200) || 'Henvendelse',
    ai_summary: turn ? clip(turn.summary, 2000) : (comm.message ? clip(comm.message, 2000) : null),
    intent: turn?.intent ?? null,
    urgency: turn ? turn.urgency : comm.urgency,
    ai_confidence: turn ? Math.round(turn.confidence * 100) / 100 : null,
    status: turn?.handoff ? 'handoff' : 'new',
    assigned_team: turn?.handoff?.team ?? null,
    next_action: turn?.handoff ? clip(turn.handoff.suggestedNextAction, 300) : null,
    handoff_reasons: turn?.handoff?.reasons ?? [],
    item_title: clip(comm.title, 200),
    preview: comm.message ? clip(comm.message, 500) : null,
    sender_label: comm.sender.label ? clip(comm.sender.label, 200) : null,
    transcript_status: comm.transcript.state,
    actions: (turn?.actions ?? []).map((a) => {
      const gate = a.outcome === 'auto' && opts.execute && opts.mayExecute ? opts.mayExecute(a) : null
      const execute = !!gate?.allowed
      const reasons = [...a.reasons, ...(gate && !gate.allowed ? [`ai_actor:${gate.reason ?? 'blocked'}`] : []), ...(!opts.execute && a.outcome === 'auto' ? ['indtaget fra kilde: kun forslag'] : [])]
      return { action_type: a.type.slice(0, 40), policy_outcome: a.outcome, reasons, payload: { ...a.payload, proposedBy: a.proposedBy }, idempotency_key: a.idempotencyKey, execute }
    }),
  }
  return p
}

/** Kald DB-funktionen (medarbejderens klient eller baggrundsaktørens rpc-port) */
export async function callReceptionIngest(rpc: (fn: 'reception_ingest', args: { p: Record<string, unknown> }) => PromiseLike<{ data: unknown; error: { code?: string | null } | null }>, payload: Record<string, unknown>): Promise<IngestResult> {
  const { data, error } = await rpc('reception_ingest', { p: payload })
  if (error) return { outcome: 'error', error: mapIngestError(error) }
  const d = (data ?? {}) as { outcome?: string; conversation_id?: string | null; item_id?: string; actions?: RpcAction[] }
  if (d.outcome === 'duplicate') return { outcome: 'duplicate', conversationId: d.conversation_id ?? null }
  if (d.outcome === 'created' && d.conversation_id && d.item_id) return { outcome: 'created', conversationId: d.conversation_id, itemId: d.item_id, actions: Array.isArray(d.actions) ? d.actions : [] }
  return { outcome: 'error', error: 'insert_failed' }
}

/** Indtag på vegne af den indloggede medarbejder (simulator, "Hent nye", Henvendelser) */
export async function ingestCommunication(ctx: ActorCtx, comm: InboundCommunication, turn: ReceptionTurn | null, opts: { execute: boolean }): Promise<IngestResult> {
  const payload = buildIngestPayload(comm, turn, {
    execute: opts.execute,
    mayExecute: (a) => {
      const d = aiActorMayExecute(a.type, ctx.hasPermission, ACTION_PERMISSIONS[a.type] ?? [])
      return d.allowed ? { allowed: true } : { allowed: false, reason: d.reason }
    },
  })
  return callReceptionIngest((fn, args) => ctx.supabase.rpc(fn, args), payload)
}

export interface ActionOutcome { type: string; state: 'executed' | 'proposed' | 'blocked' | 'failed' | 'duplicate'; detail: string | null }

async function executeAuto(a: PlannedAction, conversationId: string, summary: string): Promise<{ ok: true; ref: string } | { ok: false; code: string }> {
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

/**
 * Udfør de handlinger databasen gav tilstanden 'approved' (kun medarbejder-indtag med execute). Kunde/sag i payload er
 * dem databasen selv satte (afledt/valideret) — ikke kalderens.
 */
export async function executeApprovedActions(ctx: ActorCtx, conversationId: string, turn: ReceptionTurn, rpcActions: RpcAction[]): Promise<ActionOutcome[]> {
  const out: ActionOutcome[] = []
  for (const ra of rpcActions) {
    if (ra.state !== 'approved' || !ra.id) {
      out.push({ type: ra.type, state: ra.state === 'duplicate' ? 'duplicate' : ra.state === 'blocked' ? 'blocked' : 'proposed', detail: null })
      continue
    }
    const stored = await ctx.supabase.from('conversation_actions').select('payload').eq('id', ra.id).maybeSingle()
    const planned = turn.actions.find((a) => a.idempotencyKey === ra.idempotency_key)
    if (stored.error || !stored.data || !planned) { out.push({ type: ra.type, state: 'failed', detail: 'read_failed' }); continue }
    const a: PlannedAction = { ...planned, payload: (stored.data as { payload: Record<string, unknown> }).payload ?? {} }
    const r = await executeAuto(a, conversationId, turn.summary)
    const upd = await ctx.supabase.from('conversation_actions')
      // DB-værnet kræver at en brugers tilstandsændring har brugeren som beslutter (review F3)
      .update(r.ok ? { state: 'executed', executed_ref: r.ref, decided_by: ctx.userId, decided_at: new Date().toISOString() }
        : { state: 'failed', error_code: r.code, decided_by: ctx.userId, decided_at: new Date().toISOString() })
      .eq('id', ra.id).eq('state', 'approved')
    if (upd.error) { out.push({ type: ra.type, state: 'failed', detail: 'state_update_failed' }); continue }
    await insertAuditRow({ user_id: ctx.userId, entity_type: 'conversation', entity_id: conversationId, action: `${AI_ACTOR}.${ra.type}`,
      action_description: r.ok ? `AI-receptionist: ${ra.type} udført` : `AI-receptionist: ${ra.type} fejlede`,
      metadata: { actor: AI_ACTOR, mode: 'on_behalf_of_user', on_behalf_of: ctx.userId, outcome: r.ok ? 'executed' : 'failed', ref: r.ok ? r.ref : r.code } })
    out.push(r.ok ? { type: ra.type, state: 'executed', detail: r.ref } : { type: ra.type, state: 'failed', detail: r.code })
  }
  return out
}
