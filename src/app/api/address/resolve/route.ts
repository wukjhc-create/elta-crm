/**
 * ADDR-1: opslag af et valgt adresseforslag (id + type fra /api/address/search) → fulde, normaliserede felter
 * (vej, husnr., etage/dør, postnr., by, kommune, WGS84-koordinater). Serverside; tokenet forlader aldrig serveren.
 *
 * GET /api/address/resolve?id=<uuid>&kind=adresse|husnummer → { address: AddressSuggestion | null, enabled: boolean }
 * Fejl/timeout/slået fra → address: null — kalderen beholder forslagets tekst (manuel rettelse altid mulig).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAddressLookupEnabled, resolveAddressSuggestion } from '@/lib/services/address-lookup'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isAddressLookupEnabled()) return NextResponse.json({ address: null, enabled: false })
  const url = new URL(req.url)
  const id = url.searchParams.get('id') ?? ''
  const kind = url.searchParams.get('kind') === 'husnummer' ? 'husnummer' : 'adresse'
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ address: null, enabled: true })
  try {
    const address = await resolveAddressSuggestion(id, kind)
    return NextResponse.json({ address, enabled: true }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch {
    return NextResponse.json({ address: null, enabled: true })
  }
}
