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

  // Sprint 6F-4 — ANNULLERET watermark (lidt mørkere og mere mættet end KLADDE)
  voidedWatermark: {
    position: 'absolute',
    top: 240,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 90,
    color: 'rgba(160, 64, 64, 0.22)',
    fontWeight: 'bold',
    transform: 'rotate(-22deg)',
  },

  // Sprint 6F-4 — Annulleret-banner i toppen af original-PDF
  voidedBanner: {
    backgroundColor: '#F5DCDC',
    border: '1 solid #A04040',
    padding: 8,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  voidedBannerText: {
    fontSize: 11,
    color: '#7A2E2E',
    fontWeight: 'bold',
  },

  // Sprint 6F-4 — Kreditnota-info-strip (hvilken faktura krediteres)
  creditOfStrip: {
    flexDirection: 'row',
    backgroundColor: '#FFF4F4',
    borderLeft: '3 solid #A04040',
    padding: 8,
    marginBottom: 18,
  },
  creditOfLabel: { fontSize: 9, color: MUTED, marginRight: 8 },
  creditOfValue: { fontSize: 10, fontWeight: 'bold', color: '#A04040' },

  // Sprint 6F-4 — Kreditnota refund-blok (erstatter Betalingsoplysninger)
  creditNotePayment: {
    marginTop: 22,
    padding: 12,
    border: '1 solid #DDD',
    backgroundColor: '#FAF5F5',
    borderRadius: 4,
  },
  creditNotePaymentTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#A04040',
  },
  creditNotePaymentText: { fontSize: 9, color: TEXT, lineHeight: 1.5 },

  // Sprint 6D-4 — stage pille + procent-strip
  stagePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 4,
    color: '#FFF',
    alignSelf: 'flex-start',
  },
  pctStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderLeft: '3 solid #C7A02A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
  },
  pctStripLabel: { fontSize: 9, color: MUTED, marginRight: 6 },
  pctStripValue: { fontSize: 11, fontWeight: 'bold' },

  predHeading: {
    fontSize: 11,
    fontWeight: 'bold',
    color: BRAND,
    marginTop: 16,
    marginBottom: 6,
  },
  predRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottom: '1 solid #EEE',
  },
  predHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  predHeaderCell: {
    fontSize: 8,
    color: MUTED,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  predCell: { fontSize: 9, color: TEXT },
  predNumberCol: { width: '22%' },
  predTypeCol:   { width: '18%' },
  predLabelCol:  { width: '32%' },
  predStatusCol: { width: '12%' },
  predAmtCol:    { width: '16%', textAlign: 'right' },

  predTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: BRAND_LIGHT,
    marginTop: 4,
  },
  predTotalLabel: { fontSize: 10, fontWeight: 'bold', color: TEXT },
  predTotalValue: { fontSize: 11, fontWeight: 'bold', color: '#A04040' },
})

const STAGE_PILL_LABEL: Record<string, { label: string; color: string }> = {
  deposit:  { label: 'FORSKUD',     color: '#1F66B0' },
  progress: { label: 'RATE',        color: '#7E3FBF' },
  final:    { label: 'SLUTFAKTURA', color: '#C26528' },
  credit:   { label: 'KREDITNOTA',  color: '#A04040' },
  standard: { label: '',            color: '' },
}

