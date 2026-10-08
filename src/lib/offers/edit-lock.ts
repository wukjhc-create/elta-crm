/**
 * Henrik 2026-10-07: "Sendte tilbud må ikke redigeres frit" — kun KLADDER kan ændres (indhold, linjer, priser, rabat).
 * Server-side lås for alle redigerende tilbuds-actions (UI'et skjuler også redigering, men server actions kan kaldes
 * direkte). Indtil revisioner (migration 00203, BLOCKED_APPROVAL) findes: sendt/set → "Tilbage til kladde" (logges),
 * accepteret er endeligt. Interne noter (offers.notes) er ikke kundevendte og må altid redigeres.
 * Bevidst IKKE 'use server'.
 */
import { OFFER_STATUS_LABELS, type OfferStatus } from '@/types/offers.types'

type Client = { from: (t: string) => any }

/** Fejltekst hvis tilbuddet ikke må redigeres, ellers null. */
export async function offerEditLockReason(supabase: Client, offerId: string): Promise<string | null> {
  const { data, error } = await supabase.from('offers').select('status').eq('id', offerId).maybeSingle()
  if (error) return 'Kunne ikke kontrollere tilbuddets status'
  if (!data) return 'Tilbuddet blev ikke fundet'
  const status = (data as { status: OfferStatus }).status
  if (status === 'draft') return null
  const label = OFFER_STATUS_LABELS[status] ?? status
  return status === 'accepted'
    ? `Tilbuddet er ${label.toLowerCase()} og kan ikke ændres — opret et nyt tilbud`
    : `Tilbuddet er ${label.toLowerCase()} og kan ikke redigeres — sæt det tilbage til kladde først`
}

/** Linjens tilbud (til lås på linje-actions). */
export async function offerIdForLine(supabase: Client, lineId: string): Promise<string | null> {
  const { data } = await supabase.from('offer_line_items').select('offer_id').eq('id', lineId).maybeSingle()
  return (data as { offer_id: string } | null)?.offer_id ?? null
}
