import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer'
import { createClient, getUser } from '@/lib/supabase/server'
import { OfferPdfDocument } from '@/lib/pdf/offer-pdf-template'
import { getCompanySettings } from '@/lib/actions/settings'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import type { OfferWithRelations } from '@/types/offers.types'
import type { ReactElement, JSXElementConstructor } from 'react'

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

    // Get offer with relations
    const supabase = await createClient()
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(*),
        customer:customers(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country)
      `)
      .eq('id', id)
      .single()

    if (offerError || !offer) {
      console.error('Error fetching offer for PDF:', offerError)
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

    // Get company settings
    const settingsResult = await getCompanySettings()
    if (!settingsResult.success || !settingsResult.data) {
      return NextResponse.json(
        { error: 'Kunne ikke hente virksomhedsindstillinger' },
        { status: 500 }
      )
    }

    // Generate PDF
    const pdfDocument = OfferPdfDocument({
      offer: offer as OfferWithRelations,
      companySettings: settingsResult.data,
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
    console.error('Error generating PDF:', error)
    return NextResponse.json(
      { error: 'Kunne ikke generere PDF' },
      { status: 500 }
    )
  }
}
