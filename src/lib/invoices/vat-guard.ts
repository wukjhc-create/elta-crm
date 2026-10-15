/**
 * Henrik 2026-10-15 (PR-10, midlertidig): systemet fakturerer i dag altid med 25 % moms på sagsfakturaer (forskud, rate,
 * slutfaktura, del-faktura). Indtil en rigtig momsmodel (25 % / 0 % / omvendt betalingspligt) er bygget, må en sag hvis
 * tilbud har en anden momssats IKKE faktureres automatisk med 25 % — den blokeres med en tydelig besked. Ingen gæt.
 * Bevidst IKKE 'use server' — kaldes fra fakturaservices med admin-klienten.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const STANDARD_VAT_PERCENT = 25

export function vatBlockMessage(offerTaxPercentage: number | string | null | undefined): string | null {
  if (offerTaxPercentage === null || offerTaxPercentage === undefined || offerTaxPercentage === '') return null
  const v = Number(offerTaxPercentage)
  if (!Number.isFinite(v)) return 'Tilbuddets momssats kan ikke læses — fakturér ikke automatisk; kontakt en administrator'
  if (Math.abs(v - STANDARD_VAT_PERCENT) < 0.001) return null
  return `Sagens tilbud er med ${v.toLocaleString('da-DK')} % moms (fx 0 % eller omvendt betalingspligt). Automatisk fakturering understøtter kun 25 % endnu — fakturaen er ikke oprettet. Kontakt en administrator.`
}

/** null = ok (25 % eller intet tilbud); ellers dansk blokeringsbesked */
export async function caseVatBlock(supabase: SupabaseClient, caseId: string): Promise<string | null> {
  const { data: sc } = await supabase.from('service_cases').select('source_offer_id').eq('id', caseId).maybeSingle()
  const offerId = (sc as { source_offer_id?: string | null } | null)?.source_offer_id
  if (!offerId) return null
  const { data: offer } = await supabase.from('offers').select('tax_percentage').eq('id', offerId).maybeSingle()
  return vatBlockMessage((offer as { tax_percentage?: number | string | null } | null)?.tax_percentage)
}
