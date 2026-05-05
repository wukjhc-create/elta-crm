import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement, JSXElementConstructor } from 'react'
import { getUser } from '@/lib/supabase/server'
import { getInvoicePdfPayload } from '@/lib/services/invoices'
import { getCompanySettings } from '@/lib/actions/settings'
import { InvoicePdfDocument } from '@/lib/pdf/invoice-pdf-template'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 })
    }

    const { id } = await params
    const payload = await getInvoicePdfPayload(id)
    if (!payload) {
      return NextResponse.json({ error: 'Faktura ikke fundet' }, { status: 404 })
    }

    const companyResult = await getCompanySettings()
    if (!companyResult.success || !companyResult.data) {
      return NextResponse.json(
        { error: 'Kunne ikke hente virksomhedsindstillinger' },
        { status: 500 }
      )
    }

    const document = InvoicePdfDocument({
      payload,
      companySettings: companyResult.data,
    }) as ReactElement<DocumentProps, string | JSXElementConstructor<DocumentProps>>

    const pdfBuffer = await renderToBuffer(document)
    const filename = `${payload.invoice.invoice_number}.pdf`

    // Allow inline view via ?view=1
    const inline = request.nextUrl.searchParams.get('view') === '1'
    const disposition = inline
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    logger.error('Invoice PDF render failed', { error })
    return NextResponse.json({ error: 'Kunne ikke generere PDF' }, { status: 500 })
  }
}
