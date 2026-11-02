'use server'

/**
 * Bekræftede handlinger fra mailkortet. Kalder de eksisterende CRM-funktioner.
 * Uden confirmed: true skrives intet. Der oprettes ikke kunde, sag, fuldmagt eller status.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createCustomerNote } from '@/lib/actions/customer-notes'
import { createCustomerTask } from '@/lib/actions/customer-tasks'
import { linkEmailToCase, linkEmailToCustomer } from '@/lib/actions/incoming-emails'
import { userCanViewCustomer } from '@/lib/auth/customer-scope'
import { permissionDeniedText } from '@/lib/auth/permission-text'
import {
  looksLikePowerOfAttorney,
  mailLinkStep,
  mailNoteText,
  mailTaskTitle,
  planMailCardCommand,
  type MailCardCommand,
} from '@/lib/mail/action-card-execute'

export interface MailCardActionResult {
  success: boolean
  wrote: boolean
  message: string
}

const UUID = /^[0-9a-f-]{36}$/i

function done(success: boolean, wrote: boolean, message: string): MailCardActionResult {
  return { success, wrote, message }
}

export async function confirmMailCardAction(input: {
  confirmed: boolean
  command: MailCardCommand
  emailId: string
  customerId: string | null
  caseId: string | null
}): Promise<MailCardActionResult> {
  const ctx = await getAuthenticatedClientWithRole()
  const needsInbox = input.command === 'attach_mail'
  if (needsInbox && !ctx.hasPermission('inbox.view')) return done(false, false, permissionDeniedText('inbox.view'))
  if (!needsInbox && !ctx.hasPermission('customers.view')) return done(false, false, permissionDeniedText('customers.view'))

  if (!input.confirmed) return done(false, false, planMailCardCommand({ ...input, emailCustomerId: null }).reason)
  if (!UUID.test(input.emailId)) return done(false, false, 'Ugyldig mail')
  if (input.customerId && !UUID.test(input.customerId)) return done(false, false, 'Ugyldig kunde')
  if (input.caseId && !UUID.test(input.caseId)) return done(false, false, 'Ugyldig sag')

  const { data, error } = await ctx.supabase
    .from('incoming_emails')
    .select('id, customer_id, subject, attachment_urls')
    .eq('id', input.emailId)
    .maybeSingle()
  if (error) return done(false, false, 'Mailen kunne ikke læses. Intet er ændret.')
  if (!data) return done(false, false, 'Mailen blev ikke fundet. Intet er ændret.')

  const email = data as { id: string; customer_id: string | null; subject: string | null; attachment_urls: Array<{ filename?: string | null }> | null }
  const plan = planMailCardCommand({
    confirmed: true,
    command: input.command,
    customerId: input.customerId,
    caseId: input.caseId,
    emailCustomerId: email.customer_id,
  })
  if (!plan.execute) return done(false, false, plan.reason)
  if (!input.customerId) return done(false, false, 'Der er ikke valgt én kunde. Intet er ændret.')
  if (!(await userCanViewCustomer(input.customerId, ctx))) return done(false, false, 'Du har ikke adgang til kunden. Intet er ændret.')

  const filenames = (email.attachment_urls ?? []).map((a) => a.filename ?? '').filter(Boolean)
  if (plan.kind === 'note') {
    const note = await createCustomerNote(input.customerId, mailNoteText(email.subject, filenames))
    return note.success
      ? done(true, true, 'Noten er gemt på kunden.')
      : done(false, false, note.error ?? 'Noten blev ikke gemt.')
  }
  if (plan.kind === 'task') {
    const task = await createCustomerTask({
      customer_id: input.customerId,
      service_case_id: input.caseId ?? undefined,
      title: mailTaskTitle(email.subject, looksLikePowerOfAttorney(email.subject, filenames)),
      description: `Oprettet fra mailkortet efter bekræftelse. Emne: ${(email.subject ?? '').trim().slice(0, 180) || 'uden emne'}.`,
      priority: 'normal',
    })
    return task.success
      ? done(true, true, 'Opgaven er oprettet.')
      : done(false, false, task.error ?? 'Opgaven blev ikke oprettet.')
  }

  const step = mailLinkStep(email.customer_id, input.customerId)
  if (step === 'other_customer') return done(false, false, 'Mailen hører til en anden kunde. Intet er ændret.')
  if (step === 'link_customer') {
    const linked = await linkEmailToCustomer(input.emailId, input.customerId)
    if (!linked.success) return done(false, false, linked.error ?? 'Mailen blev ikke koblet til kunden.')
  }
  const { data: again, error: againErr } = await ctx.supabase
    .from('incoming_emails')
    .select('service_case_id')
    .eq('id', input.emailId)
    .maybeSingle()
  if (againErr) return done(false, false, 'Sags-koblingen kunne ikke læses. Prøv igen.')
  if ((again as { service_case_id: string | null } | null)?.service_case_id === input.caseId) {
    return done(true, step === 'link_customer', step === 'link_customer' ? 'Mailen er koblet til kunden og var allerede på sagen.' : 'Mailen er allerede knyttet til sagen.')
  }
  const linkedCase = await linkEmailToCase(input.emailId, input.caseId)
  return linkedCase.success
    ? done(true, true, 'Mailen er knyttet til sagen.')
    : done(false, false, linkedCase.error ?? 'Mailen blev ikke knyttet til sagen.')
}
