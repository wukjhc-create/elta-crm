'use client'

import { useEffect, useState } from 'react'

/**
 * true når klientkomponenten er hydreret. Bruges til at holde submit-knapper deaktiveret indtil JS-håndteringen er
 * aktiv — ellers kan et klik før hydrering give en native formular-submit (S2-fund: login sendte adgangskoden i URL'en).
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}
