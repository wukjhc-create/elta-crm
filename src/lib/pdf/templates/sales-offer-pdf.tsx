import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import type { GenerateQuoteInput } from '@/types/quote-templates.types'
import type { CompanySettings } from '@/types/company-settings.types'
import { formatDateLongDK, formatCurrency } from '@/lib/utils/format'

Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'Helvetica' },
    { src: 'Helvetica-Bold', fontWeight: 'bold' },
  ],
})

const ACCENT = '#0066cc'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    borderBottom: `2 solid ${ACCENT}`,
    paddingBottom: 20,
  },
  headerLeft: { flex: 1 },
  headerRight: { textAlign: 'right' },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: ACCENT,
    marginBottom: 5,
  },
  quoteNumber: { fontSize: 12, color: '#666' },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 3,
  },
  companyDetails: { fontSize: 9, color: '#666', lineHeight: 1.4 },
  customerBox: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 4,
    marginBottom: 20,
  },
  customerLabel: { fontSize: 9, color: '#666', marginBottom: 5 },
  customerName: { fontSize: 14, fontWeight: 'bold', marginBottom: 3 },
  customerDetail: { fontSize: 10, color: '#444', marginBottom: 2 },
  solarBox: {
    backgroundColor: '#f0f7ff',
    padding: 15,
    borderRadius: 4,
    borderLeft: `4 solid ${ACCENT}`,
    marginBottom: 20,
  },
  solarTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: ACCENT,
    marginBottom: 10,
  },
  solarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  solarLabel: { fontSize: 10, color: '#555' },
  solarValue: { fontSize: 10, fontWeight: 'bold', color: '#333' },
  datesRow: { flexDirection: 'row', marginBottom: 20 },
  dateItem: { marginRight: 40 },
  dateLabel: { fontSize: 9, color: '#666', marginBottom: 2 },
  dateValue: { fontSize: 10, fontWeight: 'bold' },
  section: { marginBottom: 20 },
  offerTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  scopeBox: {
    backgroundColor: '#f0f7ff',
    padding: 12,
    borderRadius: 4,
    borderLeft: `3 solid ${ACCENT}`,
    marginBottom: 20,
  },
  scopeTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: ACCENT,
    marginBottom: 5,
  },
  scopeText: { fontSize: 9, color: '#444', lineHeight: 1.5 },
  table: { marginBottom: 20 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: ACCENT,
    padding: 8,
    color: '#fff',
  },
  tableHeaderCell: { fontWeight: 'bold', fontSize: 9 },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #eee',
    padding: 8,
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottom: '1 solid #eee',
    padding: 8,
    backgroundColor: '#f9fafb',
  },
  tableSectionRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #ddd',
    padding: 8,
    backgroundColor: '#e8f0fe',
    marginTop: 4,
  },
  tableSectionText: { fontSize: 10, fontWeight: 'bold', color: ACCENT },
  colDescription: { width: '45%' },
  colQuantity: { width: '15%', textAlign: 'right' },
  colUnitPrice: { width: '20%', textAlign: 'right' },
  colTotal: { width: '20%', textAlign: 'right' },
  totalsContainer: { alignItems: 'flex-end', marginBottom: 20 },
  totalsBox: {
    width: 250,
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  totalLabel: { fontSize: 10, color: '#666' },
  totalValue: { fontSize: 10, textAlign: 'right' },
  totalValueDiscount: { fontSize: 10, textAlign: 'right', color: '#dc2626' },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 10,
    borderTop: `2 solid ${ACCENT}`,
  },
  grandTotalLabel: { fontSize: 14, fontWeight: 'bold', color: ACCENT },
  grandTotalValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: ACCENT,
    textAlign: 'right',
  },
  notesBox: {
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 4,
    borderLeft: '3 solid #f59e0b',
    marginBottom: 20,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 5,
  },
  notesText: { fontSize: 9, color: '#78350f', lineHeight: 1.5 },
  termsSection: {
    marginTop: 20,
    paddingTop: 15,
    borderTop: '1 solid #ddd',
  },
  termsTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#666',
  },
  termsText: { fontSize: 8, color: '#666', lineHeight: 1.5 },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    borderTop: '1 solid #ddd',
    paddingTop: 15,
  },
  footerText: { fontSize: 8, color: '#999' },
  pageNumber: {
    position: 'absolute',
    bottom: 15,
    right: 40,
    fontSize: 8,
    color: '#999',
  },
})

