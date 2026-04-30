import type { ActionContext, ActionResult } from '@/types/automation.types'

export async function runSendReminder(ctx: ActionContext): Promise<ActionResult> {
  const invoiceId = String(ctx.event.entityId)
  if (ctx.event.globalDryRun || ctx.rule.dry_run) {
    return { ok: true, message: 'dry_run', data: { invoiceId } }
  }
  const { sendInvoiceReminder } = await import('@/lib/services/invoices')
  const result = await sendInvoiceReminder(invoiceId)
  return {
    ok: result.status !== 'failed',
    message: `reminder ${result.status}${result.level ? ` level ${result.level}` : ''}`,
    data: result as unknown as Record<string, unknown>,
  }
}
