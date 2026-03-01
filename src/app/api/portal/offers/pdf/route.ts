export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { OfferPdfDocument } from '@/lib/pdf/offer-pdf-template'
import { getCompanySettings } from '@/lib/actions/settings'
import type { OfferWithRelations } from '@/types/offers.types'
import type { ReactElement, JSXElementConstructor } from 'react'
import { logger } from '@/lib/utils/logger'

/**
 * Portal PDF download — token-based auth (no user session required).
 * GET /api/portal/offers/pdf?token=xxx&offerId=yyy
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const offerId = searchParams.get('offerId')

    if (!token || !offerId) {
      return NextResponse.json({ error: 'Manglende parametre' }, { status: 400 })
    }

    const supabase = await createClient()

    // Validate portal token
    const { data: tokenData, error: tokenError } = await supabase
      .from('portal_access_tokens')
      .select('id, customer_id, expires_at, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Ugyldig adgang' }, { status: 401 })
    }

    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Adgangen er udløbet' }, { status: 401 })
    }

    // Get offer — must belong to the customer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(*),
        customer:customers(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country)
      `)
      .eq('id', offerId)
      .eq('customer_id', tokenData.customer_id)
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

    // Company settings
    const settingsResult = await getCompanySettings()
    if (!settingsResult.success || !settingsResult.data) {
      return NextResponse.json({ error: 'Indstillinger mangler' }, { status: 500 })
    }

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
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    logger.error('Portal PDF generation error', { error })
    return NextResponse.json({ error: 'PDF-fejl' }, { status: 500 })
  }
}