interface SalesOfferPdfProps {
  quote: GenerateQuoteInput
  quoteReference: string
  validUntil: Date
  financials: {
    subtotal: number
    discountAmount: number
    taxAmount: number
    total: number
  }
  companySettings: CompanySettings
}

export function SalesOfferPdfDocument({
  quote,
  quoteReference,
  validUntil,
  financials,
  companySettings,
}: SalesOfferPdfProps) {
  const lineItems = quote.lineItems
  const sections = new Set(lineItems.map((li) => li.section).filter(Boolean))
  const hasSections = sections.size > 0

  // Group items by section for rendering
  const renderItems = () => {
    if (!hasSections) {
      return lineItems.map((item, idx) => (
        <View
          key={item.id}
          style={idx % 2 !== 0 ? styles.tableRowAlt : styles.tableRow}
        >
          <Text style={styles.colDescription}>{item.description}</Text>
          <Text style={styles.colQuantity}>
            {item.quantity} {item.unit}
          </Text>
          <Text style={styles.colUnitPrice}>
            {formatCurrency(item.unitPrice, 'DKK', 2)}
          </Text>
          <Text style={styles.colTotal}>
            {formatCurrency(item.quantity * item.unitPrice, 'DKK', 2)}
          </Text>
        </View>
      ))
    }

    const elements: React.ReactElement[] = []
    let currentSection = ''
    let rowIdx = 0

    for (const item of lineItems) {
      if (item.section && item.section !== currentSection) {
        currentSection = item.section
        rowIdx = 0
        elements.push(
          <View key={`section-${item.section}`} style={styles.tableSectionRow}>
            <Text style={styles.tableSectionText}>{item.section}</Text>
          </View>
        )
      }

      const isAlt = rowIdx % 2 !== 0
      rowIdx++

      elements.push(
        <View
          key={item.id}
          style={isAlt ? styles.tableRowAlt : styles.tableRow}
        >
          <Text style={styles.colDescription}>{item.description}</Text>
          <Text style={styles.colQuantity}>
            {item.quantity} {item.unit}
          </Text>
          <Text style={styles.colUnitPrice}>
            {formatCurrency(item.unitPrice, 'DKK', 2)}
          </Text>
          <Text style={styles.colTotal}>
            {formatCurrency(item.quantity * item.unitPrice, 'DKK', 2)}
          </Text>
        </View>
      )
    }

    return elements
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>SALGSTILBUD</Text>
            <Text style={styles.quoteNumber}>{quoteReference}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.companyName}>
              {companySettings.company_name}
            </Text>
            <Text style={styles.companyDetails}>
              {companySettings.company_address &&
                `${companySettings.company_address}\n`}
              {companySettings.company_postal_code &&
                companySettings.company_city &&
                `${companySettings.company_postal_code} ${companySettings.company_city}\n`}
              {companySettings.company_vat_number &&
                `CVR: ${companySettings.company_vat_number}\n`}
              {companySettings.company_email &&
                `${companySettings.company_email}\n`}
              {companySettings.company_phone &&
                `Tlf: ${companySettings.company_phone}`}
            </Text>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.customerBox}>
          <Text style={styles.customerLabel}>TIL:</Text>
          <Text style={styles.customerName}>
            {quote.customer.companyName}
          </Text>
          <Text style={styles.customerDetail}>
            {quote.customer.contactPerson}
          </Text>
          {quote.customer.address && (
            <Text style={styles.customerDetail}>
              {quote.customer.address}
            </Text>
          )}
          {quote.customer.postalCode && quote.customer.city && (
            <Text style={styles.customerDetail}>
              {quote.customer.postalCode} {quote.customer.city}
            </Text>
          )}
          <Text style={styles.customerDetail}>{quote.customer.email}</Text>
          {quote.customer.phone && (
            <Text style={styles.customerDetail}>
              Tlf: {quote.customer.phone}
            </Text>
          )}
        </View>

        {/* Solar System Data */}
        {quote.solarData && (
          <View style={styles.solarBox}>
            <Text style={styles.solarTitle}>Solcelleanlæg</Text>
            <View style={styles.solarRow}>
              <Text style={styles.solarLabel}>Systemstørrelse:</Text>
              <Text style={styles.solarValue}>
                {quote.solarData.systemSizeKwp} kWp
              </Text>
            </View>
            <View style={styles.solarRow}>
              <Text style={styles.solarLabel}>Forventet årsproduktion:</Text>
              <Text style={styles.solarValue}>
                {quote.solarData.estimatedAnnualProductionKwh.toLocaleString(
                  'da-DK'
                )}{' '}
                kWh
              </Text>
            </View>
            {quote.solarData.panelType && (
              <View style={styles.solarRow}>
                <Text style={styles.solarLabel}>Paneltype:</Text>
                <Text style={styles.solarValue}>
                  {quote.solarData.panelType}
                </Text>
              </View>
            )}
            {quote.solarData.inverterType && (
              <View style={styles.solarRow}>
                <Text style={styles.solarLabel}>Inverter:</Text>
                <Text style={styles.solarValue}>
                  {quote.solarData.inverterType}
                </Text>
              </View>
            )}
            {quote.solarData.batteryType && (
              <View style={styles.solarRow}>
                <Text style={styles.solarLabel}>Batteri:</Text>
                <Text style={styles.solarValue}>
                  {quote.solarData.batteryType}
                </Text>
              </View>
            )}
            {quote.solarData.roofType && (
              <View style={styles.solarRow}>
                <Text style={styles.solarLabel}>Tagtype:</Text>
                <Text style={styles.solarValue}>
                  {quote.solarData.roofType}
                </Text>
              </View>
            )}
            {quote.solarData.estimatedSavingsPerYear != null && (
              <View style={styles.solarRow}>
                <Text style={styles.solarLabel}>
                  Estimeret årlig besparelse:
                </Text>
                <Text style={styles.solarValue}>
                  {formatCurrency(
                    quote.solarData.estimatedSavingsPerYear,
                    'DKK',
                    0
                  )}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Dates */}
        <View style={styles.datesRow}>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>Dato:</Text>
            <Text style={styles.dateValue}>
              {formatDateLongDK(new Date().toISOString())}
            </Text>
          </View>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>Gyldig til:</Text>
            <Text style={styles.dateValue}>
              {formatDateLongDK(validUntil.toISOString())}
            </Text>
          </View>
        </View>

        {/* Title & Description */}
        <View style={styles.section}>
          <Text style={styles.offerTitle}>{quote.title}</Text>
          {quote.description && (
            <View style={styles.scopeBox}>
              <Text style={styles.scopeTitle}>Omfang</Text>
              <Text style={styles.scopeText}>{quote.description}</Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {quote.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>OBS / Bemærkninger</Text>
            <Text style={styles.notesText}>{quote.notes}</Text>
          </View>
        )}

        {/* Line Items Table */}
        {lineItems.length > 0 && (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colDescription]}>
                Beskrivelse
              </Text>
              <Text style={[styles.tableHeaderCell, styles.colQuantity]}>
                Antal
              </Text>
              <Text style={[styles.tableHeaderCell, styles.colUnitPrice]}>
                Enhedspris
              </Text>
              <Text style={[styles.tableHeaderCell, styles.colTotal]}>
                Total
              </Text>
            </View>
            {renderItems()}
          </View>
        )}

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal:</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(financials.subtotal, 'DKK', 2)}
              </Text>
            </View>
            {quote.discountPercentage > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Rabat ({quote.discountPercentage}%):
                </Text>
                <Text style={styles.totalValueDiscount}>
                  -{formatCurrency(financials.discountAmount, 'DKK', 2)}
                </Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Moms ({quote.taxPercentage}%):
              </Text>
              <Text style={styles.totalValue}>
                {formatCurrency(financials.taxAmount, 'DKK', 2)}
              </Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>TOTAL:</Text>
              <Text style={styles.grandTotalValue}>
                {formatCurrency(financials.total, 'DKK', 2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Terms */}
        <View style={styles.termsSection}>
          <Text style={styles.termsTitle}>BETINGELSER</Text>
          <Text style={styles.termsText}>
            {`Tilbuddet er gyldigt i ${quote.validityDays} dage fra udstedelsesdatoen.\nAlle priser er ekskl. moms medmindre andet er angivet.\nLeveringstid aftales ved ordrebekræftelse.\nBetaling: Netto 14 dage.\nForbehold for trykfejl og prisændringer.`}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {companySettings.company_name}
            {companySettings.company_website &&
              ` | ${companySettings.company_website}`}
            {companySettings.company_email &&
              ` | ${companySettings.company_email}`}
          </Text>
        </View>

        {/* Page Number */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Side ${pageNumber} af ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
