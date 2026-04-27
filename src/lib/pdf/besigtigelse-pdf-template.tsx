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
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#333' },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25, borderBottom: `2 solid ${BRAND_GREEN}`, paddingBottom: 15 },
  headerLeft: { flex: 1 },
  headerRight: { textAlign: 'right' },
  title: { fontSize: 22, fontWeight: 'bold', color: BRAND_GREEN, marginBottom: 3 },
  subtitle: { fontSize: 10, color: '#666' },
  companyName: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  companyDetails: { fontSize: 8, color: '#666', lineHeight: 1.4 },
  // Sections
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', color: BRAND_GREEN_DARK, marginBottom: 8, paddingBottom: 4, borderBottom: '1 solid #e5e7eb', textTransform: 'uppercase', letterSpacing: 1 },
  // Stamdata box
  stamdataBox: { backgroundColor: '#f9fafb', borderRadius: 6, padding: 12 },
  stamdataRow: { flexDirection: 'row', marginBottom: 6 },
  stamdataLabel: { width: 100, fontSize: 9, color: '#6b7280', fontWeight: 'bold' },
  stamdataValue: { flex: 1, fontSize: 10, color: '#111827' },
  // Tech grid — 2 columns
  techGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  techItem: { width: '50%', flexDirection: 'row', borderBottom: '1 solid #f3f4f6', paddingVertical: 4, paddingRight: 8 },
  techLabel: { width: 120, fontSize: 9, color: '#6b7280', fontWeight: 'bold' },
  techValue: { flex: 1, fontSize: 10, color: '#111827' },
  // Full-width tech row (for textarea fields)
  techRowFull: { flexDirection: 'row', borderBottom: '1 solid #f3f4f6', paddingVertical: 4 },
  // Notes
  notesBox: { backgroundColor: '#fffbeb', borderRadius: 6, padding: 12, border: '1 solid #fde68a' },
  notesText: { fontSize: 10, color: '#333', lineHeight: 1.5 },
  // Images
  imageSection: { marginTop: 8 },
  imageCategoryTitle: { fontSize: 9, fontWeight: 'bold', color: '#6b7280', marginBottom: 4, marginTop: 6 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  imageBox: { width: 140, height: 105, borderRadius: 4, objectFit: 'cover' },
  imageLabel: { fontSize: 7, color: '#9ca3af', marginTop: 2 },
  // Signature
  signatureSection: { marginTop: 16, borderTop: '1 solid #e5e7eb', paddingTop: 15 },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between' },
  signatureBlock: { width: '45%' },
  signatureLabel: { fontSize: 9, color: '#6b7280', marginBottom: 4 },
  signatureLine: { borderBottom: '1 solid #333', height: 40, marginBottom: 4 },
  signatureImage: { height: 50, marginBottom: 4, objectFit: 'contain' },
  signatureName: { fontSize: 10, fontWeight: 'bold' },
  signatureDate: { fontSize: 8, color: '#6b7280' },
  // Footer
  footer: { position: 'absolute', bottom: 25, left: 40, right: 40, borderTop: '1 solid #e5e7eb', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#9ca3af' },
})

interface BesigtigelsePDFProps {
  customer: {
    company_name: string
    contact_person: string | null
    email: string
    phone: string | null
    mobile: string | null
    customer_number: string
    billing_address: string | null
    billing_postal_code: string | null
    billing_city: string | null
    shipping_address: string | null
    shipping_postal_code: string | null
    shipping_city: string | null
  }
  formData: {
    tagType: string
    tagHaeldning: string
    tagAreal: string
    tagRetning: string
    tagStand: string
    skyggeforhold: string
    eltavleStatus: string
    eltavlePlads: string
    inverterPlacering: string
    kabelvej: string
    acKabelvej: string
    dcKabelvej: string
    internetSignal: string
    netvaerkSSID: string
    netvaerkPassword: string
    malerNr: string
    sikringsstoerrelse: string
    jordingStatus: string
    saerligeAftaler: string
    signatureData: string | null
    signerName: string
  }
  date: string
  images?: { category: string; base64: string; name: string }[]
}

