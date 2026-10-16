import type { SupabaseClient } from '@supabase/supabase-js'
import { secretTokenReader } from '@/lib/portal/token-reader'
import { createClient } from '@/lib/supabase/server'
import { APP_URL } from '@/lib/constants'

/**
 * Get the portal URL for a given offer.
 * Tries to find an active portal token for the customer.
 * Falls back to /view-offer/{id} if no token exists.
 */
export async function getPortalOfferUrl(offerId: string, customerId: string, client?: SupabaseClient): Promise<string> {
  // O-1 (review 2026-10-16): cron/plan uden session sender admin-klienten — anon kan ikke læse tokens (00126)
  if (client) {
    const { data: tok } = await client
      .from('portal_access_tokens')
      .select('token')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const t = (tok as { token?: string } | null)?.token
    return t ? `${APP_URL}/portal/${t}/offers/${offerId}` : `${APP_URL}/view-offer/${offerId}`
  }
  const supabase = await createClient()

  // Look for an existing active portal token for this customer
  // Include tokens with null expires_at (never-expiring) OR future expiration
  // P-009 (00175): token-kolonnen er skjult for bruger-sessionen. En indlogget medarbejder laeser via service-role
  // (samme adgang som foer); uden session (anon-cron, P-003) bruges anon-klienten som hidtil -> uaendret cron-adfaerd.
  const { data: { user } } = await supabase.auth.getUser()
  const reader = user ? await secretTokenReader() : supabase
  const { data: existingToken } = await reader
    .from('portal_access_tokens')
    .select('token')
    .eq('customer_id', customerId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingToken?.token) {
    return `${APP_URL}/portal/${existingToken.token}/offers/${offerId}`
  }

  // Fallback to public view-offer link
  return `${APP_URL}/view-offer/${offerId}`
}
