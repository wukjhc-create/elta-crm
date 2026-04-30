import type { ActionContext, ActionResult } from '@/types/automation.types'

interface TaskConfig {
  title?: string
  description?: string
  /** Days from now until due_date. */
  days?: number
  /** Pull customer_id from this payload path (default: "customer_id" or entity_id when entity is "customer"). */
  customer_id_from?: string
}

export async function runCreateTask(ctx: ActionContext): Promise<ActionResult> {
  const cfg = (ctx.rule.action_config || {}) as TaskConfig

  const customerId =
    (cfg.customer_id_from && readPath(ctx.event.payload, cfg.customer_id_from)) ||
    (ctx.event.entityType === 'customer' ? ctx.event.entityId : null) ||
    (ctx.event.payload as Record<string, unknown>)?.customer_id

  if (!customerId) return { ok: false, message: 'no customer_id resolved' }

  const title = cfg.title || 'Opfølgning'
  const description = cfg.description || null
  const dueIso = cfg.days
    ? new Date(Date.now() + Number(cfg.days) * 24 * 60 * 60 * 1000).toISOString()
    : null

  if (ctx.event.globalDryRun || ctx.rule.dry_run) {
    return { ok: true, message: 'dry_run', data: { customerId, title, dueIso } }
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()

  // Idempotency: don't create a duplicate open task with the same title
  // for the same customer.
  const { data: existing } = await supabase
    .from('customer_tasks')
    .select('id')
    .eq('customer_id', customerId)
    .eq('title', title)
    .neq('status', 'completed')
    .limit(1)
  if (existing && existing.length > 0) {
    return { ok: true, message: 'task already exists', data: { taskId: existing[0].id } }
  }

  const { data, error } = await supabase
    .from('customer_tasks')
    .insert({
      customer_id: customerId,
      title,
      description,
      status: 'pending',
      due_date: dueIso,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, message: error?.message ?? 'insert failed' }
  return { ok: true, message: `task ${data.id} created`, data: { taskId: data.id } }
}

function readPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  let cur: unknown = obj
  for (const p of path.split('.')) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else return undefined
  }
  return cur
}
