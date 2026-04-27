import { redirect } from 'next/navigation'
import { validatePortalToken, getPortalOffer, getPortalMessages } from '@/lib/actions/portal'
import { createAnonClient } from '@/lib/supabase/server'
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
    getPortalMessages(token, id),
  ])

  // Fetch company settings with anon client (no auth required)
  let companySettings: CompanySettings | null = null
  try {
    const supabase = createAnonClient()
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
