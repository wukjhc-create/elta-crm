import { createClient } from '@/lib/supabase/server'
import { APP_URL } from '@/lib/constants'

/**
 * Get the portal URL for a given offer.
 * Tries to find an active portal token for the customer.
 * Falls back to /view-offer/{id} if no token exists.
 */
export async function getPortalOfferUrl(offerId: string, customerId: string): Promise<string> {
  const supabase = await createClient()

  // Look for an existing active portal token for this customer
  // Include tokens with null expires_at (never-expiring) OR future expiration
  const { data: existingToken } = await supabase
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
