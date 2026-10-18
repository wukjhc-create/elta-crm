/**
 * PR-10 / 00231 (Henrik 2026-10-15): eksplicit momsmode — standard_25, zero, reverse_charge. Ingen gæt.
 * Sagsfakturaer laves automatisk KUN med standard_25. zero og reverse_charge er blokeret for automatisk fakturering,
 * indtil fakturatekst og e-conomic-mapping er godkendt. Tvetydige sager (tilbud med anden sats men uden mode) blokeres.
 * Bevidst IKKE 'use server' — kaldes fra fakturaservices med admin-klienten.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const STANDARD_VAT_PERCENT = 25
export const VAT_MODES = ['standard_25', 'zero', 'reverse_charge'] as const
export type VatMode = (typeof VAT_MODES)[number]

export const VAT_MODE_LABEL: Record<VatMode, string> = {
  standard_25: '25 % moms',
  zero: '0 % moms',
  reverse_charge: 'Omvendt betalingspligt',
}

export function isVatMode(v: unknown): v is VatMode {
  return typeof v === 'string' && (VAT_MODES as readonly string[]).includes(v)
}

/** Ældre regel (før 00231): tilbuddets procentsats ≠ 25 → blokér. Beholdes som værn for tilbud uden mode. */
export function vatBlockMessage(offerTaxPercentage: number | string | null | undefined): string | null {
  if (offerTaxPercentage === null || offerTaxPercentage === undefined || offerTaxPercentage === '') return null
  const v = Number(offerTaxPercentage)
  if (!Number.isFinite(v)) return 'Tilbuddets momssats kan ikke læses — fakturér ikke automatisk; kontakt en administrator'
  if (Math.abs(v - STANDARD_VAT_PERCENT) < 0.001) return null
  return `Sagens tilbud er med ${v.toLocaleString('da-DK')} % moms (fx 0 % eller omvendt betalingspligt). Automatisk fakturering understøtter kun 25 % endnu — fakturaen er ikke oprettet. Kontakt en administrator.`
}

export function vatModeBlockMessage(mode: string | null | undefined): string | null {
  if (mode == null || mode === 'standard_25') return null
  if (!isVatMode(mode)) return 'Sagens momsmode er ukendt — fakturér ikke automatisk; kontakt en administrator'
  return `Sagen er sat til ${VAT_MODE_LABEL[mode].toLowerCase()}. Automatisk fakturering understøtter kun 25 % moms endnu (fakturatekst og e-conomic-opsætning skal godkendes først) — fakturaen er ikke oprettet.`
}

/**
 * Effektiv momsmode for en sag: tilbuddets mode, ellers betalerens/kundens mode, ellers standard_25.
 * Returnerer blokeringsbesked eller null (= 25 % — fortsæt).
 */
export async function caseVatBlock(supabase: SupabaseClient, caseId: string): Promise<string | null> {
  const { data: sc } = await supabase.from('service_cases').select('source_offer_id, customer_id, payer_customer_id').eq('id', caseId).maybeSingle()
  const row = (sc ?? {}) as { source_offer_id?: string | null; customer_id?: string | null; payer_customer_id?: string | null }
  if (row.source_offer_id) {
    const { data: offer } = await supabase.from('offers').select('tax_percentage, vat_mode').eq('id', row.source_offer_id).maybeSingle()
    const o = (offer ?? {}) as { tax_percentage?: number | string | null; vat_mode?: string | null }
    if (o.vat_mode) {
      const m = vatModeBlockMessage(o.vat_mode)
      if (m) return m
    }
    // IV2-1 (validerings-review 2026-10-18): også med mode standard_25 skal tilbuddets SATS være 25 % — et tilbud med
    // 0 % (kunden underskrev uden moms), men mode standard_25 (arvet standard), blev ellers faktureret med 25 % oveni
    const legacy = vatBlockMessage(o.tax_percentage)
    if (legacy) return legacy
  }
  const custId = row.payer_customer_id ?? row.customer_id
  if (custId) {
    const { data: cust } = await supabase.from('customers').select('vat_mode').eq('id', custId).maybeSingle()
    return vatModeBlockMessage((cust as { vat_mode?: string | null } | null)?.vat_mode)
  }
  return null
}
