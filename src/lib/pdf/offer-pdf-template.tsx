import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import type { OfferWithRelations, OfferLineItem } from '@/types/offers.types'
import { formatDateLongDK, formatCurrency } from '@/lib/utils/format'
import type { CompanySettings } from '@/types/company-settings.types'

// Register fonts (using system fonts for simplicity)
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'Helvetica' },
    { src: 'Helvetica-Bold', fontWeight: 'bold' },
  ],
})

// Create styles
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
    borderBottom: '2 solid #0066cc',
    paddingBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    textAlign: 'right',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0066cc',
    marginBottom: 5,
  },
  offerNumber: {
    fontSize: 12,
    color: '#666',
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 3,
  },
  companyDetails: {
    fontSize: 9,
    color: '#666',
    lineHeight: 1.4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottom: '1 solid #ddd',
  },
  customerBox: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 4,
    marginBottom: 20,
  },
  customerLabel: {
    fontSize: 9,
    color: '#666',
    marginBottom: 5,
  },
  customerName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  customerDetail: {
    fontSize: 10,
    color: '#444',
    marginBottom: 2,
  },
  offerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  offerDescription: {
    fontSize: 10,
    color: '#444',
    lineHeight: 1.5,
    marginBottom: 10,
  },
  datesRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  dateItem: {
    marginRight: 40,
  },
  dateLabel: {
    fontSize: 9,
    color: '#666',
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0066cc',
    padding: 8,
    color: '#fff',
  },
  tableHeaderCell: {
    fontWeight: 'bold',
    fontSize: 9,
  },
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
  // Section row (e.g., "Materialer", "Arbejdsløn")
  tableSectionRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #ddd',
    padding: 8,
    backgroundColor: '#e8f0fe',
    marginTop: 4,
  },
  tableSectionText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  // Line item with notes
  lineItemNotes: {
    fontSize: 8,
    color: '#888',
    marginTop: 2,
    fontStyle: 'italic',
  },
  colPosition: {
    width: '5%',
  },
  colDescription: {
    width: '40%',
  },
  colQuantity: {
    width: '15%',
    textAlign: 'right',
  },
  colUnitPrice: {
    width: '20%',
    textAlign: 'right',
  },
  colTotal: {
    width: '20%',
    textAlign: 'right',
  },
  totalsContainer: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },
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
  totalLabel: {
    fontSize: 10,
    color: '#666',
  },
  totalValue: {
    fontSize: 10,
    textAlign: 'right',
  },
  totalValueDiscount: {
    fontSize: 10,
    textAlign: 'right',
    color: '#dc2626',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 10,
    borderTop: '2 solid #0066cc',
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  grandTotalValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0066cc',
    textAlign: 'right',
  },
  // Scope/introduction section
  scopeBox: {
    backgroundColor: '#f0f7ff',
    padding: 12,
    borderRadius: 4,
    borderLeft: '3 solid #0066cc',
    marginBottom: 20,
  },
  scopeTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0066cc',
    marginBottom: 5,
  },
  scopeText: {
    fontSize: 9,
    color: '#444',
    lineHeight: 1.5,
  },
  // Notes section
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
  notesText: {
    fontSize: 9,
    color: '#78350f',
    lineHeight: 1.5,
  },
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
  termsText: {
    fontSize: 8,
    color: '#666',
    lineHeight: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    borderTop: '1 solid #ddd',
    paddingTop: 15,
  },
  footerText: {
    fontSize: 8,
    color: '#999',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 15,
    right: 40,
    fontSize: 8,
    color: '#999',
  },
})


interface OfferPdfProps {
  offer: OfferWithRelations
  companySettings: CompanySettings
}

