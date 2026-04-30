/**
 * Autopilot rule engine (Phase 10).
 *
 * Single entry point: evaluateAndRunAutomations(event). Always:
 *   - looks up active rules whose trigger matches the event
 *   - evaluates condition_json against the event payload
 *   - dispatches the action via the action registry
 *   - logs every attempt to automation_executions
 *
 * Hard safety guarantees:
 *   - per (rule_id, entity_id) at most ONE row with status='executed'
 *     (DB partial UNIQUE index uq_automation_exec_one_per_entity).
 *     A second invocation hits 23505 → we treat it as "already done"
 *     and return without re-running the action.
 *   - dry_run flag (per-rule OR per-event) skips the action entirely
 *     and logs status='dry_run'.
 *   - any handler exception is caught and logged as status='failed';
 *     it never propagates back to the caller's main flow.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { ACTION_REGISTRY } from './actions'
import { evaluateCondition } from './condition-evaluator'
import type {
  AutomationEvent,
  AutomationExecutionRow,
  AutomationRuleRow,
  AutomationStatus,
} from '@/types/automation.types'

export interface RunSummary {
  trigger: string
  entityType: string
  entityId: string
  rulesEvaluated: number
  executions: Array<{
    ruleId: string
    ruleName: string
    status: AutomationStatus
    message?: string
  }>
}

export async function evaluateAndRunAutomations(event: AutomationEvent): Promise<RunSummary> {
  const summary: RunSummary = {
    trigger: event.trigger,
    entityType: event.entityType,
    entityId: event.entityId,
    rulesEvaluated: 0,
    executions: [],
  }

  let rules: AutomationRuleRow[] = []
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('trigger', event.trigger)
      .eq('active', true)
    rules = (data ?? []) as AutomationRuleRow[]
  } catch (err) {
    logger.error('automation: rule fetch failed', { error: err })
    return summary
  }

  summary.rulesEvaluated = rules.length

  for (const rule of rules) {
    const handler = ACTION_REGISTRY[rule.action]
    if (!handler) {
      await logExecution(rule, event, 'failed', null, `unknown action: ${rule.action}`)
      summary.executions.push({ ruleId: rule.id, ruleName: rule.name, status: 'failed', message: `unknown action ${rule.action}` })
      continue
    }

    // Condition gate
    if (!evaluateCondition(rule.condition_json, event.payload)) {
      await logExecution(rule, event, 'skipped', null, 'condition false')
      summary.executions.push({ ruleId: rule.id, ruleName: rule.name, status: 'skipped', message: 'condition false' })
      continue
    }

    // Rate-limit gate: already executed once for this (rule, entity)?
    if (await alreadyExecuted(rule.id, event.entityId)) {
      await logExecution(rule, event, 'skipped', null, 'already executed for this entity')
      summary.executions.push({ ruleId: rule.id, ruleName: rule.name, status: 'skipped', message: 'already executed' })
      continue
    }

    // Dry run?
    if (event.globalDryRun || rule.dry_run) {
      try {
        const result = await handler({ rule, event })
        await logExecution(rule, event, 'dry_run', result.data ?? null, result.message ?? null)
        summary.executions.push({ ruleId: rule.id, ruleName: rule.name, status: 'dry_run', message: result.message })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await logExecution(rule, event, 'failed', null, msg)
        summary.executions.push({ ruleId: rule.id, ruleName: rule.name, status: 'failed', message: msg })
      }
      continue
    }

    // Real execution
    try {
      const result = await handler({ rule, event })
      const status: AutomationStatus = result.ok ? 'executed' : 'failed'
      const inserted = await logExecution(rule, event, status, result.data ?? null, result.message ?? null)
      if (inserted === '23505') {
        // Race — another process already logged this exact (rule, entity)
        // execution. Treat as already-done; don't double-report.
        summary.executions.push({ ruleId: rule.id, ruleName: rule.name, status: 'skipped', message: 'race: already executed' })
        continue
      }
      summary.executions.push({ ruleId: rule.id, ruleName: rule.name, status, message: result.message })
      if (status === 'executed') {
        console.log('AUTOMATION EXECUTED:', rule.id, event.entityId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('automation handler threw', {
        entityId: event.entityId,
        metadata: { ruleId: rule.id, action: rule.action },
        error: err instanceof Error ? err : new Error(msg),
      })
      await logExecution(rule, event, 'failed', null, msg)
      summary.executions.push({ ruleId: rule.id, ruleName: rule.name, status: 'failed', message: msg })
    }
  }

  return summary
}

async function alreadyExecuted(ruleId: string, entityId: string): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('automation_executions')
      .select('id')
      .eq('rule_id', ruleId)
      .eq('entity_id', entityId)
      .eq('status', 'executed')
      .limit(1)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

/**
 * Insert an execution row. Returns '23505' when the partial UNIQUE
 * index blocked a second 'executed' row for the same (rule, entity);
 * caller treats this as success-already-recorded.
 */
async function logExecution(
  rule: AutomationRuleRow,
  event: AutomationEvent,
  status: AutomationStatus,
  result: Record<string, unknown> | null,
  message: string | null
): Promise<string | null> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('automation_executions').insert({
      rule_id: rule.id,
      entity_type: event.entityType,
      entity_id: event.entityId,
      status,
      result,
      error_message: status === 'failed' ? message : null,
    })
    if (error) {
      if ((error as { code?: string }).code === '23505') return '23505'
      logger.warn('automation_executions insert failed', { entityId: event.entityId, error })
    }
  } catch (err) {
    logger.warn('automation_executions insert threw', { entityId: event.entityId, error: err })
  }
  return null
}

// =====================================================
// Read helpers (for UI / debugging)
// =====================================================

export async function listAutomationRules(): Promise<AutomationRuleRow[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('automation_rules')
    .select('*')
    .order('created_at', { ascending: true })
  return (data ?? []) as AutomationRuleRow[]
}

export async function listRecentExecutions(limit = 100): Promise<AutomationExecutionRow[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('automation_executions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as AutomationExecutionRow[]
}
