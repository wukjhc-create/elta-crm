/**
 * Agent Core — typer (Fase 2).
 *
 * Spejler skemaet i supabase/migrations/00156_agent_core.sql. Se
 * docs/agent-core-architecture.md for det fulde design.
 *
 * Sikkerhedsinvarianter der er indkodet her:
 *  - HARD_BLOCKED_CLASSES kraever ALTID menneskelig approval (kan ikke
 *    aabnes af config). Bruges af Executor som defense-in-depth oven paa
 *    DB-triggeren.
 *  - Alle status-unioner matcher CHECK-constraints i migrationen 1:1.
 */

export type AgentType =
  | 'mail'
  | 'offer'
  | 'planning'
  | 'purchase'
  | 'followup'
  | 'economy'
  | 'director'

export type TriggerKind = 'cron' | 'manual' | 'event' | 'user'

export type SafetyMode = 'suggest' | 'approve' | 'auto'

export type RunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TaskStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'skipped'
  | 'failed'

export type ActionStatus =
  | 'planned'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'rolled_back'

export type SideEffectClass =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'send_external'
  | 'push_external'
  | 'finance'

export type ApprovalDecision = 'approved' | 'rejected' | 'escalated'

/**
 * Side-effekt-klasser der ALTID kraever gyldig menneskelig approval —
 * uanset agent_configs. Haandhaeves baade i DB (trigger) og i Executor.
 * MAA IKKE aendres uden en bevidst sikkerhedsbeslutning.
 */
export const HARD_BLOCKED_CLASSES: readonly SideEffectClass[] = [
  'send_external',
  'push_external',
  'finance',
  'delete',
] as const

export function isHardBlocked(cls: SideEffectClass): boolean {
  return (HARD_BLOCKED_CLASSES as readonly string[]).includes(cls)
}

// ---------------------------------------------------------------------
// Row-typer (spejler tabellerne)
// ---------------------------------------------------------------------

export interface AgentRun {
  id: string
  agent_type: AgentType
  trigger: TriggerKind
  triggered_by: string | null
  status: RunStatus
  safety_mode: SafetyMode
  dry_run: boolean
  input_context: Record<string, unknown>
  summary: string | null
  model: string | null
  tokens_used: number
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface AgentTask {
  id: string
  run_id: string
  seq: number
  kind: string
  title: string
  rationale: string | null
  confidence: number | null
  target_entity_type: string | null
  target_entity_id: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
}

export interface AgentAction {
  id: string
  task_id: string
  run_id: string
  action_type: string
  capability: string
  side_effect_class: SideEffectClass
  payload: Record<string, unknown>
  requires_approval: boolean
  min_approvals: number
  idempotency_key: string
  status: ActionStatus
  result: Record<string, unknown> | null
  error: string | null
  executed_at: string | null
  executed_by: string | null
  created_at: string
  updated_at: string
}

export interface AgentActionApproval {
  id: string
  action_id: string
  decision: ApprovalDecision
  decided_by: string
  decided_at: string
  reason: string | null
  channel: 'ui' | 'email'
  expires_at: string | null
}

export interface AgentConfig {
  agent_type: AgentType
  enabled: boolean
  safety_mode: SafetyMode
  allowed_action_types: string[]
  requires_approval_for: SideEffectClass[]
  max_actions_per_run: number
  daily_token_budget: number
  daily_action_budget: number
  updated_by: string | null
  updated_at: string
}

// ---------------------------------------------------------------------
// Capability Registry
// ---------------------------------------------------------------------

export interface CapabilityContext {
  action: AgentAction
  run: AgentRun
  /** Admin/service-role Supabase-klient (kun server-side). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
}

export interface CapabilityResult {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

export interface AgentInboxItem {
  run: Pick<AgentRun, 'id' | 'agent_type' | 'status' | 'safety_mode' | 'summary' | 'created_at'>
  actions: Array<
    Pick<
      AgentAction,
      'id' | 'capability' | 'action_type' | 'side_effect_class' | 'status' | 'requires_approval' | 'min_approvals' | 'payload' | 'result'
    >
  >
  /** Antal ikke-afsluttede actions der venter paa review/handling. */
  pendingCount: number
  /** Hoejeste review-prioritet blandt ikke-afsluttede actions (til sortering). */
  topReviewPriority: number
}

export interface CapabilityDefinition {
  /** Unik noegle, matcher agent_actions.capability. */
  key: string
  /** Bestemmer gating (approval + hard-block). */
  sideEffectClass: SideEffectClass
  /** Agent-principal-scope der kraeves (fx 'agent.mail.draft'). */
  requiredScope: string
  /** Om denne capability som udgangspunkt kraever approval. */
  defaultRequiresApproval: boolean
  /** Antal distinkte approvals der kraeves (>=1). Finance saettes til 2 senere. */
  minApprovals: number
  /** Kort beskrivelse (UI/audit). */
  description: string
  /**
   * Den faktiske udfoerelse. UNDEFINED = deklareret men endnu ikke wired;
   * Executor NAEGTER at udfoere en capability uden handler (fail-safe).
   */
  handler?: (ctx: CapabilityContext) => Promise<CapabilityResult>
}
