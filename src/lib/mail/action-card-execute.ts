/**
 * Hvad et bekræftet mailkort må gøre. Ren funktion.
 * Fuldmagt, status og ny sag udføres ikke: filnavnet er ikke dokumentets indhold.
 */
import { classifyDocumentLabel } from '@/lib/documents/classify-label'

export type MailCardCommand =
  | 'attach_mail'
  | 'create_task'
  | 'add_note'
  | 'save_attachment'
  | 'change_status'
  | 'create_case'
  | 'do_nothing'

export type MailLinkStep = 'link_customer' | 'same_customer' | 'other_customer'

export function mailLinkStep(emailCustomerId: string | null, customerId: string): MailLinkStep {
  if (!emailCustomerId) return 'link_customer'
  return emailCustomerId === customerId ? 'same_customer' : 'other_customer'
}

export function looksLikePowerOfAttorney(subject: string | null, filenames: string[]): boolean {
  if (classifyDocumentLabel({ subject }).kind === 'power_of_attorney') return true
  return filenames.some((filename) => classifyDocumentLabel({ filename }).kind === 'power_of_attorney')
}

export function mailTaskTitle(subject: string | null, powerOfAttorney: boolean): string {
  const label = (subject ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || 'uden emne'
  return powerOfAttorney ? `Gennemgå fuldmagt: ${label}` : `Gennemgå mail: ${label}`
}

export function mailNoteText(subject: string | null, filenames: string[]): string {
  const label = (subject ?? '').trim().replace(/\s+/g, ' ').slice(0, 180) || 'uden emne'
  if (looksLikePowerOfAttorney(subject, filenames)) {
    return `Mailkort: «${label}». Et filnavn eller emnet ligner en fuldmagt. Indholdet er ikke læst, og der er ikke oprettet en fuldmagt.`
  }
  return `Mailkort: «${label}».`
}

export function planMailCardCommand(input: {
  confirmed: boolean
  command: MailCardCommand
  customerId: string | null
  caseId: string | null
  emailCustomerId: string | null
}): { execute: false; reason: string } | { execute: true; kind: 'link' | 'task' | 'note'; reason: string } {
  if (!input.confirmed) return { execute: false, reason: 'Bekræft handlingen, før noget ændres.' }
  if (input.command === 'save_attachment') {
    return { execute: false, reason: 'Filnavnet gør ikke vedhæftningen til en fuldmagt. Opret fuldmagten på sagen, når dokumentet er gennemgået.' }
  }
  if (input.command === 'change_status') return { execute: false, reason: 'Status ændres ikke herfra.' }
  if (input.command === 'create_case') return { execute: false, reason: 'Mailen opretter ikke en sag.' }
  if (input.command === 'do_nothing') return { execute: false, reason: 'Intet er ændret.' }
  if (!input.customerId) return { execute: false, reason: 'Der er ikke valgt én kunde. Intet er ændret.' }
  if (input.command === 'attach_mail') {
    if (!input.caseId) return { execute: false, reason: 'Der er ikke valgt én sag. Intet er ændret.' }
    if (mailLinkStep(input.emailCustomerId, input.customerId) === 'other_customer') {
      return { execute: false, reason: 'Mailen hører til en anden kunde. Intet er ændret.' }
    }
    return { execute: true, kind: 'link', reason: 'Knyt mailen til den valgte sag.' }
  }
  if (input.command === 'create_task') return { execute: true, kind: 'task', reason: 'Opret opgaven på kunden.' }
  if (input.command === 'add_note') return { execute: true, kind: 'note', reason: 'Gem noten på kunden.' }
  return { execute: false, reason: 'Handlingen udføres ikke herfra.' }
}
