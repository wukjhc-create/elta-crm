import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

/**
 * Sprint Ø5.2 — Ledelsesvenligt PDF-overblik over betalingsopfølgning.
 *
 * Genbruger projektets @react-pdf/renderer-mønster. Datakilde er Ø4.9-
 * viewet (samme cost-free rækker som CSV'en). KUN salgs/faktura-beløb +
 * kundenavn — INGEN kost/margin/DB/medarbejderkost.
 */

const BRAND = '#1f9d55'
const TEXT = '#222'
const MUTED = '#666'
const LINE = '#e2e8f0'

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 10, color: TEXT },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottom: `2 solid ${BRAND}`, paddingBottom: 12, marginBottom: 18,
  },
  brand: { fontSize: 20, fontWeight: 'bold', color: BRAND },
  subtitle: { fontSize: 11, color: TEXT, marginTop: 2 },
  brandContact: { fontSize: 8, color: MUTED, marginTop: 3 },
  metaRight: { textAlign: 'right' },
  metaLabel: { fontSize: 9, color: MUTED },
  metaValue: { fontSize: 11, fontWeight: 'bold' },
  cards: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  card: { flex: 1, border: `1 solid ${LINE}`, borderRadius: 4, padding: 10 },
  cardLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase' },
  cardValue: { fontSize: 13, fontWeight: 'bold', marginTop: 3 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: TEXT, marginBottom: 6, marginTop: 8 },
  table: { border: `1 solid ${LINE}`, borderRadius: 4, marginBottom: 14 },
  tr: { flexDirection: 'row', borderBottom: `1 solid ${LINE}` },
  trHead: { backgroundColor: '#f1f5f9' },
  th: { fontSize: 8, color: MUTED, padding: 5, fontWeight: 'bold' },
  td: { fontSize: 9, padding: 5, color: TEXT },
  cName: { flex: 3 },
  cBehavior: { flex: 2 },
  cNum: { flex: 1.4, textAlign: 'right' },
  empty: { fontSize: 9, color: MUTED, padding: 8 },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 8, color: MUTED, textAlign: 'center' },
})

export interface PaymentReportTopRow {
  name: string
  outstanding: number
  overdue: number
  overdue_count: number
  payment_label: string
}

export interface PaymentReportPdfPayload {
  reportDate: string
  filterLabel: string
  customerCount: number
  outstandingTotal: number
  overdueTotal: number
  overdueCustomers: number
  topByOverdue: PaymentReportTopRow[]
  topByOutstanding: PaymentReportTopRow[]
  /** Sprint Ø5.3 — firmabranding (tekst-header, sikker fallback). */
  companyName?: string | null
  companyEmail?: string | null
  companyPhone?: string | null
  companyVat?: string | null
}

function kr(n: number): string {
  return n.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' kr.'
}

function TopTable({ rows, valueKey }: { rows: PaymentReportTopRow[]; valueKey: 'overdue' | 'outstanding' }) {
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.trHead]}>
        <Text style={[styles.th, styles.cName]}>Kunde</Text>
        <Text style={[styles.th, styles.cBehavior]}>Betalingsadfærd</Text>
        <Text style={[styles.th, styles.cNum]}>Forfalden</Text>
        <Text style={[styles.th, styles.cNum]}>Udestående</Text>
      </View>
      {rows.length === 0 ? (
        <Text style={styles.empty}>Ingen kunder.</Text>
      ) : (
        rows.map((r, i) => (
          <View key={i} style={[styles.tr, i === rows.length - 1 ? { borderBottom: 'none' } : {}]}>
            <Text style={[styles.td, styles.cName]}>{r.name}</Text>
            <Text style={[styles.td, styles.cBehavior]}>{r.payment_label}</Text>
            <Text style={[styles.td, styles.cNum, valueKey === 'overdue' ? { fontWeight: 'bold' } : {}]}>{kr(r.overdue)}</Text>
            <Text style={[styles.td, styles.cNum, valueKey === 'outstanding' ? { fontWeight: 'bold' } : {}]}>{kr(r.outstanding)}</Text>
          </View>
        ))
      )}
    </View>
  )
}

export function PaymentReportPdfDocument({ payload: p }: { payload: PaymentReportPdfPayload }) {
  const companyName = p.companyName || 'ELTA Drift'
  const contactLine = [p.companyEmail, p.companyPhone].filter(Boolean).join(' · ')
  return (
    <Document title={`Betalingsopfølgning ${p.reportDate}`} author={companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{companyName}</Text>
            <Text style={styles.subtitle}>Betalingsopfølgning</Text>
            {contactLine ? <Text style={styles.brandContact}>{contactLine}</Text> : null}
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaLabel}>Rapportdato</Text>
            <Text style={styles.metaValue}>{p.reportDate}</Text>
            <Text style={[styles.metaLabel, { marginTop: 4 }]}>Udvalg: {p.filterLabel}</Text>
            {p.companyVat ? <Text style={[styles.metaLabel, { marginTop: 4 }]}>CVR {p.companyVat}</Text> : null}
          </View>
        </View>

        <View style={styles.cards}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Kunder på listen</Text>
            <Text style={styles.cardValue}>{p.customerCount}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Med forfaldne</Text>
            <Text style={[styles.cardValue, { color: '#b91c1c' }]}>{p.overdueCustomers}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Udestående i alt</Text>
            <Text style={styles.cardValue}>{kr(p.outstandingTotal)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Forfalden total</Text>
            <Text style={[styles.cardValue, { color: '#b91c1c' }]}>{kr(p.overdueTotal)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Top 10 — forfalden total</Text>
        <TopTable rows={p.topByOverdue} valueKey="overdue" />

        <Text style={styles.sectionTitle}>Top 10 — udestående total</Text>
        <TopTable rows={p.topByOutstanding} valueKey="outstanding" />

        <Text style={styles.footer} fixed>
          Automatisk betalingsrapport fra {companyName} · beløb er fakturabeløb inkl. moms · ingen interne tal
        </Text>
      </Page>
    </Document>
  )
}
