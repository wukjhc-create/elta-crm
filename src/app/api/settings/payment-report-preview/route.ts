/**
 * Sprint Ø5.3 — Eksempel-PDF for betalingsrapporten.
 *
 * Genererer rapport-PDF'en med LIVE data (samme cost-free view + builder
 * som den rigtige rapport) og returnerer den til visning/download.
 * SENDER INGEN MAIL, ÆNDRER INGEN rapport-/cron-state, logger IKKE
 * "rapport sendt". Best-effort preview-audit.
 *
 * Auth: settings.view (kun visning — ingen mutation).
 */

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement, JSXElementConstructor } from 'react'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import {
  buildPaymentExportRows,
  buildReportPdfPayload,
  loadReportBranding,
} from '@/lib/services/payment-report'
import {
  parsePaymentReportConfig,
  reportFilterToExport,
  REPORT_FILTER_LABEL,
} from '@/lib/invoices/payment-report-config'
import { PaymentReportPdfDocument } from '@/lib/pdf/payment-report-pdf-template'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.view')) {
      return NextResponse.json({ error: 'Manglende tilladelse: settings.view' }, { status: 403 })
    }

    const { data: row } = await supabase
      .from('company_settings')
      .select('payment_report_config')
      .maybeSingle()
    const config = parsePaymentReportConfig(row?.payment_report_config)

    const { rows, error } = await buildPaymentExportRows(supabase, reportFilterToExport(config.filter))
    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    const branding = await loadReportBranding(supabase)
    const dateDk = new Date().toLocaleDateString('da-DK', { day: '2-digit', month: 'long', year: 'numeric' })
    const payload = buildReportPdfPayload(rows, REPORT_FILTER_LABEL[config.filter], dateDk, branding)

    const document = PaymentReportPdfDocument({ payload }) as ReactElement<
      DocumentProps,
      string | JSXElementConstructor<DocumentProps>
    >
    const pdfBuffer = await renderToBuffer(document)

    // Best-effort preview-audit — IKKE "rapport sendt", ingen state-ændring.
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        entity_type: 'export',
        entity_id: null,
        entity_name: 'Betalingsrapport',
        action: 'payment_report_previewed',
        action_description: `Eksempel-PDF vist (${rows.length} kunde(r))`,
        changes: {},
        metadata: { filter: config.filter, row_count: rows.length, format: 'pdf', preview: true },
      })
    } catch (e) {
      logger.error('payment-report-preview: audit failed', { error: e })
    }

    const filename = `elta-drift-betalingsoverblik-eksempel.pdf`
    const inline = request.nextUrl.searchParams.get('download') !== '1'
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    logger.error('payment-report preview failed', { error })
    return NextResponse.json({ error: 'Kunne ikke generere eksempel-PDF' }, { status: 500 })
  }
}
