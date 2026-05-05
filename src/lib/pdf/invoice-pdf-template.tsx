import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import { formatCurrency, formatDateLongDK } from '@/lib/utils/format'
import type { CompanySettings } from '@/types/company-settings.types'
import type { InvoicePdfPayload, InvoiceLineRow } from '@/types/invoice.types'

const BRAND = '#2D8A2D'
const BRAND_LIGHT = '#E6F4E6'
const TEXT = '#333'
const MUTED = '#666'

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: TEXT,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
    borderBottom: `2 solid ${BRAND}`,
    paddingBottom: 14,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: BRAND,
    marginBottom: 4,
  },
  invoiceNumberLabel: {
    fontSize: 10,
    color: MUTED,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TEXT,
  },
  companyName: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  companyLine: { fontSize: 9, color: MUTED, marginBottom: 1 },

  metaRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  metaCol: { flex: 1 },
  metaCol2: { flex: 1, alignItems: 'flex-end' },
  metaLabel: { fontSize: 9, color: MUTED, marginBottom: 2 },
  metaValue: { fontSize: 11, marginBottom: 6 },

  customerBox: {
    backgroundColor: BRAND_LIGHT,
    padding: 12,
    borderRadius: 4,
    marginBottom: 18,
  },
  customerLabel: { fontSize: 9, color: MUTED, marginBottom: 4 },
  customerName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  customerLine: { fontSize: 10, marginBottom: 1 },

  caseStrip: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderLeft: `3 solid ${BRAND}`,
    padding: 8,
    marginBottom: 18,
  },
  caseLabel: { fontSize: 9, color: MUTED, marginRight: 8 },
  caseValue: { fontSize: 10, fontWeight: 'bold' },

  table: { marginBottom: 12 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BRAND,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottom: '1 solid #EEE',
  },
  tableCell: { fontSize: 10, color: TEXT },

  colPos:   { width: '6%' },
  colDesc:  { width: '46%', paddingRight: 6 },
  colQty:   { width: '10%', textAlign: 'right' },
  colUnit:  { width: '8%' },
  colPrice: { width: '14%', textAlign: 'right' },
  colTotal: { width: '16%', textAlign: 'right' },

  totalsBlock: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  totalsTable: { width: 240 },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottom: '1 solid #EEE',
  },
  totalsLabel: { fontSize: 10, color: TEXT },
  totalsValue: { fontSize: 10, color: TEXT },
  totalsFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: BRAND,
    marginTop: 4,
  },
  totalsFinalLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  totalsFinalValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
  },

  paymentBlock: {
    marginTop: 22,
    padding: 12,
    border: '1 solid #DDD',
    borderRadius: 4,
  },
  paymentTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
    color: BRAND,
  },
  paymentLine: { fontSize: 9, color: TEXT, marginBottom: 1 },
  paymentMissing: { fontSize: 9, color: '#A04040', fontStyle: 'italic' },

  notesBlock: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#FAFAFA',
    borderRadius: 3,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
    color: TEXT,
  },
  notesText: { fontSize: 9, color: TEXT, lineHeight: 1.4 },

  footer: {
    position: 'absolute',
    left: 36,
    right: 36,
    bottom: 24,
    fontSize: 8,
    color: MUTED,
    textAlign: 'center',
    borderTop: '1 solid #DDD',
    paddingTop: 8,
  },

  draftWatermark: {
    position: 'absolute',
    top: 200,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 80,
    color: 'rgba(220, 100, 100, 0.18)',
    fontWeight: 'bold',
    transform: 'rotate(-25deg)',
  },
})

interface Props {
  payload: InvoicePdfPayload
  companySettings: CompanySettings
}

