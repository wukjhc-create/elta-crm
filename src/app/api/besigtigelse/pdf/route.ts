import { NextResponse } from 'next/server'
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer'
import { BesigtigelsePDF } from '@/lib/pdf/besigtigelse-pdf-template'
import type { ReactElement, JSXElementConstructor } from 'react'
import { isInternalRequest, isSafeImageSource } from '@/lib/security/internal-request'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  // Q10: kun server-til-server (besigtigelse-action) — før kunne alle generere en Elta-rapport
  if (!isInternalRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json()
    const { customer, formData, date, images, siteAddress } = body

    if (!customer || !formData || !date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // billeder/underskrift kun som indlejrede data-URL'er (react-pdf henter URL'er/filstier → SSRF)
    const imgs: unknown[] = Array.isArray(images) ? images : []
    if (!isSafeImageSource(formData?.signatureData) || imgs.some((i) => !isSafeImageSource((i as { base64?: unknown } | null)?.base64))) {
      return NextResponse.json({ error: 'Ugyldigt billedformat' }, { status: 400 })
    }

    const pdfDocument = BesigtigelsePDF({ customer, formData, date, images: images || [], siteAddress }) as ReactElement<
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
