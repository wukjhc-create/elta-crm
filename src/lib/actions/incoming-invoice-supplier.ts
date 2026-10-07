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
import { selectInChunks } from '@/lib/supabase/in-chunks'

const TERMINAL = ['approved', 'rejected', 'posted', 'cancelled']

export interface IncomingInvoiceSupplierContext {
  supplierId: string | null
  options: Array<{ id: string; name: string; code: string | null }>
  suggestedName: string | null
  senderDomain: string | null
  locked: boolean
  canCreate: boolean
  /** N66b: andre åbne fakturaer uden leverandør fra samme afsenderdomæne (kan kobles i samme omgang) */
  sameDomainOpen: number
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

async function senderOf(ctx: Ctx, sourceEmailId: string | null): Promise<string | null> {
  if (!sourceEmailId) return null
  // videresendte mails: den oprindelige afsender er leverandøren
  const { data } = await ctx.supabase.from('incoming_emails').select('sender_email, original_sender_email').eq('id', sourceEmailId).maybeSingle()
  const row = data as { sender_email?: string | null; original_sender_email?: string | null } | null
  return senderDomain(row?.original_sender_email || row?.sender_email)
}

/** N66b: åbne fakturaer uden leverandør fra samme afsenderdomæne (ekskl. den aktuelle). Gratis-mail giver aldrig et domæne. */
async function sameDomainOpenInvoices(ctx: Ctx, domain: string | null, excludeId: string): Promise<string[]> {
  if (!domain) return []
  const { data: mails } = await ctx.supabase.from('incoming_emails').select('id, sender_email')
    .ilike('sender_email', `%@${domain.replace(/[%_\\]/g, (c) => `\\${c}`)}`).limit(500)
  const ids = ((mails ?? []) as Array<{ id: string; sender_email: string | null }>).filter((m) => senderDomain(m.sender_email) === domain).map((m) => m.id)
  if (!ids.length) return []
  // X4n: i bidder af 200 (op til 500 mail-id'er i én .in() sprængte URL-grænsen → de øvrige fakturaer blev ikke fundet)
  // best-effort som før: en opslagsfejl må ikke vælte selve leverandørvalget (logges i stedet for stille tom liste)
  let inv: Array<{ id: string; status: string }>
  try {
    inv = await selectInChunks<{ id: string; status: string }>(ids, (chunk) => ctx.supabase.from('incoming_invoices').select('id, status')
      .in('source_email_id', chunk).is('supplier_id', null).neq('id', excludeId))
  } catch (error) {
    logger.error('incoming-invoice-supplier: same-domain lookup failed', { error })
    return []
  }
  return inv.filter((i) => !TERMINAL.includes(i.status)).map((i) => i.id)
}

async function linkSupplier(ctx: Ctx, invoiceId: string, previous: string | null, supplierId: string | null, label: string | null, onlyIfUnset = false) {
  let q = ctx.supabase.from('incoming_invoices').update({ supplier_id: supplierId }).eq('id', invoiceId)
  // samme-domæne-kobling: kun fakturaer der STADIG er uden leverandør og ikke er afsluttet (kode-review: ellers kunne en
  // samtidig ændring/godkendelse overskrives, og audit'ens "previous: null" ville være forkert)
  if (onlyIfUnset) q = q.is('supplier_id', null).not('status', 'in', '(approved,posted,rejected,cancelled)')
  const { data: upd, error } = await q.select('id')
  if (error) {
    logger.error('incoming-invoice-supplier: update failed', { error })
    return 'Kunne ikke gemme leverandøren'
  }
  if (onlyIfUnset && !(upd ?? []).length) return 'ændret imens'
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

/** N66b: kobl de øvrige åbne fakturaer uden leverandør fra samme afsenderdomæne (brugerens valg; audit pr. faktura). */
async function linkSameDomain(ctx: Ctx, inv: { id: string; source_email_id: string | null }, supplierId: string, label: string | null): Promise<number> {
  const ids = await sameDomainOpenInvoices(ctx, await senderOf(ctx, inv.source_email_id), inv.id)
  let n = 0
  for (const id of ids) if (!(await linkSupplier(ctx, id, null, supplierId, label, true))) n++
  return n
}

export async function getIncomingInvoiceSupplierContextAction(invoiceId: string): Promise<ActionResult<IncomingInvoiceSupplierContext>> {
  try {
    validateUUID(invoiceId, 'faktura ID')
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('incoming_invoices.edit')) return { success: false, error: 'Manglende tilladelse: incoming_invoices.edit' }
    const inv = await loadInvoice(ctx, invoiceId)
    if (!inv) return { success: false, error: 'Faktura ikke fundet' }
    const [sup, domain] = await Promise.all([
      ctx.supabase.from('suppliers').select('id, name, code').order('name').limit(500),
      senderOf(ctx, inv.source_email_id),
    ])
    return {
      success: true,
      data: {
        supplierId: inv.supplier_id,
        options: ((sup.data ?? []) as Array<{ id: string; name: string; code: string | null }>),
        suggestedName: inv.supplier_name_extracted,
        senderDomain: domain,
        locked: TERMINAL.includes(inv.status),
        canCreate: ctx.hasPermission('settings.suppliers'),
        sameDomainOpen: (await sameDomainOpenInvoices(ctx, domain, inv.id)).length,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandører') }
  }
}

export async function setIncomingInvoiceSupplierAction(
  invoiceId: string, supplierId: string | null, opts: { alsoSameDomain?: boolean } = {},
): Promise<ActionResult<{ supplierId: string | null; alsoLinked: number }>> {
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
    const alsoLinked = supplierId && opts.alsoSameDomain ? await linkSameDomain(ctx, inv, supplierId, label) : 0
    return { success: true, data: { supplierId, alsoLinked } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme leverandøren') }
  }
}

export async function createSupplierFromIncomingInvoiceAction(
  invoiceId: string, name: string, opts: { alsoSameDomain?: boolean } = {},
): Promise<ActionResult<{ supplierId: string; alsoLinked: number }>> {
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
    const domain = await senderOf(ctx, inv.source_email_id)
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
    const alsoLinked = opts.alsoSameDomain ? await linkSameDomain(ctx, inv, supplierId, clean) : 0
    revalidatePath('/dashboard/settings/suppliers')
    return { success: true, data: { supplierId, alsoLinked } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette leverandøren') }
  }
}
