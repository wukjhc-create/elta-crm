'use server'

/**
 * "Opsætning før pilot" — skrivebeskyttet tjekliste over drift-opsætning der
 * påvirker kunder/medarbejdere direkte (fundet under overnight-runnet
 * 2026-10-01). Kun ja/nej og antal — aldrig værdier eller hemmeligheder.
 * Kun admin; data læses via service-role efter gaten.
 */

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { invoiceBankInfo } from '@/lib/invoices/bank-info'

export interface PilotSetupItem {
  key: string
  label: string
  ok: boolean
  detail: string
  /** hvor det rettes */
  fixHint: string
  href?: string
}

export async function getPilotSetupChecklistAction(): Promise<{ ok: true; items: PilotSetupItem[] } | { ok: false; message: string }> {
  const { role } = await getAuthenticatedClientWithRole()
  if (role !== 'admin') return { ok: false, message: 'Kun admin' }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const [{ data: company }, { data: montorProfiles }, { data: employees }, { data: billed }] = await Promise.all([
    admin.from('company_settings').select('company_name, company_vat_number, bank_reg_no, bank_account').limit(1).maybeSingle(),
    admin.from('profiles').select('id').eq('role', 'montør'),
    admin.from('employees').select('profile_id').not('profile_id', 'is', null),
    admin.from('invoices').select('customer_id').in('status', ['sent', 'paid']).is('external_invoice_id', null).not('customer_id', 'is', null).limit(5000),
  ])

  const cs = company as { company_name?: string | null; company_vat_number?: string | null; bank_reg_no?: string | null; bank_account?: string | null } | null
  const bank = invoiceBankInfo(cs)

  const linked = new Set(((employees ?? []) as Array<{ profile_id: string }>).map((e) => e.profile_id))
  const montorIds = ((montorProfiles ?? []) as Array<{ id: string }>).map((p) => p.id)
  const unlinkedMontors = montorIds.filter((id) => !linked.has(id)).length

  const billedIds = [...new Set(((billed ?? []) as Array<{ customer_id: string }>).map((b) => b.customer_id))]
  let unlinkedCustomers = 0
  for (let i = 0; i < billedIds.length; i += 200) {
    const { count } = await admin
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .in('id', billedIds.slice(i, i + 200))
      .or('external_provider.is.null,external_provider.neq.economic,external_customer_id.is.null')
    unlinkedCustomers += count ?? 0
  }

  const items: PilotSetupItem[] = [
    {
      key: 'company',
      label: 'Firmaoplysninger på tilbud og fakturaer',
      ok: !!cs?.company_name?.trim() && !!cs?.company_vat_number?.trim(),
      detail: cs ? `${cs.company_name?.trim() ? 'navn ✓' : 'navn mangler'} · ${cs.company_vat_number?.trim() ? 'CVR ✓' : 'CVR mangler'}` : 'ingen firmaindstillinger',
      fixHint: 'Indstillinger → Firma',
      href: '/dashboard/settings/company',
    },
    {
      key: 'bank',
      label: 'Bankoplysninger på kundefakturaer',
      ok: bank.configured,
      detail: bank.configured ? 'reg.nr. og konto vises på fakturaen' : 'fakturaen viser "Bankoplysninger er ikke konfigureret"',
      fixHint: 'Indstillinger → Firma (reg.nr. + konto) — eller Vercel-env INVOICE_BANK_REG_NO / INVOICE_BANK_ACCOUNT',
      href: '/dashboard/settings/company',
    },
    {
      key: 'montors',
      label: 'Montør-logins koblet til medarbejder',
      ok: unlinkedMontors === 0,
      detail: unlinkedMontors === 0
        ? `${montorIds.length} montør-login(s), alle koblet`
        : `${unlinkedMontors} af ${montorIds.length} montør-login(s) er ikke koblet — de ser ingen job og kan ikke registrere tid`,
      fixHint: 'Medarbejdere → Rediger → Login → "Knyt eksisterende bruger"',
      href: '/dashboard/employees',
    },
    {
      key: 'economic_customers',
      label: 'Fakturerede kunder koblet til e-conomic',
      ok: unlinkedCustomers === 0,
      detail: unlinkedCustomers === 0
        ? 'alle kunder med sendte fakturaer er koblet'
        : `${unlinkedCustomers} kunde(r) med sendte fakturaer er ikke koblet — ville blive oprettet som nye debitorer ved eksport`,
      fixHint: 'Kundekort → Fakturaer → e-conomic-kundenr. (findes kunden allerede i e-conomic)',
      href: '/dashboard/settings/economic',
    },
  ]
  return { ok: true, items }
}
