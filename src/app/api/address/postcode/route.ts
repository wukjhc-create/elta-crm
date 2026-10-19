/**
 * ADDR-1 (2026-10-19): postnummer → by via den konfigurerede adresseudbyder (serverside; aldrig fra browseren).
 *
 * GET /api/address/postcode?nr=8000 → { city: string | null, enabled: boolean }
 * Uden udbyder (ADDRESS_LOOKUP_ENABLED=false): { city: null, enabled: false } — feltet udfyldes manuelt (intet gæt).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lookupPostcode, isAddressLookupEnabled } from '@/lib/services/address-lookup'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isAddressLookupEnabled()) return NextResponse.json({ city: null, enabled: false })
  const nr = new URL(req.url).searchParams.get('nr') ?? ''
  if (!/^\d{4}$/.test(nr)) return NextResponse.json({ city: null, enabled: true })
  try {
    const info = await lookupPostcode(nr)
    return NextResponse.json({ city: info?.city ?? null, enabled: true }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
  } catch {
    return NextResponse.json({ city: null, enabled: true })
  }
}
