import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer'
import { createClient, getUser } from '@/lib/supabase/server'
import { OfferPdfDocument } from '@/lib/pdf/offer-pdf-template'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { COMPANY_SETTINGS_PUBLIC_COLUMNS } from '@/lib/settings/company-columns'
import type { CompanySettings } from '@/types/company-settings.types'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import type { OfferWithRelations } from '@/types/offers.types'
import type { ReactElement, JSXElementConstructor } from 'react'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const user = await getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Ikke autoriseret' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Adgang: kræver offers.view (før: kun login — offers-RLS er åben, så fx
    // montør kunne hente tilbuds-PDF'er). 404 så eksistens ikke afsløres.
    const { hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('offers.view')) {
      return NextResponse.json({ error: 'Tilbud ikke fundet' }, { status: 404 })
    }

    // Get offer with relations
    const supabase = await createClient()
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(*),
        customer:customers!offers_customer_id_fkey(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country)
      `)
      .eq('id', id)
      .single()

    if (offerError || !offer) {
      logger.error('Error fetching offer for PDF', { error: offerError })
      return NextResponse.json(
        { error: 'Tilbud ikke fundet' },
        { status: 404 }
      )
    }

    // Sort line items by position
    if (offer.line_items) {
      offer.line_items.sort((a: { position: number }, b: { position: number }) =>
        a.position - b.position
      )
    }

    // Firmaoplysninger (offentlige kolonner) via service-role efter adgangstjekket —
    // før krævede getCompanySettings settings.view, så salg fik 500 på egne tilbud.
    const { data: companyData } = await createAdminClient()
      .from('company_settings')
      .select(COMPANY_SETTINGS_PUBLIC_COLUMNS)
      .limit(1)
      .maybeSingle()
    if (!companyData) {
      return NextResponse.json(
        { error: 'Kunne ikke hente virksomhedsindstillinger' },
        { status: 500 }
      )
    }

    // Generate PDF
    const pdfDocument = OfferPdfDocument({
      offer: offer as OfferWithRelations,
      companySettings: companyData as unknown as CompanySettings,
    }) as ReactElement<DocumentProps, string | JSXElementConstructor<DocumentProps>>

    const pdfBuffer = await renderToBuffer(pdfDocument)

    // Log activity
    await logOfferActivity(
      id,
      'pdf_generated',
      'PDF genereret',
      user.id,
      { downloadedBy: user.email }
    )

    // Return PDF
    const filename = `${offer.offer_number}.pdf`

    // Convert Buffer to Uint8Array for NextResponse
    const pdfUint8Array = new Uint8Array(pdfBuffer)

    return new NextResponse(pdfUint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    logger.error('Error generating PDF', { error })
    return NextResponse.json(
      { error: 'Kunne ikke generere PDF' },
      { status: 500 }
    )
  }
}
