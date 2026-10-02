'use client'

/**
 * "Udløbet"-mærke for sendte/sete tilbud efter "gyldig til" (dansk dag — samme regel som kundeportalens
 * accept-værn). Kunden kan IKKE acceptere et udløbet tilbud i portalen, så sælger skal kunne se det og
 * forlænge gyldigheden. Vises først efter hydrering (afhænger af "nu" → ingen hydreringsforskel).
 */

import { useHydrated } from '@/lib/hooks/use-hydrated'
import { isOfferExpired } from '@/lib/offers/validity'

export function OfferExpiryChip({
  status,
  validUntil,
  withHint = false,
}: {
  status: string
  validUntil: string | null | undefined
  withHint?: boolean
}) {
  const hydrated = useHydrated()
  if (!hydrated) return null
  if (status !== 'sent' && status !== 'viewed') return null
  if (!isOfferExpired(validUntil)) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5"
      data-testid="offer-expired"
      title="Gyldighedsdatoen er overskredet — kunden kan ikke acceptere i kundeportalen. Forlæng 'Gyldig til' via Rediger."
    >
      Udløbet{withHint ? ' — kunden kan ikke acceptere; forlæng gyldigheden via Rediger' : ''}
    </span>
  )
}
