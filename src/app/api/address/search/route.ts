/**
 * Sprint 9D — Server-side proxy for adresse-autocomplete.
 *
 * GET /api/address/search?q=<query>&limit=<n>
 *
 * Returnerer 0-N AddressSuggestion-rows fra
 * `src/lib/services/address-lookup.ts`. UI'en kalder denne route i
 * stedet for DAWA direkte, saa vi kan skifte udbyder, tilfoeje
 * caching eller rate-limit centralt senere.
 *
 * - Min 3 tegn i query (lavere returnerer tom liste).
 * - Default limit 8, max 20.
 * - 5 sek timeout.
 * - Fejl returneres som tom liste — UI maa ikke crashe paa
 *   netvaerks-/API-fejl.
 *
 * GAP: ingen rate-limit her endnu. Hvis vi senere ser misbrug (fx
 * bots der hammer endpointet), tilfoejes per-IP throttle eller flyt
 * fetch til en authenticated server-action.
 */

import { NextResponse } from 'next/server'
import { searchDanishAddresses, isAddressLookupEnabled } from '@/lib/services/address-lookup'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // API-5 (review 2026-10-17): kun indloggede (bruges kun i dashboardets dialoger) — før en åben DAWA-proxy for alle
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q') || ''
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Math.max(1, Math.min(20, parseInt(limitParam, 10) || 8)) : undefined

  // ADDR-1: uden konfigureret udbyder (ADDRESS_LOOKUP_ENABLED=false) — ingen opslag; UI'et skifter til manuel indtastning
  if (!isAddressLookupEnabled()) return NextResponse.json({ suggestions: [], enabled: false }, { status: 200 })

  try {
    const suggestions = await searchDanishAddresses(q, { limit })
    return NextResponse.json({ suggestions, enabled: true }, {
      headers: {
        // Browser-side caching er fint i nogle sekunder — DAWA-data
        // ændrer sig ikke hurtigt nok til at det er problem.
        'Cache-Control': 'private, max-age=30',
      },
    })
  } catch {
    // Wrapper'en faldback'er allerede paa fejl, men dobbelt-tjek for
    // sikkerheds skyld saa /api-routen aldrig kaster 500 paa UI.
    return NextResponse.json({ suggestions: [] }, { status: 200 })
  }
}
