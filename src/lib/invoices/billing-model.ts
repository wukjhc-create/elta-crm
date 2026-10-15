/**
 * 00232 (Henrik 2026-10-15): eksplicit afregningsform — fast pris eller regning. Ingen gæt: uden valg blokeres
 * slutfakturaen. Rene funktioner.
 */
export const BILLING_MODELS = ['fixed_price', 'time_and_materials'] as const
export type BillingModel = (typeof BILLING_MODELS)[number]

export const BILLING_MODEL_LABEL: Record<BillingModel, string> = {
  fixed_price: 'Fast pris',
  time_and_materials: 'Regning (timer og materialer)',
}

export function isBillingModel(v: unknown): v is BillingModel {
  return typeof v === 'string' && (BILLING_MODELS as readonly string[]).includes(v)
}

export type FinalInvoicePlanKind =
  | { kind: 'contract_remainder'; basis: number; basisKind: 'contract_sum' | 'revised_sum' }
  | { kind: 'lines' }
  | { kind: 'blocked'; message: string }

/** Hvilken slutfaktura sagen skal have, ud fra den VALGTE afregningsform (aldrig ud fra kontraktsummen alene) */
export function finalInvoicePlanKind(sag: { billing_model?: string | null; contract_sum?: number | string | null; revised_sum?: number | string | null }): FinalInvoicePlanKind {
  const m = sag.billing_model
  if (m == null) return { kind: 'blocked', message: 'Vælg afregningsform for sagen (fast pris eller regning), før slutfakturaen oprettes' }
  if (!isBillingModel(m)) return { kind: 'blocked', message: 'Sagens afregningsform er ukendt — kontakt en administrator' }
  if (m === 'time_and_materials') return { kind: 'lines' }
  const rev = sag.revised_sum == null ? null : Number(sag.revised_sum)
  if (rev != null && Number.isFinite(rev) && rev > 0) return { kind: 'contract_remainder', basis: Math.round(rev * 100) / 100, basisKind: 'revised_sum' }
  const cs = sag.contract_sum == null ? null : Number(sag.contract_sum)
  if (cs != null && Number.isFinite(cs) && cs > 0) return { kind: 'contract_remainder', basis: Math.round(cs * 100) / 100, basisKind: 'contract_sum' }
  return { kind: 'blocked', message: 'Sagen er sat til fast pris, men har ingen kontraktsum — angiv kontraktsummen eller skift til regning' }
}
