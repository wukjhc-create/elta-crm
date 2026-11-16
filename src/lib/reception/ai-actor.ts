/**
 * AI-aktøren `ai_receptionist` (AI-receptionist fase 2). Bevidst IKKE 'use server'.
 *
 * AI'en har INGEN egen database-rolle, ingen service-role og ingen admin-rettigheder. I fase 2 udføres dens handlinger
 * altid på vegne af en indlogget medarbejder (simulator, Henvendelser) med medarbejderens RLS-klient. Den effektive
 * ret er FÆLLESMÆNGDEN af:
 *   1. medarbejderens effektive rettigheder (de eksisterende server-actions tjekker dem selv), og
 *   2. AI-aktørens eksplicitte allowlist herunder, og
 *   3. handlings-politikken (action-policy.ts: auto/proposal/handoff/forbidden).
 * Alle handlinger auditeres med actor = 'ai_receptionist' og on_behalf_of = medarbejderens id.
 * Baggrunds-udførelse uden en medarbejder (fx et indgående opkald om natten) kræver en dedikeret DB-aktør —
 * se fase 3 i docs/runbooks/ELTA_AI_RECEPTIONIST_PHASE_2.md (ikke bygget).
 */
import type { Permission } from '@/lib/auth/permissions'
import type { ReceptionAction } from './action-policy'

export const AI_ACTOR = 'ai_receptionist' as const

/** Handlinger AI-aktøren må UDFØRE automatisk (politikken skal også sige 'auto') */
export const AI_AUTO_EXECUTABLE: ReadonlySet<ReceptionAction> = new Set<ReceptionAction>([
  'find_customer', 'find_contact', 'find_case', 'append_communication', 'create_task', 'create_callback', 'create_planning_request',
])

/** Handlinger AI-aktøren højst må FORESLÅ (et menneske godkender og udfører) */
export const AI_PROPOSE_ONLY: ReadonlySet<ReceptionAction> = new Set<ReceptionAction>([
  'create_customer_proposal', 'create_case_proposal', 'request_documents', 'mark_handled',
])

/** Rettigheder AI-aktøren må låne af medarbejderen (alt andet afvises, selv om medarbejderen har det) */
export const AI_RECEPTIONIST_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  'customers.view', 'cases.view.assigned', 'tasks.create', 'conversations.view', 'conversations.manage',
] as Permission[])

export type ActorDecision = { allowed: true } | { allowed: false; reason: 'not_in_allowlist' | 'propose_only' | 'missing_user_permission' }

/** Må aktøren udføre handlingen nu, givet medarbejderens rettigheder? */
export function aiActorMayExecute(action: string, userHas: (p: Permission) => boolean, required: Permission[]): ActorDecision {
  if (AI_PROPOSE_ONLY.has(action as ReceptionAction)) return { allowed: false, reason: 'propose_only' }
  if (!AI_AUTO_EXECUTABLE.has(action as ReceptionAction)) return { allowed: false, reason: 'not_in_allowlist' }
  for (const p of required) {
    if (!AI_RECEPTIONIST_PERMISSIONS.has(p)) return { allowed: false, reason: 'not_in_allowlist' }
    if (!userHas(p)) return { allowed: false, reason: 'missing_user_permission' }
  }
  return { allowed: true }
}

/** Rettigheder hver handling kræver (lånt af medarbejderen) */
export const ACTION_PERMISSIONS: Record<string, Permission[]> = {
  find_customer: ['customers.view'] as Permission[],
  find_contact: ['customers.view'] as Permission[],
  find_case: ['cases.view.assigned'] as Permission[],
  append_communication: ['conversations.manage'] as Permission[],
  create_task: ['tasks.create', 'conversations.manage'] as Permission[],
  create_callback: ['tasks.create', 'conversations.manage'] as Permission[],
  create_planning_request: ['tasks.create', 'conversations.manage'] as Permission[],
}
