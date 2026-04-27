import { NextResponse } from 'next/server'
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer'
import { FuldmagtPDF } from '@/lib/pdf/fuldmagt-pdf-template'
import type { ReactElement, JSXElementConstructor } from 'react'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      customer_name, customer_address, customer_postal_city,
      order_number, foedselsdato_cvr, marketing_samtykke,
      signature_data, signer_name, date,
    } = body

    if (!customer_name || !date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const pdfDocument = FuldmagtPDF({
      customer_name, customer_address, customer_postal_city,
      order_number, foedselsdato_cvr, marketing_samtykke,
      signature_data, signer_name, date,
    }) as ReactElement<DocumentProps, string | JSXElementConstructor<DocumentProps>>

    const pdfBuffer = await renderToBuffer(pdfDocument)
    const uint8 = new Uint8Array(pdfBuffer)

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="fuldmagt.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Fuldmagt PDF generation error:', error)
    return NextResponse.json(
      { error: error?.message || 'PDF generation failed' },
      { status: 500 }
    )
  }
}
