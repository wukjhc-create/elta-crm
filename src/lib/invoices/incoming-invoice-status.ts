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
