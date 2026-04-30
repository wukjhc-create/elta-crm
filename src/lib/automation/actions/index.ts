/**
 * Action registry. Every entry must be:
 *   - idempotent (or no-op on second run)
 *   - non-destructive (never delete / overwrite existing data)
 *   - safe under dry_run (returns ok=true without side effects)
 *
 * Adding a new action: implement an ActionHandler and register here.
 */
import type {
  ActionContext,
  ActionResult,
  AutomationAction,
} from '@/types/automation.types'
import { runCreateInvoiceFromOffer } from './create-invoice-from-offer'
import { runCreateInvoiceFromWorkOrder } from './create-invoice-from-work-order'
import { runSendEmail } from './send-email'
import { runCreateTask } from './create-task'
import { runSendReminder } from './send-reminder'
import { runNotify } from './notify'

export type ActionHandler = (ctx: ActionContext) => Promise<ActionResult>

export const ACTION_REGISTRY: Record<AutomationAction, ActionHandler> = {
  create_invoice_from_offer:      runCreateInvoiceFromOffer,
  create_invoice_from_work_order: runCreateInvoiceFromWorkOrder,
  send_email:                     runSendEmail,
  send_reminder:                  runSendReminder,
  create_task:                    runCreateTask,
  notify:                         runNotify,
}
