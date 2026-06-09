export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePortalToken } from '@/lib/actions/portal'
import { OfferPdfDocument } from '@/lib/pdf/offer-pdf-template'
import type { OfferWithRelations } from '@/types/offers.types'
import type { ReactElement, JSXElementConstructor } from 'react'
import { logger } from '@/lib/utils/logger'

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
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(*),
        customer:customers!offers_customer_id_fkey(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country)
      `)
      .eq('id', offerId)
      .eq('customer_id', customerId)
      .single()

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
    const { data: companySettings, error: settingsError } = await supabase
      .from('company_settings')
      .select('*')
      .maybeSingle()

    if (settingsError || !companySettings) {
      logger.error('Company settings not found for PDF', { error: settingsError })
      return NextResponse.json({ error: 'Indstillinger mangler' }, { status: 500 })
    }
    const settingsResult = { success: true, data: companySettings }

    // Generate PDF
    const pdfDocument = OfferPdfDocument({
      offer: offer as OfferWithRelations,
      companySettings: settingsResult.data,
    }) as ReactElement<DocumentProps, string | JSXElementConstructor<DocumentProps>>

    const pdfBuffer = await renderToBuffer(pdfDocument)
    const filename = `${offer.offer_number || 'tilbud'}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    logger.error('PDF generation failed', { error })
    return NextResponse.json({ error: 'Fejl ved PDF-generering' }, { status: 500 })
  }
}
