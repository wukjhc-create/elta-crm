/**
 * Tilbageringning fra opkaldskortet. Bruger den eksisterende kundeopgave.
 * Kø-markeringen er assistant_callback. reminder_at er altid null, så
 * Telegram-påmindelsen (findDueAssistantReminders) ikke ser opgaven.
 * Flere åbne sager vælges ikke automatisk.
 */
import { ASSISTANT_RULE } from '@/lib/assistant/rules'

export interface CallbackCaseChoice {
  id: string
  customer_id: string
  case_number: string | null
  title: string
}

export interface PlannedCallback {
  customer_id: string
  title: string
  description: string
  priority: 'high'
  due_date: string
  reminder_at: null
  service_case_id: string | null
  callbackQueue: true
  auto_rule: typeof ASSISTANT_RULE.callback
}

export function callbackQueueWrite(
  callbackQueue: boolean,
  reminderAt: string | null | undefined,
): { auto_rule?: string; reminder_at: string | null } {
  if (callbackQueue) return { auto_rule: ASSISTANT_RULE.callback, reminder_at: null }
  return { reminder_at: reminderAt || null }
}

export function planCallbackInsert(input: {
  customerId: string | null
  displayNumber: string | null
  customerLabel: string | null
  openCases: CallbackCaseChoice[]
  selectedCaseId: string | null
  dueAtIso: string
}): { ok: true; task: PlannedCallback } | { ok: false; reason: string } {
  if (!input.customerId || !input.displayNumber) {
    return { ok: false, reason: 'Vælg én kunde, før du opretter tilbageringningen. Intet er oprettet.' }
  }
  const cases = input.openCases.filter((c) => c.customer_id === input.customerId)
  let serviceCaseId: string | null = null
  if (cases.length > 1) {
    const chosen = cases.find((c) => c.id === input.selectedCaseId)
    if (!chosen) {
      return { ok: false, reason: 'Kunden har flere åbne sager. Vælg hvilken sag opkaldet hører til. Intet er oprettet.' }
    }
    serviceCaseId = chosen.id
  } else if (cases.length === 1) {
    serviceCaseId = cases[0].id
  }
  const chosen = cases.find((c) => c.id === serviceCaseId)
  const caseBit = chosen ? ` Sag: ${[chosen.case_number, chosen.title].filter(Boolean).join(' ')}.` : ''
  return {
    ok: true,
    task: {
      customer_id: input.customerId,
      title: `Ring tilbage: ${input.customerLabel ?? 'kunde'}`,
      description: `Opkaldskort ${input.displayNumber}.${caseBit} Tildelt den indloggede medarbejder. Ingen Telegram-påmindelse.`,
      priority: 'high',
      due_date: input.dueAtIso,
      reminder_at: null,
      service_case_id: serviceCaseId,
      callbackQueue: true,
      auto_rule: ASSISTANT_RULE.callback,
    },
  }
}
