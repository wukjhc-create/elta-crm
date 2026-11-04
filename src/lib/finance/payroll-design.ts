/**
 * Design only. This module does not calculate salary and does not post it.
 * A later import brings amounts from an external payroll system or from an
 * e-conomic payroll read. Those amounts are validated, shown as a proposed
 * journal, and posted only after a person approves, through the existing
 * e-conomic client and ECONOMIC_PUSH_ENABLED.
 */

export const PAYROLL_FLOW = [
  'import',
  'validation',
  'proposed_journal',
  'manual_approval',
  'economic_posting',
] as const

export type PayrollStep = (typeof PAYROLL_FLOW)[number]

export const PAYROLL_WRITES_IN_THIS_BATCH = false