export function OfferPdfDocument({ offer, companySettings }: OfferPdfProps) {
  const lineItems = offer.line_items || []

  // Separate section headers from regular items
  const hasSections = lineItems.some(
    (item: OfferLineItem) => item.line_type === 'section'
  )

  // Track row index for alternating colors (reset per section)
  let rowIdx = 0

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>TILBUD</Text>
            <Text style={styles.offerNumber}>{offer.offer_number}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.companyName}>{companySettings.company_name}</Text>
            <Text style={styles.companyDetails}>
              {companySettings.company_address && `${companySettings.company_address}\n`}
              {companySettings.company_postal_code && companySettings.company_city &&
                `${companySettings.company_postal_code} ${companySettings.company_city}\n`}
              {companySettings.company_vat_number && `CVR: ${companySettings.company_vat_number}\n`}
              {companySettings.company_email && `${companySettings.company_email}\n`}
              {companySettings.company_phone && `Tlf: ${companySettings.company_phone}`}
            </Text>
          </View>
        </View>

        {/* Customer Info */}
        {offer.customer && (
          <View style={styles.customerBox}>
            <Text style={styles.customerLabel}>TIL:</Text>
            <Text style={styles.customerName}>{offer.customer.company_name}</Text>
            <Text style={styles.customerDetail}>{offer.customer.contact_person}</Text>
            {offer.customer.billing_address && (
              <Text style={styles.customerDetail}>{offer.customer.billing_address}</Text>
            )}
            {offer.customer.billing_postal_code && offer.customer.billing_city && (
              <Text style={styles.customerDetail}>
                {offer.customer.billing_postal_code} {offer.customer.billing_city}
              </Text>
            )}
            <Text style={styles.customerDetail}>{offer.customer.email}</Text>
            {offer.customer.phone && (
              <Text style={styles.customerDetail}>Tlf: {offer.customer.phone}</Text>
            )}
          </View>
        )}

        {/* Dates */}
        <View style={styles.datesRow}>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>Dato:</Text>
            <Text style={styles.dateValue}>{formatDateLongDK(offer.created_at)}</Text>
          </View>
          {offer.valid_until && (
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>Gyldig til:</Text>
              <Text style={styles.dateValue}>{formatDateLongDK(offer.valid_until)}</Text>
            </View>
          )}
        </View>

        {/* Offer Title and Description */}
        <View style={styles.section}>
          <Text style={styles.offerTitle}>{offer.title}</Text>
          {offer.description && (
            <View style={styles.scopeBox}>
              <Text style={styles.scopeTitle}>Omfang</Text>
              <Text style={styles.scopeText}>{offer.description}</Text>
            </View>
          )}
        </View>

        {/* Notes / OBS Points */}
        {offer.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>OBS / Bemærkninger</Text>
            <Text style={styles.notesText}>{offer.notes}</Text>
          </View>
        )}

        {/* Line Items Table */}
        {lineItems.length > 0 && (
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colPosition]}>#</Text>
              <Text style={[styles.tableHeaderCell, styles.colDescription]}>Beskrivelse</Text>
              <Text style={[styles.tableHeaderCell, styles.colQuantity]}>Antal</Text>
              <Text style={[styles.tableHeaderCell, styles.colUnitPrice]}>Enhedspris</Text>
              <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
            </View>

            {/* Table Rows */}
            {lineItems.map((item: OfferLineItem) => {
              // Section header row
              if (item.line_type === 'section') {
                rowIdx = 0
                return (
                  <View key={item.id} style={styles.tableSectionRow}>
                    <Text style={styles.tableSectionText}>{item.description}</Text>
                  </View>
                )
              }

              // Regular item row
              const isAlt = rowIdx % 2 !== 0
              rowIdx++

              return (
                <View
                  key={item.id}
                  style={isAlt ? styles.tableRowAlt : styles.tableRow}
                >
                  <Text style={styles.colPosition}>{item.position}</Text>
                  <View style={styles.colDescription}>
                    <Text>{item.description}</Text>
                    {item.notes && (
                      <Text style={styles.lineItemNotes}>{item.notes}</Text>
                    )}
                  </View>
                  <Text style={styles.colQuantity}>
                    {item.quantity} {item.unit}
                  </Text>
                  <Text style={styles.colUnitPrice}>
                    {formatCurrency(item.unit_price, offer.currency, 2)}
                  </Text>
                  <Text style={styles.colTotal}>
                    {formatCurrency(item.total, offer.currency, 2)}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal:</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(offer.total_amount, offer.currency, 2)}
              </Text>
            </View>
            {offer.discount_percentage > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Rabat ({offer.discount_percentage}%):
                </Text>
                <Text style={styles.totalValueDiscount}>
                  -{formatCurrency(offer.discount_amount, offer.currency, 2)}
                </Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Moms ({offer.tax_percentage}%):
              </Text>
              <Text style={styles.totalValue}>
                {formatCurrency(offer.tax_amount, offer.currency, 2)}
              </Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>TOTAL:</Text>
              <Text style={styles.grandTotalValue}>
                {formatCurrency(offer.final_amount, offer.currency, 2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Terms and Conditions */}
        {offer.terms_and_conditions && (
          <View style={styles.termsSection}>
            <Text style={styles.termsTitle}>BETINGELSER</Text>
            <Text style={styles.termsText}>{offer.terms_and_conditions}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {companySettings.company_name}
            {companySettings.company_website && ` | ${companySettings.company_website}`}
            {companySettings.company_email && ` | ${companySettings.company_email}`}
          </Text>
        </View>

        {/* Page Number */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Side ${pageNumber} af ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
