import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement, JSXElementConstructor } from 'react'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { userCanViewCase } from '@/lib/auth/case-scope'
import { COMPANY_SETTINGS_PUBLIC_COLUMNS } from '@/lib/settings/company-columns'
import type { CompanySettings } from '@/types/company-settings.types'
import { getInvoicePdfPayload } from '@/lib/services/invoices'
import { InvoicePdfDocument } from '@/lib/pdf/invoice-pdf-template'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>
    try {
      ctx = await getAuthenticatedClientWithRole()
    } catch {
      return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 })
    }

    const { id } = await params
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'Faktura ikke fundet' }, { status: 404 })
    }

    // Adgang (før: kun login → enhver indlogget, også montør, kunne hente enhver
    // faktura-PDF): alle fakturaer kræver invoices.view.all; ellers kun fakturaer
    // på sager brugeren må se (invoices.view.own_cases). 404 ved miss.
    const payload = await getInvoicePdfPayload(id)
    if (!payload) {
      return NextResponse.json({ error: 'Faktura ikke fundet' }, { status: 404 })
    }
    if (!ctx.hasPermission('invoices.view.all')) {
      const caseId = (payload.invoice as { case_id?: string | null }).case_id ?? null
      const allowed =
        ctx.hasPermission('invoices.view.own_cases') &&
        !!caseId &&
        (await userCanViewCase(caseId, { role: ctx.role, userId: ctx.userId, supabase: ctx.supabase }))
      if (!allowed) {
        return NextResponse.json({ error: 'Faktura ikke fundet' }, { status: 404 })
      }
    }

    // Firmaoplysninger (offentlige kolonner) via service-role efter adgangstjekket
    // — før krævede getCompanySettings settings.view, så bogholderi fik 500.
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

    const document = InvoicePdfDocument({
      payload,
      companySettings: companyData as unknown as CompanySettings,
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
