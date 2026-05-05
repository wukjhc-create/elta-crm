'use server'

/**
 * Sprint 6B-2 — server actions for outgoing invoices.
 *
 * Currently exposes only createInvoiceDraftFromCase. Detail-page
 * status actions (Send / Mark paid / Delete draft) ship in 6B-4.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import {
  createInvoiceDraftFromCase as createInvoiceDraftFromCaseService,
  type CaseInvoiceSelection,
  type CaseInvoiceOptions,
  type CreateInvoiceDraftResult,
} from '@/lib/services/invoice-from-case'
import { validateUUID } from '@/lib/validations/common'

export async function createInvoiceDraftFromCaseAction(
  caseId: string,
  selection: CaseInvoiceSelection,
  options: CaseInvoiceOptions = {}
): Promise<CreateInvoiceDraftResult> {
  try {
    validateUUID(caseId, 'case_id')
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Ugyldigt case_id',
      invoice_id: null,
      invoice_number: null,
      created_lines: [],
      skipped_lines: [],
      totals: null,
    }
  }
  let approverId: string
  let supabase
  try {
    const a = await getAuthenticatedClient()
    approverId = a.userId
    supabase = a.supabase
  } catch (err) {
    return {
      ok: false,
      message: formatError(err, 'Adgang nægtet'),
      invoice_id: null,
      invoice_number: null,
      created_lines: [],
      skipped_lines: [],
      totals: null,
    }
  }

  const result = await createInvoiceDraftFromCaseService(
    caseId,
    approverId,
    selection,
    options
  )

  if (result.ok && result.invoice_id) {
    revalidatePath('/dashboard/invoices')
    revalidatePath(`/dashboard/invoices/${result.invoice_id}`)
    // Resolve case_number for the canonical orders detail revalidate
    const { data: caseRow } = await supabase
      .from('service_cases')
      .select('case_number')
      .eq('id', caseId)
      .maybeSingle()
    if (caseRow?.case_number) {
      revalidatePath(`/dashboard/orders/${caseRow.case_number}`)
    }
    revalidatePath(`/dashboard/orders/${caseId}`)
  }

  return result
}
