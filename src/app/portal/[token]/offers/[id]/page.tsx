import { redirect } from 'next/navigation'
import { validatePortalToken, getPortalOffer, getPortalMessages } from '@/lib/actions/portal'
import { createAdminClient } from '@/lib/supabase/admin'
import { OfferDetail } from '@/components/modules/portal/offer-detail'
import type { CompanySettings } from '@/types/company-settings.types'

export const dynamic = 'force-dynamic'

interface OfferPageProps {
  params: Promise<{ token: string; id: string }>
}

export default async function PortalOfferPage({ params }: OfferPageProps) {
  const { token, id } = await params

  // Validate token
  const sessionResult = await validatePortalToken(token)

  if (!sessionResult.success || !sessionResult.data) {
    redirect('/portal/invalid')
  }

  const session = sessionResult.data

  // Fetch offer and messages (anon-safe)
  const [offerResult, messagesResult] = await Promise.all([
    getPortalOffer(token, id),
    // Sprint 12B: hent ALLE kundens beskeder (én samlet chat pr. customer_id),
    // ikke kun beskeder tagget med dette tilbud.
    getPortalMessages(token),
  ])

  // Phase α.3 trin 1: company_settings via admin (singleton, ingen PII).
  let companySettings: CompanySettings | null = null
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('company_settings').select('*').maybeSingle()
    companySettings = data as CompanySettings | null
  } catch {
    // Non-critical — portal works without it
  }

  if (!offerResult.success || !offerResult.data) {
    redirect(`/portal/${token}`)
  }

  return (
    <OfferDetail
      token={token}
      session={session}
      offer={offerResult.data}
      messages={messagesResult.data || []}
      companySettings={companySettings}
    />
  )
}
