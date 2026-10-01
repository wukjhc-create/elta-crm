/**
 * Forskud/rater efter kreditnotaer — én regel for service og UI.
 *   - fradrag på slutfaktura = beløb − krediteret (aldrig negativt)
 *   - procent der tæller mod 100 %-loftet = procent × ikke-krediteret andel
 */

const r2 = (n: number) => Math.round(n * 100) / 100

export function netStageAmount(totalAmount: number | string | null, creditedAmount: number | null | undefined): number {
  return Math.max(0, r2(Number(totalAmount ?? 0) - Number(creditedAmount ?? 0)))
}

export function netStagePercentage(
  billingPercentage: number | string | null,
  totalAmount: number | string | null,
  creditedAmount: number | null | undefined
): number {
  if (billingPercentage == null) return 0
  const total = Number(totalAmount ?? 0)
  const share = total > 0 ? netStageAmount(total, creditedAmount) / total : 1
  return r2(Number(billingPercentage) * share)
}
