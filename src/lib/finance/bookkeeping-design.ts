/**
 * Design only. No table, no insert, and no e-conomic call.
 * A later posting is a new row that moves through these states.
 * accounting_sync_log and the UNCERTAIN claim stay the write protection.
 */

export const POSTING_STATES = [
  'draft',
  'pending_approval',
  'approved',
  'booking',
  'booked',
  'rejected',
  'failed',
  'cancelled',
] as const

export type PostingState = (typeof POSTING_STATES)[number]

const TRANSITIONS: Record<PostingState, readonly PostingState[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['booking', 'cancelled'],
  booking: ['booked', 'failed'],
  booked: [],
  rejected: [],
  failed: [],
  cancelled: [],
}

export function canTransitionPosting(from: PostingState, to: PostingState): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Later tables. Not created in this batch. */
export const POSTING_TABLES_LATER = [
  'finance_postings',
  'finance_posting_lines',
  'finance_posting_approvals',
] as const

export const BOOKKEEPING_WRITES_IN_THIS_BATCH = false
