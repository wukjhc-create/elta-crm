import type { IncomingInvoiceStatus } from '@/types/incoming-invoices.types'

/** Visningsnavn. Statusværdien i databasen ændres ikke. */
const LABELS: Record<IncomingInvoiceStatus, string> = {
  received: 'Modtaget',
  awaiting_approval: 'Afventer godkendelse',
  approved: 'Godkendt',
  rejected: 'Afvist',
  posted: 'Bogført',
  cancelled: 'Annulleret',
}

export function incomingInvoiceStatusLabel(status: string): string {
  return LABELS[status as IncomingInvoiceStatus] ?? status
}

/** Visningsnavn for læsningen. Værdien i databasen ændres ikke. */
const PARSE_LABELS: Record<string, string> = {
  pending: 'Afventer læsning',
  parsed: 'Læst',
  failed: 'Fejlede',
  manual: 'Manuel',
  needs_review: 'Kræver gennemgang',
}

export function incomingInvoiceParseStatusLabel(status: string): string {
  return PARSE_LABELS[status] ?? status
}

/** Visningsnavn for kilden. Værdien i databasen ændres ikke. */
const SOURCE_LABELS: Record<string, string> = {
  email: 'Mail',
  upload: 'Upload',
  manual: 'Manuel',
}

export function incomingInvoiceSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

/** Visningsnavn for revisionsloggen. Handlingskoden i databasen ændres ikke. */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  ingested: 'Indlæst',
  matched: 'Matchet',
  header_edited: 'Hoved rettet',
  posted: 'Bogført',
  error: 'Fejl',
  upgraded_from_attachment: 'Opgraderet fra bilag',
  file_attached: 'Fil vedhæftet',
  duplicate_detected: 'Dublet fundet',
  parsed: 'Læst',
  approved: 'Godkendt',
  rejected: 'Afvist',
}

export function incomingInvoiceAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}
