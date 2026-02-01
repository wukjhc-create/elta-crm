import { getOfferTextTemplates } from '@/lib/actions/component-intelligence'
import { OfferTextsClient } from './offer-texts-client'

export const metadata = {
  title: 'Tilbudstekster | Kalkia Indstillinger',
  description: 'Automatiske beskrivelser og OBS-punkter til tilbud',
}

export default async function OfferTextsPage() {
  const result = await getOfferTextTemplates({})

  return (
    <OfferTextsClient
      initialTemplates={result.success && result.data ? result.data : []}
    />
  )
}
