import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import { BRAND_GREEN, BRAND_GREEN_DARK, BRAND_COMPANY_NAME, BRAND_TAGLINE, BRAND_CVR, BRAND_EMAIL, BRAND_WEBSITE } from '@/lib/brand'

Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'Helvetica' },
    { src: 'Helvetica-Bold', fontWeight: 'bold' },
  ],
})

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 11, color: '#333' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30, borderBottom: `2 solid ${BRAND_GREEN}`, paddingBottom: 15 },
  headerLeft: { flex: 1 },
  headerRight: { textAlign: 'right' },
  title: { fontSize: 24, fontWeight: 'bold', color: BRAND_GREEN, marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#666' },
  companyName: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  companyDetails: { fontSize: 8, color: '#666', lineHeight: 1.4 },
  // Body
  bodyText: { fontSize: 11, color: '#333', lineHeight: 1.6, marginBottom: 8 },
  boldText: { fontWeight: 'bold' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: BRAND_GREEN_DARK, marginBottom: 10, paddingBottom: 4, borderBottom: '1 solid #e5e7eb' },
  // Data fields
  fieldRow: { flexDirection: 'row', marginBottom: 8 },
  fieldLabel: { width: 140, fontSize: 10, color: '#6b7280', fontWeight: 'bold' },
  fieldValue: { flex: 1, fontSize: 11, color: '#111827' },
  // Fuldmagt text
  fuldmagtBox: { backgroundColor: '#f9fafb', borderRadius: 6, padding: 16, marginBottom: 16 },
  fuldmagtText: { fontSize: 10, color: '#333', lineHeight: 1.7 },
  // Marketing
  marketingBox: { backgroundColor: '#f0f9f0', borderRadius: 6, padding: 12, marginBottom: 16, border: `1 solid ${BRAND_GREEN}` },
  marketingLabel: { fontSize: 10, fontWeight: 'bold', color: BRAND_GREEN_DARK, marginBottom: 4 },
  marketingValue: { fontSize: 11, color: '#111827' },
  // Signature
  signatureSection: { marginTop: 30, borderTop: '1 solid #e5e7eb', paddingTop: 20 },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between' },
  signatureBlock: { width: '45%' },
  signatureLabel: { fontSize: 9, color: '#6b7280', marginBottom: 6 },
  signatureLine: { borderBottom: '1 solid #333', height: 50, marginBottom: 4 },
  signatureImage: { height: 60, marginBottom: 4, objectFit: 'contain' },
  signatureName: { fontSize: 11, fontWeight: 'bold' },
  signatureDate: { fontSize: 9, color: '#6b7280' },
  // Footer
  footer: { position: 'absolute', bottom: 30, left: 50, right: 50, borderTop: '1 solid #e5e7eb', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#9ca3af' },
})

interface FuldmagtPDFProps {
  customer_name: string
  customer_address: string
  customer_postal_city: string
  order_number: string
  foedselsdato_cvr: string
  marketing_samtykke: boolean
  signature_data: string | null
  signer_name: string
  date: string
}

export function FuldmagtPDF(props: FuldmagtPDFProps) {
  const {
    customer_name, customer_address, customer_postal_city,
    order_number, foedselsdato_cvr, marketing_samtykke,
    signature_data, signer_name, date,
  } = props

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.title}>Fuldmagt</Text>
            <Text style={s.subtitle}>Tilslutning af solcelleanlæg til elnettet</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.companyName}>{BRAND_COMPANY_NAME}</Text>
            <Text style={s.companyDetails}>{BRAND_TAGLINE}</Text>
            <Text style={s.companyDetails}>CVR: {BRAND_CVR}</Text>
            <Text style={s.companyDetails}>{BRAND_EMAIL}</Text>
            <Text style={s.companyDetails}>{BRAND_WEBSITE}</Text>
          </View>
        </View>

        {/* Kundeoplysninger */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Kundeoplysninger</Text>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Navn</Text>
            <Text style={s.fieldValue}>{customer_name}</Text>
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Adresse</Text>
            <Text style={s.fieldValue}>{customer_address}</Text>
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Postnr. & by</Text>
            <Text style={s.fieldValue}>{customer_postal_city}</Text>
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Fødselsdato / CVR nr.</Text>
            <Text style={s.fieldValue}>{foedselsdato_cvr}</Text>
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Ordrenr.</Text>
            <Text style={s.fieldValue}>{order_number}</Text>
          </View>
        </View>

        {/* Fuldmagtstekst */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Fuldmagt</Text>
          <View style={s.fuldmagtBox}>
            <Text style={s.fuldmagtText}>
              Undertegnede giver hermed {BRAND_COMPANY_NAME} (CVR: {BRAND_CVR}) fuldmagt til at handle på mine vegne i forbindelse med tilslutning af solcelleanlæg til elnettet, herunder:
            </Text>
            <Text style={[s.fuldmagtText, { marginTop: 8 }]}>
              {'\u2022'} Anmeldelse og tilmelding af solcelleanlæg hos netselskabet{'\n'}
              {'\u2022'} Kommunikation med netselskab og Energinet om nettilslutning{'\n'}
              {'\u2022'} Oprettelse og administration af afregningsaftale{'\n'}
              {'\u2022'} Indsendelse af nødvendig dokumentation (installationserklæring, datablade mv.)
            </Text>
            <Text style={[s.fuldmagtText, { marginTop: 8 }]}>
              Fuldmagten er gældende fra underskriftsdatoen og indtil anlægget er fuldt tilsluttet og registreret, eller indtil fuldmagten skriftligt tilbagekaldes.
            </Text>
          </View>
        </View>

        {/* Marketing samtykke */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Samtykke til brug af billeder</Text>
          <View style={s.marketingBox}>
            <Text style={s.marketingLabel}>
              Må {BRAND_COMPANY_NAME} bruge billeder fra dit anlæg til markedsføring?
            </Text>
            <Text style={s.marketingValue}>
              {marketing_samtykke ? 'Ja — billeder må bruges til markedsføring' : 'Nej — billeder må ikke bruges'}
            </Text>
          </View>
        </View>

        {/* Underskrift */}
        <View style={s.signatureSection}>
          <Text style={s.sectionTitle}>Underskrift</Text>
          <View style={s.signatureRow}>
            <View style={s.signatureBlock}>
              <Text style={s.signatureLabel}>Fuldmagtsgiver</Text>
              {signature_data ? (
                <Image src={signature_data} style={s.signatureImage} />
              ) : (
                <View style={s.signatureLine} />
              )}
              <Text style={s.signatureName}>{signer_name}</Text>
              <Text style={s.signatureDate}>{date}</Text>
            </View>
            <View style={s.signatureBlock}>
              <Text style={s.signatureLabel}>For {BRAND_COMPANY_NAME}</Text>
              <View style={s.signatureLine} />
              <Text style={s.signatureName}>Installatør</Text>
              <Text style={s.signatureDate}>{date}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{BRAND_COMPANY_NAME} — CVR {BRAND_CVR}</Text>
          <Text style={s.footerText}>{BRAND_EMAIL} — {BRAND_WEBSITE}</Text>
        </View>
      </Page>
    </Document>
  )
}
