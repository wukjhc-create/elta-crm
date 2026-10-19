export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePortalToken } from '@/lib/actions/portal'
import { OfferPdfDocument } from '@/lib/pdf/offer-pdf-template'
import type { OfferWithRelations } from '@/types/offers.types'
import type { CompanySettings } from '@/types/company-settings.types'
import type { ReactElement, JSXElementConstructor } from 'react'
import { logger } from '@/lib/utils/logger'
import { OFFER_LINE_PUBLIC_COLUMNS } from '@/lib/offers/line-columns'
import { COMPANY_SETTINGS_PUBLIC_COLUMNS } from '@/lib/settings/company-columns'

/**
 * Portal PDF download — token-based auth (no user session required).
 * GET /api/portal/offers/pdf?token=xxx&offerId=yyy
 *
 * Phase α.3 trin 4+5: refactoreret til validatePortalToken + admin.
 * Den tidligere implementation brugte anon-client mod portal_access_tokens,
 * customers og company_settings — alle nu lukket for anon (00126/127/128).
 * Endpointet var silent-broken siden α.2 trin 3.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const offerId = searchParams.get('offerId')

    if (!token || !offerId) {
      return NextResponse.json({ error: 'Manglende parametre' }, { status: 400 })
    }

    // Validér token (admin-baseret siden α.2 trin 1)
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json({ error: 'Ugyldig adgang' }, { status: 401 })
    }
    const customerId = sessionResult.data.customer_id
    const supabase = createAdminClient()

    // Hent tilbud med embedded line_items + customer; customer_id-scope
    // garanterer at en gaettet offer-UUID fra anden kunde ikke kan leakes.
    const { data: offerRaw, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(${OFFER_LINE_PUBLIC_COLUMNS}),
        customer:customers!offers_customer_id_fkey(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country)
      `)
      .eq('id', offerId)
      .eq('customer_id', customerId)
      // Q10: kun tilbud kunden kan se i portalen (ikke kladder)
      .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
      .single()

    // kolonnelisten er en konstant → ingen statisk typeudledning (samme mønster som den interne PDF-route)
    const offer = offerRaw as unknown as OfferWithRelations | null
    if (offerError || !offer) {
      return NextResponse.json({ error: 'Tilbud ikke fundet' }, { status: 404 })
    }

    // Sort line items
    if (offer.line_items) {
      offer.line_items.sort((a: { position: number }, b: { position: number }) =>
        a.position - b.position
      )
    }

    // Company settings (singleton — fetched via admin)
    // ST-10 (storage-review 2026-10-16): kun offentlige kolonner — som den interne PDF-route (før '*' inkl. SMTP-/SMS-
    // hemmeligheder og linjernes kostkolonner i hukommelsen for en portal-forespørgsel)
    const { data: companySettings, error: settingsError } = await supabase
      .from('company_settings')
      .select(COMPANY_SETTINGS_PUBLIC_COLUMNS)
      .maybeSingle()

    if (settingsError || !companySettings) {
      logger.error('Company settings not found for PDF', { error: settingsError })
      return NextResponse.json({ error: 'Indstillinger mangler' }, { status: 500 })
    }
    const settingsResult = { success: true, data: companySettings as unknown as CompanySettings }

    // ES-3 (e-sign-review 2026-10-17): kundens egen underskrift på den accepterede PDF (uden IP — kun den interne PDF)
    let signature = null
    if ((offer as { status?: string }).status === 'accepted') {
      const { data: sig } = await supabase.from('offer_signatures')
        .select('signer_name, signer_email, signed_at, signature_data').eq('offer_id', (offer as { id: string }).id).maybeSingle()
      signature = sig as { signer_name: string; signer_email: string; signed_at: string | null; signature_data: string | null } | null
    }

    // IV2-3: produktbilleder hentes sikkert og indlejres før rendering (renderen henter aldrig selv en URL)
    {
      const { inlinePdfLineImages } = await import('@/lib/pdf/inline-pdf-images')
      offer.line_items = await inlinePdfLineImages(offer.line_items)
    }

    // Generate PDF
    const pdfDocument = OfferPdfDocument({
      offer,
      companySettings: settingsResult.data,
      signature,
    }) as ReactElement<DocumentProps, string | JSXElementConstructor<DocumentProps>>

    const pdfBuffer = await renderToBuffer(pdfDocument)
    const filename = `${offer.offer_number || 'tilbud'}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // ST-10: kundens tilbud må ikke caches af mellemled/browser (som portalens faktura-PDF)
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    logger.error('PDF generation failed', { error })
    return NextResponse.json({ error: 'Fejl ved PDF-generering' }, { status: 500 })
  }
}
