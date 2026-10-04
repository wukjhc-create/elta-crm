'use server'

/**
 * N66: leverandør på en leverandørfaktura.
 *   getIncomingInvoiceSupplierContextAction — valgmuligheder + forslag (udtrukket navn, afsenderdomæne)
 *   setIncomingInvoiceSupplierAction        — vælg/fjern leverandør (incoming_invoices.edit; kun ikke-afsluttede; audit)
 *   createSupplierFromIncomingInvoiceAction — opret leverandør med afsenderdomænet som website og kobl den
 *                                             (settings.suppliers + incoming_invoices.edit). Næste faktura fra samme
 *                                             domæne kobles derefter automatisk af matcheren (sender_domain_match).
 * Prod 2026-10-04: 57/57 mail-fakturaer uden leverandør — kun 2 leverandører (AO, LM) findes.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { senderDomain } from '@/lib/invoice-control/sender-domain'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'

const TERMINAL = ['approved', 'rejected', 'posted', 'cancelled']

export interface IncomingInvoiceSupplierContext {
  supplierId: string | null
  options: Array<{ id: string; name: string; code: string | null }>
  suggestedName: string | null
  senderDomain: string | null
  locked: boolean
  canCreate: boolean
}

type Ctx = Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>

async function loadInvoice(ctx: Ctx, invoiceId: string) {
  const { data, error } = await ctx.supabase
    .from('incoming_invoices')
    .select('id, status, supplier_id, supplier_name_extracted, source_email_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) logger.error('incoming-invoice-supplier: read failed', { error })
  return (data ?? null) as { id: string; status: string; supplier_id: string | null; supplier_name_extracted: string | null; source_email_id: string | null } | null
}

async function linkSupplier(ctx: Ctx, invoiceId: string, previous: string | null, supplierId: string | null, label: string | null) {
  const { error } = await ctx.supabase.from('incoming_invoices').update({ supplier_id: supplierId }).eq('id', invoiceId)
  if (error) {
    logger.error('incoming-invoice-supplier: update failed', { error })
    return 'Kunne ikke gemme leverandøren'
  }
  try {
    await ctx.supabase.from('incoming_invoice_audit_log').insert({
      incoming_invoice_id: invoiceId, action: 'matched', actor_id: ctx.userId, ok: true,
      previous_value: { supplier_id: previous }, new_value: { supplier_id: supplierId },
      message: supplierId ? `manual supplier → ${label ?? supplierId}` : 'manual supplier cleared',
    })
  } catch { /* best-effort */ }
  revalidatePath('/dashboard/incoming-invoices')
  revalidatePath(`/dashboard/incoming-invoices/${invoiceId}`)
  return null
}

export async function getIncomingInvoiceSupplierContextAction(invoiceId: string): Promise<ActionResult<IncomingInvoiceSupplierContext>> {
  try {
    validateUUID(invoiceId, 'faktura ID')
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('incoming_invoices.edit')) return { success: false, error: 'Manglende tilladelse: incoming_invoices.edit' }
    const inv = await loadInvoice(ctx, invoiceId)
    if (!inv) return { success: false, error: 'Faktura ikke fundet' }
    const [sup, mail] = await Promise.all([
      ctx.supabase.from('suppliers').select('id, name, code').order('name').limit(500),
      inv.source_email_id ? ctx.supabase.from('incoming_emails').select('sender_email').eq('id', inv.source_email_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    return {
      success: true,
      data: {
        supplierId: inv.supplier_id,
        options: ((sup.data ?? []) as Array<{ id: string; name: string; code: string | null }>),
        suggestedName: inv.supplier_name_extracted,
        senderDomain: senderDomain((mail.data as { sender_email?: string | null } | null)?.sender_email),
        locked: TERMINAL.includes(inv.status),
        canCreate: ctx.hasPermission('settings.suppliers'),
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandører') }
  }
}

export async function setIncomingInvoiceSupplierAction(invoiceId: string, supplierId: string | null): Promise<ActionResult<{ supplierId: string | null }>> {
  try {
    validateUUID(invoiceId, 'faktura ID')
    if (supplierId) validateUUID(supplierId, 'leverandør ID')
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('incoming_invoices.edit')) return { success: false, error: 'Manglende tilladelse: incoming_invoices.edit' }
    const inv = await loadInvoice(ctx, invoiceId)
    if (!inv) return { success: false, error: 'Faktura ikke fundet' }
    if (TERMINAL.includes(inv.status)) return { success: false, error: `Fakturaen er ${inv.status} — leverandøren kan ikke ændres` }
    let label: string | null = null
    if (supplierId) {
      const { data: s } = await ctx.supabase.from('suppliers').select('id, name').eq('id', supplierId).maybeSingle()
      if (!s) return { success: false, error: 'Leverandør ikke fundet' }
      label = (s as { name: string }).name
    }
    const err = await linkSupplier(ctx, invoiceId, inv.supplier_id, supplierId, label)
    if (err) return { success: false, error: err }
    return { success: true, data: { supplierId } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme leverandøren') }
  }
}

export async function createSupplierFromIncomingInvoiceAction(invoiceId: string, name: string): Promise<ActionResult<{ supplierId: string }>> {
  try {
    validateUUID(invoiceId, 'faktura ID')
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('settings.suppliers')) return { success: false, error: 'Manglende tilladelse: settings.suppliers' }
    if (!ctx.hasPermission('incoming_invoices.edit')) return { success: false, error: 'Manglende tilladelse: incoming_invoices.edit' }
    const clean = String(name ?? '').trim().slice(0, 200)
    if (clean.length < 2) return { success: false, error: 'Angiv leverandørens navn' }
    const inv = await loadInvoice(ctx, invoiceId)
    if (!inv) return { success: false, error: 'Faktura ikke fundet' }
    if (TERMINAL.includes(inv.status)) return { success: false, error: `Fakturaen er ${inv.status} — leverandøren kan ikke ændres` }
    const mail = inv.source_email_id ? (await ctx.supabase.from('incoming_emails').select('sender_email').eq('id', inv.source_email_id).maybeSingle()).data : null
    const domain = senderDomain((mail as { sender_email?: string | null } | null)?.sender_email)
    const { data: created, error } = await ctx.supabase
      .from('suppliers')
      .insert({ name: clean, website: domain, is_active: true, created_by: ctx.userId, notes: 'Oprettet fra leverandørfaktura' })
      .select('id')
      .single()
    if (error || !created) {
      logger.error('createSupplierFromIncomingInvoice: insert failed', { error })
      return { success: false, error: error?.code === '23505' ? 'En leverandør med denne kode eksisterer allerede' : 'Kunne ikke oprette leverandøren' }
    }
    const supplierId = (created as { id: string }).id
    const err = await linkSupplier(ctx, invoiceId, inv.supplier_id, supplierId, clean)
    if (err) return { success: false, error: err }
    revalidatePath('/dashboard/settings/suppliers')
    return { success: true, data: { supplierId } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette leverandøren') }
  }
}
