/**
 * Sprint Ø4.8/Ø5.0 — Delte CSV-kolonner for betalingsopfølgningslisten.
 *
 * Genbruges af både CSV-eksport-knappen (klient) og den planlagte
 * rapport-mail (server). Isomorft — kun pure csv-formattere.
 * KUN kontaktinfo + salgs/faktura-data — ingen kost/margin/DB.
 */

import type { PaymentExportRow } from '@/lib/actions/invoices'
import { csvCurrency, csvDate } from '@/lib/utils/csv-export'

export const PAYMENT_EXPORT_COLUMNS: Array<{
  header: string
  accessor: (r: PaymentExportRow) => string | number | null
}> = [
  { header: 'Kundenavn', accessor: (r) => r.customer_name },
  { header: 'Kontaktperson', accessor: (r) => r.contact_person },
  { header: 'Email', accessor: (r) => r.email },
  { header: 'Telefon', accessor: (r) => r.phone },
  { header: 'Status', accessor: (r) => (r.active === null ? '' : r.active ? 'Aktiv' : 'Inaktiv') },
  { header: 'Udestående i alt (DKK)', accessor: (r) => csvCurrency(r.outstanding_total) },
  { header: 'Forfalden total (DKK)', accessor: (r) => csvCurrency(r.overdue_total) },
  { header: 'Antal forfaldne fakturaer', accessor: (r) => r.overdue_count },
  { header: 'Betalingsadfærd', accessor: (r) => r.payment_label },
  { header: 'Gns. dage efter forfald', accessor: (r) => r.average_days_late ?? '' },
  { header: 'Seneste faktura', accessor: (r) => csvDate(r.last_invoice_at) },
  { header: 'Seneste betaling', accessor: (r) => csvDate(r.last_payment_at) },
  { header: 'Kunde-link', accessor: (r) => r.customer_url },
  { header: 'Fakturaoverblik-link', accessor: (r) => r.invoices_url },
]
