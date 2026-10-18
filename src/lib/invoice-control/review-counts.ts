/**
 * Tæller eksisterende linje-verdicts og fragt/gebyr-mærker.
 * Ændrer ikke beløb, tolerance eller e-conomic.
 */
import { chargeLabel } from '@/lib/invoice-control/charge-label'

export interface InvoiceReviewCounts {
  lines: number
  overcharge: number
  undercharge: number
  freight: number
  fee: number
}

export function countInvoiceReviewLines(
  lines: readonly { verdict: string; description: string | null | undefined }[],
): InvoiceReviewCounts {
  let overcharge = 0
  let undercharge = 0
  let freight = 0
  let fee = 0
  for (const line of lines) {
    if (line.verdict === 'overcharge') overcharge += 1
    else if (line.verdict === 'undercharge') undercharge += 1
    const kind = chargeLabel(line.description)
    if (kind === 'fragt') freight += 1
    else if (kind === 'gebyr') fee += 1
  }
  return { lines: lines.length, overcharge, undercharge, freight, fee }
}

export function reviewCountText(counts: InvoiceReviewCounts): string {
  return `${counts.overcharge} overpris, ${counts.undercharge} underpris, ${counts.freight} fragt, ${counts.fee} gebyr.`
}
