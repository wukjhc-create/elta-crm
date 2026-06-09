import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface ViewOfferPageProps {
  params: Promise<{ id: string }>
}

/**
 * Legacy /view-offer/[id] route — redirects to the proper portal route.
 * Emails used to link here; now we find the portal token and redirect.
 *
 * Phase α.3 trin 4+5: refactoreret til admin-client. Tidligere brugte
 * routen anon mod offers + portal_access_tokens, hvilket har vaeret
 * silent-broken siden α.2 trin 3 (00126 fjernede anon-grants).
 */
export default async function ViewOfferPage({ params }: ViewOfferPageProps) {
  const { id: offerId } = await params

  const supabase = createAdminClient()

  // Look up the offer to get customer_id
  const { data: offer } = await supabase
    .from('offers')
    .select('customer_id')
    .eq('id', offerId)
    .maybeSingle()

  if (offer?.customer_id) {
    // Find active portal token for this customer
    const { data: token } = await supabase
      .from('portal_access_tokens')
      .select('token')
      .eq('customer_id', offer.customer_id)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (token?.token) {
      redirect(`/portal/${token.token}/offers/${offerId}`)
    }
  }

  // No token found — show a simple error page
  redirect('/portal/invalid')
}
