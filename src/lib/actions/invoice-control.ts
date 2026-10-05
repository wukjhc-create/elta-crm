'use server'

/**
 * Fakturakontrol i UI: forventet pris (leverandørkatalog) mod faktureret pris pr. linje. Kun LÆSNING.
 * Gate = modulets side (incoming_invoices.view). Linjerne er RLS-beskyttet til samme roller (00166).
 */
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import type { InvoiceControlResult } from '@/lib/invoice-control/invoice-control-loader'

export async function getInvoiceControl(invoiceId: string): Promise<ActionResult<InvoiceControlResult>> {
  try {
    validateUUID(invoiceId, 'faktura-ID')
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('incoming_invoices.view')) return { success: false, error: 'Manglende tilladelse: incoming_invoices.view' }
    const { loadInvoiceControl } = await import('@/lib/invoice-control/invoice-control-loader')
    // 00192: kostkolonner — admin-klient (kun katalogopslag) bag incoming_invoices.view (admin/serviceleder/bogholderi)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const r = await loadInvoiceControl(ctx.supabase, invoiceId, createAdminClient())
    if (!r) return { success: false, error: 'Faktura ikke fundet' }
    return { success: true, data: r }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke kontrollere fakturaen') }
  }
}
