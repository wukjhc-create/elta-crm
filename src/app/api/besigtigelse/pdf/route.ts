import { NextResponse } from 'next/server'
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer'
import { BesigtigelsePDF } from '@/lib/pdf/besigtigelse-pdf-template'
import type { ReactElement, JSXElementConstructor } from 'react'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { customer, formData, date, images } = body

    if (!customer || !formData || !date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const pdfDocument = BesigtigelsePDF({ customer, formData, date, images: images || [] }) as ReactElement<
      DocumentProps,
      string | JSXElementConstructor<DocumentProps>
    >

    const pdfBuffer = await renderToBuffer(pdfDocument)
    const uint8 = new Uint8Array(pdfBuffer)

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="besigtigelse-${customer.customer_number}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Besigtigelse PDF generation error:', error)
    return NextResponse.json(
      { error: error?.message || 'PDF generation failed' },
      { status: 500 }
    )
  }
}
