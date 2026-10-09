'use server'

/**
 * N60: kundeimport fra CSV (fx eksport fra e-conomic/regneark ved go-live).
 *   previewCustomerImportAction — parser + klassificerer (ny / dublet / ugyldig); intet skrives
 *   importCustomersAction       — genparser og genvaliderer SERVER-SIDE (klientens forhåndsvisning stoles ikke på)
 *                                 og opretter kun "nye" rækker (max 500 pr. import) via insertCustomerWithRetry
 * customers.create. Importerede kunder mærkes custom_fields.source='csv-import' (+ evt. oprindeligt kundenr.).
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { insertCustomerWithRetry } from '@/lib/customers/customer-number'
import { classifyCustomerRows, parseCustomerCsv, phoneDigits, type ClassifiedRow, type CustomerField } from '@/lib/customers/csv-import'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

const MAX_TEXT = 2_000_000 // ~2 MB CSV
const MAX_IMPORT = 500

export interface CustomerImportPreview {
  mapped: Partial<Record<CustomerField, string>>
  unmapped: string[]
  counts: { total: number; new: number; duplicate: number; invalid: number }
  rows: Array<Pick<ClassifiedRow, 'line' | 'status' | 'reason'> & { company_name: string; email: string }>
}

type Ctx = Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>

async function loadExisting(supabase: Ctx['supabase']) {
  const emails = new Set<string>(), vats = new Set<string>(), phones = new Set<string>()
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('customers').select('email, vat_number, phone, mobile').order('id').range(from, from + 999)
    if (error) throw new Error('Kunne ikke hente eksisterende kunder')
    for (const c of (data ?? []) as Array<{ email: string | null; vat_number: string | null; phone: string | null; mobile: string | null }>) {
      if (c.email) emails.add(c.email.trim().toLowerCase())
      if (c.vat_number) vats.add(c.vat_number.replace(/^DK\s*/i, '').replace(/\s/g, ''))
      for (const p of [phoneDigits(c.phone), phoneDigits(c.mobile)]) if (p.length >= 8) phones.add(p)
    }
    if (!data || data.length < 1000) break
  }
  return { emails, vats, phones }
}

async function analyse(ctx: Ctx, csvText: string) {
  if (typeof csvText !== 'string' || !csvText.trim()) return { ctx, error: 'Filen er tom' as const }
  if (csvText.length > MAX_TEXT) return { ctx, error: 'Filen er for stor (max ca. 2 MB)' as const }
  const parsed = parseCustomerCsv(csvText)
  // før blev rækker efter nr. 2000 tavst droppet (kode-review) — brugeren troede hele filen var importeret
  if (parsed.truncatedRows > 0) return { ctx, error: `Filen har for mange rækker (${parsed.rows.length + parsed.truncatedRows}); højst 2000 pr. import — del den op` as const }
  if (!parsed.mapped.company_name || !parsed.mapped.email) {
    return { ctx, error: 'Filen skal have kolonner for firmanavn og e-mail (fx "Firmanavn" og "E-mail")' as const }
  }
  const classified = classifyCustomerRows(parsed.rows, await loadExisting(ctx.supabase))
  // Kunde-review 2026-10-08 (#4): samme regler som "Opret kunde" allerede i forhåndsvisningen (ugyldig = vises som ugyldig)
  const { createCustomerSchema } = await import('@/lib/validations/customers')
  for (const r of classified) {
    if (r.status !== 'new') continue
    const v = r.values
    const valid = createCustomerSchema.safeParse({
      company_name: v.company_name, contact_person: v.contact_person ?? v.company_name, email: v.email,
      phone: v.phone ?? null, mobile: v.mobile ?? null, vat_number: v.vat_number ?? null,
      billing_address: v.billing_address ?? null, billing_postal_code: v.billing_postal_code ?? null,
      billing_city: v.billing_city ?? null, billing_country: 'Danmark', notes: v.notes ?? null,
    })
    if (!valid.success) { r.status = 'invalid'; r.reason = valid.error.issues[0]?.message ?? 'Ugyldige felter' }
  }
  return { ctx, parsed, classified }
}

export async function previewCustomerImportAction(csvText: string): Promise<ActionResult<CustomerImportPreview>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('customers.create')) return { success: false, error: 'Manglende tilladelse: customers.create' }
    const a = await analyse(ctx, csvText)
    if ('error' in a && a.error) return { success: false, error: a.error }
    const { parsed, classified } = a as Required<Pick<typeof a, 'parsed' | 'classified'>>
    const count = (s: ClassifiedRow['status']) => classified.filter((r) => r.status === s).length
    return {
      success: true,
      data: {
        mapped: parsed.mapped,
        unmapped: parsed.unmapped,
        counts: { total: classified.length, new: count('new'), duplicate: count('duplicate'), invalid: count('invalid') },
        rows: classified.slice(0, 200).map((r) => ({ line: r.line, status: r.status, reason: r.reason, company_name: r.values.company_name ?? '', email: r.values.email ?? '' })),
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke læse filen') }
  }
}