export function BesigtigelsePDF({ customer, formData, date, images }: BesigtigelsePDFProps) {
  const address = [
    customer.shipping_address || customer.billing_address,
    customer.shipping_postal_code || customer.billing_postal_code,
    customer.shipping_city || customer.billing_city,
  ].filter(Boolean).join(', ')

  const tagFields = [
    { label: 'Tagtype', value: formData.tagType },
    { label: 'Taghældning', value: formData.tagHaeldning },
    { label: 'Tag-areal', value: formData.tagAreal ? `${formData.tagAreal} m²` : '' },
    { label: 'Tag-retning', value: formData.tagRetning },
    { label: 'Tag-stand', value: formData.tagStand },
    { label: 'Skyggeforhold', value: formData.skyggeforhold },
  ].filter((f) => f.value)

  const elFields = [
    { label: 'Eltavle status', value: formData.eltavleStatus },
    { label: 'Plads i eltavle', value: formData.eltavlePlads },
    { label: 'Målernr.', value: formData.malerNr },
    { label: 'Sikringsstørrelse', value: formData.sikringsstoerrelse },
    { label: 'Jording', value: formData.jordingStatus },
    { label: 'Internet/signal', value: formData.internetSignal },
    { label: 'Inverter placering', value: formData.inverterPlacering },
  ].filter((f) => f.value)

  // Group images by category
  const imagesByCategory: Record<string, { base64: string; name: string }[]> = {}
  if (images && images.length > 0) {
    for (const img of images) {
      if (!imagesByCategory[img.category]) imagesByCategory[img.category] = []
      imagesByCategory[img.category].push({ base64: img.base64, name: img.name })
    }
  }
  const categoryLabels: Record<string, string> = {
    eltavle: 'Eltavle',
    tag: 'Tag',
    'ac-foering': 'AC Kabelføring',
    'dc-foering': 'DC Kabelføring',
    inverter: 'Inverter-placering',
    andet: 'Andet',
  }
  const hasImages = Object.keys(imagesByCategory).length > 0

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.title}>Besigtigelsesrapport</Text>
            <Text style={s.subtitle}>{date} — Kunde #{customer.customer_number}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.companyName}>{BRAND_COMPANY_NAME}</Text>
            <Text style={s.companyDetails}>{BRAND_TAGLINE}</Text>
            <Text style={s.companyDetails}>CVR: {BRAND_CVR}</Text>
            <Text style={s.companyDetails}>{BRAND_EMAIL}</Text>
            <Text style={s.companyDetails}>{BRAND_WEBSITE}</Text>
          </View>
        </View>

        {/* Stamdata */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Kundeoplysninger</Text>
          <View style={s.stamdataBox}>
            <View style={s.stamdataRow}>
              <Text style={s.stamdataLabel}>Firma</Text>
              <Text style={s.stamdataValue}>{customer.company_name}</Text>
            </View>
            <View style={s.stamdataRow}>
              <Text style={s.stamdataLabel}>Kontaktperson</Text>
              <Text style={s.stamdataValue}>{customer.contact_person || '—'}</Text>
            </View>
            <View style={s.stamdataRow}>
              <Text style={s.stamdataLabel}>E-mail</Text>
              <Text style={s.stamdataValue}>{customer.email}</Text>
            </View>
            <View style={s.stamdataRow}>
              <Text style={s.stamdataLabel}>Telefon</Text>
              <Text style={s.stamdataValue}>{customer.phone || customer.mobile || '—'}</Text>
            </View>
            <View style={s.stamdataRow}>
              <Text style={s.stamdataLabel}>Adresse</Text>
              <Text style={s.stamdataValue}>{address || '—'}</Text>
            </View>
          </View>
        </View>

        {/* Tag & Montering */}
        {tagFields.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Tag & Montering</Text>
            <View style={s.techGrid}>
              {tagFields.map((f, i) => (
                <View key={i} style={s.techItem}>
                  <Text style={s.techLabel}>{f.label}</Text>
                  <Text style={s.techValue}>{f.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Eltavle & Installation */}
        {elFields.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Eltavle & Installation</Text>
            <View style={s.techGrid}>
              {elFields.map((f, i) => (
                <View key={i} style={s.techItem}>
                  <Text style={s.techLabel}>{f.label}</Text>
                  <Text style={s.techValue}>{f.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Netværk */}
        {(formData.netvaerkSSID || formData.netvaerkPassword) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Netværk (til inverter)</Text>
            <View style={s.stamdataBox}>
              {formData.netvaerkSSID && (
                <View style={s.stamdataRow}>
                  <Text style={s.stamdataLabel}>SSID</Text>
                  <Text style={s.stamdataValue}>{formData.netvaerkSSID}</Text>
                </View>
              )}
              {formData.netvaerkPassword && (
                <View style={s.stamdataRow}>
                  <Text style={s.stamdataLabel}>Adgangskode</Text>
                  <Text style={s.stamdataValue}>{formData.netvaerkPassword}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* AC Kabelføring */}
        {(formData.acKabelvej || imagesByCategory['ac-foering']) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>AC Kabelføring</Text>
            {formData.acKabelvej && (
              <View style={s.notesBox}>
                <Text style={s.notesText}>{formData.acKabelvej}</Text>
              </View>
            )}
            {imagesByCategory['ac-foering'] && (
              <View style={s.imageRow}>
                {imagesByCategory['ac-foering'].map((img, i) => (
                  <View key={i}><Image src={img.base64} style={s.imageBox} /></View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* DC Kabelføring */}
        {(formData.dcKabelvej || imagesByCategory['dc-foering']) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>DC Kabelføring</Text>
            {formData.dcKabelvej && (
              <View style={s.notesBox}>
                <Text style={s.notesText}>{formData.dcKabelvej}</Text>
              </View>
            )}
            {imagesByCategory['dc-foering'] && (
              <View style={s.imageRow}>
                {imagesByCategory['dc-foering'].map((img, i) => (
                  <View key={i}><Image src={img.base64} style={s.imageBox} /></View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Kabelvej (legacy) */}
        {formData.kabelvej && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Kabelvej</Text>
            <View style={s.notesBox}>
              <Text style={s.notesText}>{formData.kabelvej}</Text>
            </View>
          </View>
        )}

        {/* Særlige aftaler */}
        {formData.saerligeAftaler && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Særlige aftaler & noter</Text>
            <View style={s.notesBox}>
              <Text style={s.notesText}>{formData.saerligeAftaler}</Text>
            </View>
          </View>
        )}

        {/* Underskrift */}
        <View style={s.signatureSection}>
          <Text style={s.sectionTitle}>Underskrift</Text>
          <View style={s.signatureRow}>
            {/* Customer signature */}
            <View style={s.signatureBlock}>
              <Text style={s.signatureLabel}>Kundens underskrift</Text>
              {formData.signatureData ? (
                <Image src={formData.signatureData} style={s.signatureImage} />
              ) : (
                <View style={s.signatureLine} />
              )}
              <Text style={s.signatureName}>{formData.signerName || customer.contact_person || '—'}</Text>
              <Text style={s.signatureDate}>{date}</Text>
            </View>
            {/* Company signature */}
            <View style={s.signatureBlock}>
              <Text style={s.signatureLabel}>For {BRAND_COMPANY_NAME}</Text>
              <View style={s.signatureLine} />
              <Text style={s.signatureName}>Tekniker</Text>
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

      {/* Images page (separate page to avoid overflow) */}
      {hasImages && (
        <Page size="A4" style={s.page}>
          <View style={s.section}>
            <Text style={s.sectionTitle}>Billeder fra besigtigelse</Text>
            {Object.entries(imagesByCategory).map(([cat, imgs]) => (
              <View key={cat} style={s.imageSection}>
                <Text style={s.imageCategoryTitle}>{categoryLabels[cat] || cat}</Text>
                <View style={s.imageRow}>
                  {imgs.map((img, i) => (
                    <View key={i}>
                      <Image src={img.base64} style={s.imageBox} />
                      <Text style={s.imageLabel}>{img.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Footer on image page too */}
          <View style={s.footer} fixed>
            <Text style={s.footerText}>{BRAND_COMPANY_NAME} — CVR {BRAND_CVR}</Text>
            <Text style={s.footerText}>{BRAND_EMAIL} — {BRAND_WEBSITE}</Text>
          </View>
        </Page>
      )}
    </Document>
  )
}
