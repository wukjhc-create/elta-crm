'use server'

/**
 * ES-3 (e-sign-review 2026-10-17): underskriftsbeviset (hvem, hvornår, fra hvilken IP, selve underskriften) var kun
 * synligt i kundeportalen — 00177 fjernede SELECT for authenticated, og intet i dashboardet læste offer_signatures.
 * Ved en tvist kunne Elta derfor ikke vise accepten. Læses nu med admin-klienten bag offers.view.
 * Kolonner eksplicit (snapshot_id findes kun hvor 00203 er kørt).
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateUUID } from '@/lib/validations/common'
import { formatError } from '@/lib/actions/action-helpers'
import type { ActionResult } from '@/types/common.types'

export interface OfferSignatureEvidence {
  signer_name: string
  signer_email: string
  signer_ip: string | null
  signed_at: string | null
  signature_data: string | null
}

export async function getOfferSignatureAction(offerId: string): Promise<ActionResult<OfferSignatureEvidence | null>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { hasPermission } = ctx
    if (!hasPermission('offers.view')) return { success: false, error: 'Manglende tilladelse: offers.view' }
    validateUUID(offerId, 'tilbud ID')
    // API-2 (Henrik 2026-10-19): kun tilbud i brugerens scope (salg: egne)
    {
      const { getOfferScope, offerInScope } = await import('@/lib/offers/offer-scope')
      if (!(await offerInScope(ctx.supabase, offerId, await getOfferScope(ctx)))) return { success: false, error: 'Tilbud ikke fundet' }
    }
    const { data, error } = await createAdminClient()
      .from('offer_signatures')
      .select('signer_name, signer_email, signer_ip, signed_at, signature_data')
      .eq('offer_id', offerId)
      .maybeSingle()
    if (error) return { success: false, error: 'Kunne ikke hente underskriften' }
    const row = data as OfferSignatureEvidence | null
    // kun et billede-data-URL vises (aldrig vilkårlig tekst som src)
    if (row && row.signature_data && !/^data:image\/png;base64,/.test(row.signature_data)) row.signature_data = null
    // API-2: IP-adressen kun for revisionsadgang (settings.view = audit-loggens ret) — ikke almindelig salg
    if (row && !hasPermission('settings.view')) row.signer_ip = null
    return { success: true, data: row }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente underskriften') }
  }
}
