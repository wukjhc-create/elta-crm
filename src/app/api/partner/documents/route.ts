export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePartnerToken } from '@/lib/actions/partner-portal'
import { PARTNER_DOCUMENT_TYPES } from '@/types/partner-portal.types'
import { getStorageSignedUrlOrNull, SIGNED_URL_TTL } from '@/lib/storage/signed-url'
import { logger } from '@/lib/utils/logger'

/**
 * Partner-portal dokument-download — token-baseret auth (ingen bruger-session).
 * GET /api/partner/documents?token=xxx&documentId=yyy
 *
 * Sikkerhed:
 *   - validatePartnerToken først; partner_customer_id stammer fra valideret token.
 *   - Ejerskabs-guard FØR signed-URL: dokumentets service_case skal have
 *     payer_customer_id = partner (inner-join-filter). En gættet dokument-UUID
 *     fra en fremmed sag afvises. 404 ved enhver miss (afslør ikke eksistens).
 *   - Kun kunde-vendte typer (PARTNER_DOCUMENT_TYPES) — interne sagsfotos ude.
 *   - Frisk kortlivet signed-URL (SHORT) udstedes pr. forespørgsel; ingen
 *     brugbar URL ligger i list-payloaden.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const documentId = searchParams.get('documentId')

    if (!token || !documentId) {
      return NextResponse.json({ error: 'Manglende parametre' }, { status: 400 })
    }

    const sessionResult = await validatePartnerToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json({ error: 'Ugyldig adgang' }, { status: 401 })
    }
    const partnerCustomerId = sessionResult.data.partner_customer_id

    const supabase = createAdminClient()

    // Ejerskabs-guard: dokumentet skal høre til en sag hvor partneren er payer,
    // og være en kunde-vendt type. !inner ekskluderer rækker uden sag.
    const { data: doc, error } = await supabase
      .from('customer_documents')
      .select('id, file_name, storage_path, document_type, service_cases!inner(payer_customer_id)')
      .eq('id', documentId)
      .eq('service_cases.payer_customer_id', partnerCustomerId)
      .in('document_type', PARTNER_DOCUMENT_TYPES as unknown as string[])
      .maybeSingle()

    if (error || !doc || !doc.storage_path) {
      return NextResponse.json({ error: 'Dokument ikke fundet' }, { status: 404 })
    }

    const url = await getStorageSignedUrlOrNull(
      'attachments',
      doc.storage_path as string,
      SIGNED_URL_TTL.SHORT
    )

    if (!url) {
      return NextResponse.json({ error: 'Kunne ikke hente fil' }, { status: 404 })
    }

    return NextResponse.redirect(url)
  } catch (error) {
    logger.error('Partner document download failed', { error })
    return NextResponse.json({ error: 'Kunne ikke hente dokument' }, { status: 500 })
  }
}
