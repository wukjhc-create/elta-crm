/**
 * ADDR-1 (klient): et valgt søgeforslag slås op via serveren (/api/address/resolve) for de præcise felter
 * (etage/dør, kommune, koordinater). Fejler opslaget, bruges forslagets egne felter — brugeren kan altid rette manuelt.
 */
import type { AddressSuggestion } from '@/lib/address/provider'

export async function resolveSelectedAddress(s: AddressSuggestion): Promise<AddressSuggestion> {
  if (s.resolved !== false || !s.id || !s.kind) return s
  try {
    const res = await fetch(`/api/address/resolve?id=${encodeURIComponent(s.id)}&kind=${s.kind}`)
    if (!res.ok) return s
    const json = (await res.json()) as { address?: AddressSuggestion | null }
    return json.address ?? s
  } catch {
    return s
  }
}
