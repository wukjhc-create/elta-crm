/**
 * Henrik 2026-10-15 (PR-6): slutfaktura på en fastprissag (kontraktsag = sagen har revideret beløb eller kontraktsum,
 * EKSKL. moms — samme definition som lib/cases/expected-revenue.ts):
 *
 *   KONTRAKTSUM − tidligere fakturereret (forskud, rater, del-fakturaer — netto efter udstedte kreditnotaer) = RESTBELØB
 *
 * Timer/materialer lægges IKKE oven i kontraktsummen. Rene regler (ingen I/O) — bruges af createFinalInvoiceForCase og
 * forhåndsvisningen, så UI og server altid viser det samme.
 *   - kladder (forskud/rate/del-faktura eller kreditnota) blokerer — gæt ikke på om de sendes
 *   - restbeløb 0 → "allerede fuldt faktureret"; negativt → overfakturering (kreditér i stedet) — begge blokerer
 *   - afrunding: øre (2 decimaler) pr. beløb og på summen
 */
import { roundMoney } from '@/lib/utils/money-round'

export interface PriorInvoiceInput {
  id: string
  invoice_number: string
  invoice_type: string
  status: string
  total_amount: number | string | null
  /** udstedte kreditnotaer på fakturaen (positivt beløb ekskl. moms) */
  credited: number
}

export interface ContractDeduction { id: string; invoice_number: string; invoice_type: string; amount: number; credited: number }

export type ContractRemainderPlan =
  | { ok: true; basis: number; deductions: ContractDeduction[]; deducted: number; remainder: number }
  | { ok: false; code: 'no_basis' | 'draft_prior' | 'fully_invoiced' | 'overbilled' | 'read_error'; message: string; basis: number; deducted: number; remainder: number }

// FIN2-9: fælles øre-afrunding (halv øre væk fra nul, som SQL ROUND/e-conomic)
const r2 = roundMoney

/** Fakturaer der tæller som "tidligere faktureret" på en kontraktsag */
export const CONTRACT_PRIOR_TYPES = ['deposit', 'progress', 'standard'] as const

export function contractBasis(sag: { contract_sum?: number | string | null; revised_sum?: number | string | null }): number | null {
  const rev = sag.revised_sum == null ? null : Number(sag.revised_sum)
  if (rev != null && Number.isFinite(rev) && rev > 0) return r2(rev)
  const cs = sag.contract_sum == null ? null : Number(sag.contract_sum)
  if (cs != null && Number.isFinite(cs) && cs > 0) return r2(cs)
  return null
}

const TYPE_LABEL: Record<string, string> = { deposit: 'forskud', progress: 'rate', standard: 'del-faktura' }
export const contractTypeLabel = (t: string) => TYPE_LABEL[t] ?? t

export function planContractRemainder(basis: number | null, priors: PriorInvoiceInput[], hasDraftCredit = false): ContractRemainderPlan {
  if (basis == null || !(basis > 0)) {
    return { ok: false, code: 'no_basis', message: 'Sagen har ingen kontraktsum', basis: 0, deducted: 0, remainder: 0 }
  }
  const relevant = priors.filter((p) => (CONTRACT_PRIOR_TYPES as readonly string[]).includes(p.invoice_type))
  const drafts = relevant.filter((p) => p.status === 'draft')
  if (drafts.length || hasDraftCredit) {
    return {
      ok: false,
      code: 'draft_prior',
      message: drafts.length
        ? `Send eller slet ${drafts.length === 1 ? 'kladden' : 'kladderne'} først: ${drafts.map((d) => d.invoice_number).join(', ')} — en ikke-udstedt faktura kan ikke trækkes fra kontraktsummen`
        : 'Send eller slet kreditnota-kladden først — den kan ikke indregnes i restbeløbet',
      basis, deducted: 0, remainder: basis,
    }
  }
  const deductions: ContractDeduction[] = []
  for (const p of relevant) {
    const amount = Math.max(0, r2(Number(p.total_amount ?? 0) - Number(p.credited ?? 0)))
    if (amount <= 0) continue
    deductions.push({ id: p.id, invoice_number: p.invoice_number, invoice_type: p.invoice_type, amount, credited: r2(p.credited ?? 0) })
  }
  const deducted = r2(deductions.reduce((a, d) => a + d.amount, 0))
  const remainder = r2(basis - deducted)
  if (remainder === 0) {
    return { ok: false, code: 'fully_invoiced', message: 'Kontraktsummen er allerede fuldt faktureret — der er intet restbeløb til en slutfaktura', basis, deducted, remainder }
  }
  if (remainder < 0) {
    return {
      ok: false,
      code: 'overbilled',
      message: `Der er faktureret ${(-remainder).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr mere end kontraktsummen (ekskl. moms) — kreditér det overskydende i stedet for en slutfaktura`,
      basis, deducted, remainder,
    }
  }
  return { ok: true, basis, deductions, deducted, remainder }
}
