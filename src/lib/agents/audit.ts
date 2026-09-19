/**
 * Agent Core — audit-logging.
 *
 * Genbruger det eksisterende audit_logs + RPC log_audit_event. HVER
 * eksekveret (eller afvist) agent-action skal logges her, saa der er 100%
 * spor over hvad agenter foretager sig. actor = 'agent:<type>'.
 */

import { logger } from '@/lib/utils/logger'
import type { AgentType } from '@/types/agent-core.types'

export interface AgentAuditInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
  agentType: AgentType
  runId: string
  actionId: string
  /** Kort verbum, fx 'executed' | 'refused' | 'failed'. */
  action: string
  description: string
  metadata?: Record<string, unknown>
}

/**
 * Skriv en agent-audit-raekke. Non-blocking: fejl i selve audit-loggingen
 * maa aldrig vaelte en agent-koersel, men logges lokalt.
 */
export async function logAgentAudit(input: AgentAuditInput): Promise<void> {
  try {
    const { error } = await input.admin.rpc('log_audit_event', {
      p_user_id: null,
      p_user_email: `agent:${input.agentType}`,
      p_user_name: `Agent (${input.agentType})`,
      p_entity_type: 'agent_action',
      p_entity_id: input.actionId,
      p_entity_name: null,
      p_action: input.action,
      p_action_description: input.description,
      p_changes: null,
      p_metadata: {
        actor: `agent:${input.agentType}`,
        run_id: input.runId,
        action_id: input.actionId,
        ...(input.metadata ?? {}),
      },
      p_ip_address: null,
      p_user_agent: 'agent-core-executor',
    })
    if (error) {
      logger.error('logAgentAudit RPC-fejl', { error, metadata: { actionId: input.actionId } })
    }
  } catch (err) {
    logger.error('logAgentAudit exception', { error: err, metadata: { actionId: input.actionId } })
  }
}