export async function importCustomersAction(csvText: string): Promise<ActionResult<{ created: number; skipped: number; failed: number }>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('customers.create')) return { success: false, error: 'Manglende tilladelse: customers.create' }
    const a = await analyse(ctx, csvText)
    if ('error' in a && a.error) return { success: false, error: a.error }
    const { classified } = a as Required<Pick<typeof a, 'classified'>>
    const toCreate = classified.filter((r) => r.status === 'new')
    if (toCreate.length > MAX_IMPORT) return { success: false, error: `Højst ${MAX_IMPORT} nye kunder pr. import — del filen op` }
    const batch = copenhagenParts(new Date()).date
    let created = 0, failed = 0, lateDuplicates = 0
    const { createCustomerSchema } = await import('@/lib/validations/customers')
    const { linkUnlinkedEmailsFromAddress } = await import('@/lib/mail/retro-link')
    for (const r of toCreate) {
      const v = r.values
      // Kunde-review 2026-10-08 (#4): samme regler som "Opret kunde" — ellers kunder som redigeringsformularen senere afviser
      const valid = createCustomerSchema.safeParse({
        company_name: v.company_name, contact_person: v.contact_person ?? v.company_name, email: v.email,
        phone: v.phone ?? null, mobile: v.mobile ?? null, vat_number: v.vat_number ?? null,
        billing_address: v.billing_address ?? null, billing_postal_code: v.billing_postal_code ?? null,
        billing_city: v.billing_city ?? null, billing_country: 'Danmark', notes: v.notes ?? null,
      })
      if (!valid.success) {
        failed += 1
        logger.warn('importCustomers: række ugyldig', { metadata: { line: r.line, issues: valid.error.issues.map((i) => i.path.join('.')).join(',') } })
        continue
      }
      // Kunde-review 2026-10-08 (#5): to samtidige importer af samme fil oprettede alle nye kunder to gange — tjek igen
      // umiddelbart før indsættelse (dubletter blev kun beregnet én gang før løkken)
      if (v.email) {
        const { escapeLike } = await import('@/lib/validations/postgrest-filter')
        const { data: exists } = await ctx.supabase.from('customers').select('id').ilike('email', escapeLike(String(v.email))).limit(1).maybeSingle()
        if (exists) { lateDuplicates += 1; continue }
      }
      const { data, error } = await insertCustomerWithRetry(ctx.supabase, (customerNumber) => ({
        customer_number: customerNumber,
        company_name: v.company_name,
        contact_person: v.contact_person ?? v.company_name,
        email: v.email,
        phone: v.phone ?? null,
        mobile: v.mobile ?? null,
        vat_number: v.vat_number ?? null,
        billing_address: v.billing_address ?? null,
        billing_postal_code: v.billing_postal_code ?? null,
        billing_city: v.billing_city ?? null,
        billing_country: 'Danmark',
        notes: v.notes ?? null,
        tags: [],
        is_active: true,
        created_by: ctx.userId,
        custom_fields: { source: 'csv-import', import_batch: batch, ...(v.external_number ? { import_customer_number: v.external_number } : {}) },
      }), { label: 'importCustomers' })
      if (data && !error) {
        created += 1
        // som "Opret kunde": tidligere mails fra kundens adresse kobles (egne/system-adresser springes over)
        await linkUnlinkedEmailsFromAddress(ctx.supabase, (data as { id: string }).id, v.email)
      } else { failed += 1; logger.warn('importCustomers: række fejlede', { metadata: { line: r.line, code: error?.code } }) }
    }
    try {
      const { createAuditLog } = await import('@/lib/actions/audit')
      await createAuditLog({ entity_type: 'customer', entity_id: ctx.userId, entity_name: 'CSV-import', action: 'create',
        action_description: `Kundeimport: ${created} oprettet, ${classified.length - toCreate.length} sprunget over, ${failed} fejlede`,
        metadata: { created, skipped: classified.length - toCreate.length, failed, batch } })
    } catch { /* best-effort */ }
    revalidatePath('/dashboard/customers')
    return { success: true, data: { created, skipped: classified.length - toCreate.length + lateDuplicates, failed } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Import fejlede') }
  }
}
