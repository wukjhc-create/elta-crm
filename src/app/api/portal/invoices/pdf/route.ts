export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePortalToken } from '@/lib/actions/portal'
import { getInvoicePdfPayload } from '@/lib/services/invoices'
import { InvoicePdfDocument } from '@/lib/pdf/invoice-pdf-template'
import type { CompanySettings } from '@/types/company-settings.types'
import type { ReactElement, JSXElementConstructor } from 'react'
import { logger } from '@/lib/utils/logger'

/**
 * Portal faktura-PDF — token-baseret auth (ingen bruger-session).
 * GET /api/portal/invoices/pdf?token=xxx&invoiceId=yyy
 *
 * Sikkerhed (jf. plan-invarianter):
 *   - validatePortalToken først; customer_id stammer fra valideret token.
 *   - Ejerskabs-/synligheds-guard FØR PDF-generering: invoice skal eje af
 *     kunden, have status sent/paid og ikke være annulleret. Svarer 404
 *     (ikke 403) ved miss, så fakturaers eksistens ikke afsløres.
 *   - getInvoicePdfPayload er allerede cost-free (kun invoices.* + salgs-
 *     invoice_lines — ingen kost/margin/dækningsbidrag).
 *   - company_settings hentes via admin (singleton uden kundespecifik PII).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const invoiceId = searchParams.get('invoiceId')

    if (!token || !invoiceId) {
      return NextResponse.json({ error: 'Manglende parametre' }, { status: 400 })
    }

    // Validér token (admin-baseret)
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json({ error: 'Ugyldig adgang' }, { status: 401 })
    }
    const customerId = sessionResult.data.customer_id
    const supabase = createAdminClient()

    // Ejerskabs- + synligheds-guard FØR payload-opslag. customer_id-scope
    // forhindrer at en gættet faktura-UUID fra anden kunde kan leakes; status-
    // /void-tjek forhindrer drafts og annullerede fakturaer. 404 ved enhver miss.
    const { data: guard, error: guardError } = await supabase
      .from('invoices')
      .select('id, status, voided_at')
      .eq('id', invoiceId)
      .eq('customer_id', customerId)
      .maybeSingle()

    if (
      guardError ||
      !guard ||
      guard.voided_at !== null ||
      !['sent', 'paid'].includes(guard.status)
    ) {
      return NextResponse.json({ error: 'Faktura ikke fundet' }, { status: 404 })
    }

    const payload = await getInvoicePdfPayload(invoiceId)
    if (!payload) {
      return NextResponse.json({ error: 'Faktura ikke fundet' }, { status: 404 })
    }

    // Company settings (singleton — hentet via admin)
    const { data: companySettings, error: settingsError } = await supabase
      .from('company_settings')
      .select('*')
      .maybeSingle()

    if (settingsError || !companySettings) {
      logger.error('Company settings not found for portal invoice PDF', {
        error: settingsError,
      })
      return NextResponse.json({ error: 'Indstillinger mangler' }, { status: 500 })
    }

    const document = InvoicePdfDocument({
      payload,
      companySettings: companySettings as CompanySettings,
    }) as ReactElement<DocumentProps, string | JSXElementConstructor<DocumentProps>>

    const pdfBuffer = await renderToBuffer(document)
    const filename = `${payload.invoice.invoice_number}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    logger.error('Portal invoice PDF render failed', { error })
    return NextResponse.json({ error: 'Kunne ikke generere PDF' }, { status: 500 })
  }
}
