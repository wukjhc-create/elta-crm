import type { ActionContext, ActionResult } from '@/types/automation.types'

export async function runNotify(ctx: ActionContext): Promise<ActionResult> {
  const message = String(ctx.rule.action_config?.message || `Trigger: ${ctx.event.trigger}`)
  console.log('AUTOMATION NOTIFY:', ctx.event.entityType, ctx.event.entityId, message)
  // Also write a system_health_log entry so the dashboard sees it.
  try {
    const { logHealth } = await import('@/lib/services/system-health')
    await logHealth('health_check', 'ok', `automation notify: ${message}`, {
      ruleId: ctx.rule.id,
      entityType: ctx.event.entityType,
      entityId: ctx.event.entityId,
    })
  } catch { /* never crash */ }
  return { ok: true, message }
}
