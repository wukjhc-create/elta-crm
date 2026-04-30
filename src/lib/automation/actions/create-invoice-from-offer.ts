import type { ActionContext, ActionResult } from '@/types/automation.types'

export async function runCreateInvoiceFromOffer(ctx: ActionContext): Promise<ActionResult> {
  const offerId = String(ctx.event.entityId)
  if (ctx.event.globalDryRun || ctx.rule.dry_run) {
    return { ok: true, message: 'dry_run', data: { offerId } }
  }
  const dueDays = Number(ctx.rule.action_config?.due_days ?? 14)
  const { createAndSendInvoiceFromOffer } = await import('@/lib/services/invoices')
  const { invoiceId, emailResult } = await createAndSendInvoiceFromOffer(offerId, { dueDays })
  return {
    ok: true,
    message: `invoice ${invoiceId} created (email: ${emailResult.status})`,
    data: { invoiceId, emailStatus: emailResult.status },
  }
}
