/**
 * Forskud/rater efter kreditnotaer — én regel for service og UI.
 *   - fradrag på slutfaktura = beløb − krediteret (aldrig negativt)
 *   - procent der tæller mod 100 %-loftet = procent × ikke-krediteret andel
 */
import { roundMoney } from '@/lib/utils/money-round'

// FIN2-9: fælles øre-afrunding (halv øre væk fra nul, som SQL ROUND/e-conomic)
const r2 = roundMoney

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
