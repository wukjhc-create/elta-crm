import type { ActionContext, ActionResult } from '@/types/automation.types'

export async function runCreateInvoiceFromWorkOrder(ctx: ActionContext): Promise<ActionResult> {
  const woId = String(ctx.event.entityId)
  if (ctx.event.globalDryRun || ctx.rule.dry_run) {
    return { ok: true, message: 'dry_run', data: { workOrderId: woId } }
  }
  const dueDays = Number(ctx.rule.action_config?.due_days ?? 14)
  const { createInvoiceFromWorkOrder } = await import('@/lib/services/invoices')
  const invoiceId = await createInvoiceFromWorkOrder(woId, { dueDays })
  return { ok: true, message: `invoice ${invoiceId} created`, data: { invoiceId } }
}
