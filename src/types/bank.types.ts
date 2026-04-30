export type BankMatchStatus =
  | 'unmatched'
  | 'matched'
  | 'partial'
  | 'overpayment'
  | 'ambiguous'
  | 'manual'

export type BankMatchConfidence = 'reference' | 'amount+sender' | 'manual' | null

export interface BankTransactionRow {
  id: string
  date: string
  amount: number
  reference_text: string | null
  sender_name: string | null
  matched_invoice_id: string | null
  match_status: BankMatchStatus
  match_confidence: BankMatchConfidence
  matched_at: string | null
  candidate_invoice_ids: string[] | null
  notes: string | null
  created_at: string
}

export interface ParsedBankRow {
  date: string                // ISO yyyy-mm-dd
  amount: number
  reference_text: string | null
  sender_name: string | null
}
