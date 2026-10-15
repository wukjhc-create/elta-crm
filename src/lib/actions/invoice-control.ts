'use server'

/**
 * Fakturakontrol i UI: forventet pris (leverandørkatalog) mod faktureret pris pr. linje. Kun LÆSNING.
 * Gate = modulets side (incoming_invoices.view). Linjerne er RLS-beskyttet til samme roller (00166).
 */
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import type { InvoiceControlResult } from '@/lib/invoice-control/invoice-control-loader'
import type { DeviationInvoiceInput, DeviationOverview } from '@/lib/invoice-control/deviation-overview'

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

const OVERVIEW_MAX = 100

/**
 * Fokus C 2026-10-15: prisafvigelser på tværs af leverandørfakturaer (seneste N dage, højst de 100 nyeste aktive
 * fakturaer) — samme kontrol som pr. faktura, samlet: merbetaling i alt, pr. leverandør og dækning. Kun LÆSNING.
 */
export async function getInvoiceDeviationOverview(days = 90): Promise<ActionResult<DeviationOverview & { truncated: boolean; days: number }>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('incoming_invoices.view')) return { success: false, error: 'Manglende tilladelse: incoming_invoices.view' }
    const span = Math.min(365, Math.max(7, Math.floor(days) || 90))
    const since = new Date(Date.now() - span * 86_400_000).toISOString().slice(0, 10)
    const { data, error } = await ctx.supabase.from('incoming_invoices')
      .select('id, invoice_number, invoice_date, status, supplier_name_extracted, suppliers:supplier_id ( name )')
      // fakturadato i perioden — eller, uden fakturadato (ikke-parset), modtaget i perioden
      .or(`invoice_date.gte.${since},and(invoice_date.is.null,created_at.gte.${since}T00:00:00Z)`)
      .not('status', 'in', '(rejected,cancelled)')
      .order('created_at', { ascending: false }).order('id')
      .limit(OVERVIEW_MAX + 1)
    if (error) throw error
    const list = (data ?? []) as Array<{ id: string; invoice_number: string | null; invoice_date: string | null; status: string; supplier_name_extracted: string | null; suppliers: { name: string } | Array<{ name: string }> | null }>
    const { loadInvoiceControl } = await import('@/lib/invoice-control/invoice-control-loader')
    const { summarizeDeviations } = await import('@/lib/invoice-control/deviation-overview')
    // 00192: kostkolonner — admin-klient (kun katalogopslag) bag incoming_invoices.view
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const catalog = createAdminClient()
    const picked = list.slice(0, OVERVIEW_MAX)
    const inputs: DeviationInvoiceInput[] = []
    for (let k = 0; k < picked.length; k += 5) {
      const batch = picked.slice(k, k + 5)
      const res = await Promise.all(batch.map((i) => loadInvoiceControl(ctx.supabase, i.id, catalog)))
      batch.forEach((i, n) => {
        const r = res[n]
        if (!r) return
        const sup = Array.isArray(i.suppliers) ? i.suppliers[0] : i.suppliers
        inputs.push({ id: i.id, invoice_number: i.invoice_number, invoice_date: i.invoice_date, status: i.status, supplier_name: sup?.name ?? i.supplier_name_extracted, control: r.control })
      })
    }
    return { success: true, data: { ...summarizeDeviations(inputs), truncated: list.length > OVERVIEW_MAX, days: span } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente prisafvigelser') }
  }
}