export function InvoicePdfDocument({ payload, companySettings: cs }: Props) {
  const { invoice, lines, customer, totals } = payload
  const sag = payload.case ?? null
  const currency = invoice.currency || 'DKK'

  const fmt = (n: number) => formatCurrency(n, currency, 2)

  const subtotal = totals?.subtotal ?? Number(invoice.total_amount) ?? 0
  const vatRate = totals?.vat_rate ?? 25
  const vat = totals?.vat ?? Number(invoice.tax_amount) ?? 0
  const final = totals?.final ?? Number(invoice.final_amount) ?? 0

  const isDraft = invoice.status === 'draft'

  const bankRegNo = process.env.INVOICE_BANK_REG_NO || null
  const bankAccount = process.env.INVOICE_BANK_ACCOUNT || null
  const paymentReference = invoice.payment_reference || invoice.invoice_number

  return (
    <Document
      title={`Faktura ${invoice.invoice_number}`}
      author={cs.company_name || 'Elta Solar'}
    >
      <Page size="A4" style={styles.page}>
        {isDraft && <Text style={styles.draftWatermark}>KLADDE</Text>}

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>FAKTURA</Text>
            <Text style={styles.invoiceNumberLabel}>Faktura nr.</Text>
            <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.companyName}>{cs.company_name || 'Elta Solar'}</Text>
            {cs.company_address && <Text style={styles.companyLine}>{cs.company_address}</Text>}
            {(cs.company_postal_code || cs.company_city) && (
              <Text style={styles.companyLine}>
                {[cs.company_postal_code, cs.company_city].filter(Boolean).join(' ')}
              </Text>
            )}
            {cs.company_vat_number && (
              <Text style={styles.companyLine}>CVR: {cs.company_vat_number}</Text>
            )}
            {cs.company_phone && <Text style={styles.companyLine}>Tlf: {cs.company_phone}</Text>}
            {cs.company_email && <Text style={styles.companyLine}>{cs.company_email}</Text>}
          </View>
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Fakturadato</Text>
            <Text style={styles.metaValue}>
              {invoice.created_at ? formatDateLongDK(invoice.created_at) : '—'}
            </Text>
          </View>
          <View style={styles.metaCol2}>
            <Text style={styles.metaLabel}>Forfaldsdato</Text>
            <Text style={styles.metaValue}>
              {invoice.due_date ? formatDateLongDK(invoice.due_date) : '—'}
            </Text>
          </View>
        </View>

        {/* Customer */}
        <View style={styles.customerBox}>
          <Text style={styles.customerLabel}>Faktureres til</Text>
          {customer ? (
            <>
              <Text style={styles.customerName}>{customer.name || '—'}</Text>
              {customer.address && <Text style={styles.customerLine}>{customer.address}</Text>}
              {(customer.zip || customer.city) && (
                <Text style={styles.customerLine}>
                  {[customer.zip, customer.city].filter(Boolean).join(' ')}
                </Text>
              )}
              {customer.cvr && <Text style={styles.customerLine}>CVR: {customer.cvr}</Text>}
              {customer.email && <Text style={styles.customerLine}>{customer.email}</Text>}
            </>
          ) : (
            <Text style={styles.customerLine}>Ingen kunde-oplysninger.</Text>
          )}
        </View>

        {/* Sag-strip */}
        {sag && (
          <View style={styles.caseStrip}>
            <Text style={styles.caseLabel}>Sag:</Text>
            <Text style={styles.caseValue}>{sag.case_number}</Text>
            {(sag.project_name || sag.title) && (
              <>
                <Text style={[styles.caseLabel, { marginLeft: 12 }]}>·</Text>
                <Text style={styles.caseValue}>{sag.project_name || sag.title}</Text>
              </>
            )}
          </View>
        )}

        {/* Lines table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colPos]}>#</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Beskrivelse</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Antal</Text>
            <Text style={[styles.tableHeaderCell, styles.colUnit]}>Enhed</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Stk-pris</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
          </View>
          {lines.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { textAlign: 'center', width: '100%', color: MUTED }]}>
                Ingen linjer
              </Text>
            </View>
          ) : (
            lines.map((l: InvoiceLineRow) => (
              <View key={l.id} style={styles.tableRow} wrap={false}>
                <Text style={[styles.tableCell, styles.colPos]}>{l.position}</Text>
                <Text style={[styles.tableCell, styles.colDesc]}>{l.description}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>
                  {Number(l.quantity).toLocaleString('da-DK', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
                <Text style={[styles.tableCell, styles.colUnit]}>{l.unit ?? '—'}</Text>
                <Text style={[styles.tableCell, styles.colPrice]}>
                  {fmt(Number(l.unit_price))}
                </Text>
                <Text style={[styles.tableCell, styles.colTotal]}>
                  {fmt(Number(l.total_price))}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsTable}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal (ekskl. moms)</Text>
              <Text style={styles.totalsValue}>{fmt(subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Moms ({vatRate} %)</Text>
              <Text style={styles.totalsValue}>{fmt(vat)}</Text>
            </View>
            <View style={styles.totalsFinal}>
              <Text style={styles.totalsFinalLabel}>Total inkl. moms</Text>
              <Text style={styles.totalsFinalValue}>{fmt(final)}</Text>
            </View>
          </View>
        </View>

        {/* Payment block */}
        <View style={styles.paymentBlock}>
          <Text style={styles.paymentTitle}>Betalingsoplysninger</Text>
          {bankRegNo && bankAccount ? (
            <>
              <Text style={styles.paymentLine}>
                Bank: Reg.nr. {bankRegNo} — Konto {bankAccount}
              </Text>
              <Text style={styles.paymentLine}>Beløb: {fmt(final)}</Text>
              <Text style={styles.paymentLine}>
                Betalingsreference: {paymentReference}
              </Text>
              <Text style={styles.paymentLine}>
                Forfaldsdato:{' '}
                {invoice.due_date ? formatDateLongDK(invoice.due_date) : '—'}
              </Text>
            </>
          ) : (
            <Text style={styles.paymentMissing}>
              Bankoplysninger er ikke konfigureret. Kontakt {cs.company_email || 'Elta Solar'} for
              betalingsinstruktion. (Ref: {paymentReference})
            </Text>
          )}
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notesBlock}>
            <Text style={styles.notesTitle}>Note</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer} fixed>
          {cs.company_name || 'Elta Solar'}
          {cs.company_vat_number ? ` · CVR ${cs.company_vat_number}` : ''}
          {cs.company_email ? ` · ${cs.company_email}` : ''}
          {cs.company_phone ? ` · ${cs.company_phone}` : ''}
        </Text>
      </Page>
    </Document>
  )
}