const PRED_TYPE_LABEL: Record<string, string> = {
  deposit:  'Forskud',
  progress: 'Rate',
  standard: 'Faktura',
  final:    'Slutfaktura',
  credit:   'Kreditnota',
}

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

  // Sprint 6F-4 — credit-note + voided detection
  const isCreditNote = invoice.invoice_type === 'credit'
  const isVoided = !!invoice.voided_at
  const creditOfNumber = payload.credit_of_invoice_number ?? null

  // Sprint 6D-4 — stage info
  const invType = (invoice.invoice_type ?? 'standard') as keyof typeof STAGE_PILL_LABEL
  const stagePill = STAGE_PILL_LABEL[invType]
  const showStagePill = invType !== 'standard' && !!stagePill?.label
  const stageLabel = invoice.stage_label ?? null
  const billingPct = invoice.billing_percentage == null ? null : Number(invoice.billing_percentage)
  const basisValue = invoice.amount_basis_value == null ? null : Number(invoice.amount_basis_value)
  const basisLabel =
    invoice.amount_basis === 'contract_sum'
      ? 'kontraktsum'
      : invoice.amount_basis === 'revised_sum'
      ? 'revideret beløb'
      : null
  const showPctStrip = billingPct != null && basisValue != null && basisLabel != null

  const predecessors = payload.predecessors ?? []
  const showPredecessorsSection =
    invoice.is_final_invoice === true && predecessors.length > 0
  const deductionTotal = predecessors.reduce(
    (s, p) => s + Number(p.deduction_amount),
    0
  )

  const bankRegNo = process.env.INVOICE_BANK_REG_NO || null
  const bankAccount = process.env.INVOICE_BANK_ACCOUNT || null
  const paymentReference = invoice.payment_reference || invoice.invoice_number

  return (
    <Document
      title={`${isCreditNote ? 'Kreditnota' : 'Faktura'} ${invoice.invoice_number}`}
      author={cs.company_name || 'Elta Solar'}
    >
      <Page size="A4" style={styles.page}>
        {isDraft && <Text style={styles.draftWatermark}>KLADDE</Text>}
        {/* Sprint 6F-4 — ANNULLERET watermark dækker hele siden hvis original
            er annulleret via en sendt/betalt kreditnota. Vises ikke på selve
            kreditnotaen — kun på den krediterede faktura. */}
        {isVoided && !isCreditNote && (
          <Text style={styles.voidedWatermark} fixed>
            ANNULLERET
          </Text>
        )}

        {/* Sprint 6F-4 — top-banner på annulleret original. */}
        {isVoided && !isCreditNote && (
          <View style={styles.voidedBanner}>
            <Text style={styles.voidedBannerText}>
              Fakturaen er annulleret via kreditnota.
            </Text>
          </View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text
              style={isCreditNote ? [styles.brandTitle, { color: '#A04040' }] : styles.brandTitle}
            >
              {isCreditNote
                ? 'KREDITNOTA'
                : `FAKTURA${stageLabel ? ` — ${stageLabel}` : ''}`}
            </Text>
            {showStagePill && (
              <Text
                style={[styles.stagePill, { backgroundColor: stagePill.color }]}
              >
                {stagePill.label}
              </Text>
            )}
            <Text style={[styles.invoiceNumberLabel, { marginTop: 6 }]}>
              {isCreditNote ? 'Kreditnota nr.' : 'Faktura nr.'}
            </Text>
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

        {/* Sprint 6F-4 — "Kreditnota for faktura X"-strip vises kun på
            kreditnotaer hvor original-fakturanummer er kendt. */}
        {isCreditNote && creditOfNumber && (
          <View style={styles.creditOfStrip}>
            <Text style={styles.creditOfLabel}>Kreditnota for faktura</Text>
            <Text style={styles.creditOfValue}>{creditOfNumber}</Text>
          </View>
        )}

        {/* Procent-strip — kun ved deposit / progress med basis */}
        {showPctStrip && (
          <View style={styles.pctStrip}>
            <Text style={styles.pctStripLabel}>Beregnes som</Text>
            <Text style={styles.pctStripValue}>
              {billingPct?.toLocaleString('da-DK', {
                minimumFractionDigits: billingPct % 1 === 0 ? 0 : 2,
                maximumFractionDigits: 2,
              })}{' '}
              % af {basisLabel} {fmt(basisValue!)}
            </Text>
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

        {/* Predecessor-sektion (kun ved final med forgængere) */}
        {showPredecessorsSection && (
          <View>
            <Text style={styles.predHeading}>Tidligere fakturaer fratrukket</Text>
            <View style={styles.predHeaderRow}>
              <Text style={[styles.predHeaderCell, styles.predNumberCol]}>Faktura nr.</Text>
              <Text style={[styles.predHeaderCell, styles.predTypeCol]}>Type</Text>
              <Text style={[styles.predHeaderCell, styles.predLabelCol]}>Label</Text>
              <Text style={[styles.predHeaderCell, styles.predStatusCol]}>Status</Text>
              <Text style={[styles.predHeaderCell, styles.predAmtCol]}>Fradrag</Text>
            </View>
            {predecessors.map((p) => (
              <View key={p.predecessor_invoice_id} style={styles.predRow} wrap={false}>
                <Text style={[styles.predCell, styles.predNumberCol]}>
                  {p.predecessor_invoice_number}
                </Text>
                <Text style={[styles.predCell, styles.predTypeCol]}>
                  {PRED_TYPE_LABEL[p.predecessor_invoice_type] ?? p.predecessor_invoice_type}
                </Text>
                <Text style={[styles.predCell, styles.predLabelCol]}>
                  {p.predecessor_stage_label ?? '—'}
                </Text>
                <Text style={[styles.predCell, styles.predStatusCol]}>
                  {p.predecessor_status}
                </Text>
                <Text style={[styles.predCell, styles.predAmtCol]}>
                  -{fmt(Number(p.deduction_amount))}
                </Text>
              </View>
            ))}
            <View style={styles.predTotalRow}>
              <Text style={styles.predTotalLabel}>Total fradrag (ekskl. moms)</Text>
              <Text style={styles.predTotalValue}>-{fmt(deductionTotal)}</Text>
            </View>
          </View>
        )}

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

        {/* Payment block — Sprint 6F-4: kreditnota viser refund-info,
            ikke "betal til reg.nr/konto"-felt. */}
        {isCreditNote ? (
          <View style={styles.creditNotePayment}>
            <Text style={styles.creditNotePaymentTitle}>Refundering</Text>
            <Text style={styles.creditNotePaymentText}>
              Kreditnotaen reducerer/udligner tidligere faktura. Eventuel
              refundering håndteres separat.
            </Text>
          </View>
        ) : (
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
        )}

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
