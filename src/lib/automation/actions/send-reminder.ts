import type { ActionContext, ActionResult } from '@/types/automation.types'

export async function runSendReminder(ctx: ActionContext): Promise<ActionResult> {
  const invoiceId = String(ctx.event.entityId)
  if (ctx.event.globalDryRun || ctx.rule.dry_run) {
    return { ok: true, message: 'dry_run', data: { invoiceId } }
  }
  // CR-2 (cron-review 2026-10-17): samme kontakt som rykker-cron'en — uden INVOICE_REMINDERS_LIVE=true intet sendt
  const { invoiceRemindersLive } = await import('@/lib/reminders/reminder-switches')
  if (!invoiceRemindersLive()) {
    return { ok: true, message: 'skipped: INVOICE_REMINDERS_LIVE er ikke true', data: { invoiceId, skipped: 'reminders_not_live' } }
  }
  const { sendInvoiceReminder } = await import('@/lib/services/invoices')
  const result = await sendInvoiceReminder(invoiceId)
  return {
    ok: result.status !== 'failed',
    message: `reminder ${result.status}${result.level ? ` level ${result.level}` : ''}`,
    data: result as unknown as Record<string, unknown>,
  }
}
