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

  // Driftskøer fundet 2026-10-04 (N41/N50/N57/N58) — kun antal
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const [portalUnread, mailInvoicesNoFile, aoFresh, newCases, invoicesNoSupplier, webInquiries] = await Promise.all([
    admin.from('portal_messages').select('id', { count: 'exact', head: true }).eq('sender_type', 'customer').is('read_at', null),
    admin.from('incoming_invoices').select('id', { count: 'exact', head: true }).eq('source', 'email').is('file_url', null)
      .not('status', 'in', '(approved,posted,rejected,cancelled)'),
    admin.from('suppliers').select('id, code').eq('is_active', true).limit(20),
    admin.from('service_cases').select('id, work_orders(status)').eq('status', 'new').limit(500),
    // N66: åbne leverandørfakturaer uden leverandør (kan ikke bogføres/kontrolleres mod leverandøren)
    admin.from('incoming_invoices').select('id', { count: 'exact', head: true }).is('supplier_id', null)
      .not('status', 'in', '(approved,posted,rejected,cancelled)'),
    // N67: webhenvendelser (90 d) uden kunde — lead-tjek sker nedenfor
    admin.from('incoming_emails').select('id').ilike('sender_email', '%@formsubmit.co').ilike('subject', '%henvendelse%')
      .is('customer_id', null).eq('is_archived', false).gte('received_at', since90).limit(500),
  ])
  const webIds = ((webInquiries.data ?? []) as Array<{ id: string }>).map((w) => w.id)
  let openWeb = 0
  if (webIds.length) {
    const { data: leads } = await admin.from('leads').select('custom_fields').not('custom_fields->>source_email_id', 'is', null).limit(5000)
    const withLead = new Set(((leads ?? []) as Array<{ custom_fields: { source_email_id?: string } | null }>).map((l) => l.custom_fields?.source_email_id))
    openWeb = webIds.filter((id) => !withLead.has(id)).length
  }
  // Frisk = mindst én vare opdateret inden for 60 dage (eksistens-tjek stopper ved første match: ~50–80 ms i prod;
  // "seneste updated_at" sorterede 322k LM-varer og tog 4 s)
  const staleSuppliers: string[] = []
  const freshCutoff = new Date(Date.now() - 60 * 86_400_000).toISOString()
  for (const sp of (aoFresh.data ?? []) as Array<{ id: string; code: string }>) {
    const [{ count: total }, { data: fresh }] = await Promise.all([
      admin.from('supplier_products').select('id', { count: 'estimated', head: true }).eq('supplier_id', sp.id),
      admin.from('supplier_products').select('id').eq('supplier_id', sp.id).gt('updated_at', freshCutoff).limit(1),
    ])
    if ((total ?? 0) > 0 && (fresh ?? []).length === 0) staleSuppliers.push(sp.code)
  }
  const newWithWork = ((newCases.data ?? []) as Array<{ work_orders: Array<{ status: string }> | null }>)
    .filter((c) => (c.work_orders ?? []).some((w) => w.status === 'in_progress' || w.status === 'done')).length
  items.push(
    {
      key: 'portal_unread',
      label: 'Kundebeskeder fra portalen besvaret',
      ok: (portalUnread.count ?? 0) === 0,
      detail: (portalUnread.count ?? 0) === 0 ? 'ingen ulæste kundebeskeder' : `${portalUnread.count} ulæste kundebesked(er) — kunder venter på svar`,
      fixHint: 'Dashboard → "Kundebeskeder (portal)" → åbn kundens chat',
      href: '/dashboard',
    },
    {
      key: 'invoice_attachments',
      label: 'Mail-leverandørfakturaer har bilag',
      ok: (mailInvoicesNoFile.count ?? 0) === 0,
      detail: (mailInvoicesNoFile.count ?? 0) === 0 ? 'alle mail-fakturaer har bilag' : `${mailInvoicesNoFile.count} mail-faktura(er) uden bilag — kan ikke læses/kontrolleres`,
      fixHint: 'Vercel-env INVOICE_ATTACHMENT_FETCH_ENABLED=true (henter automatisk) — eller "Vedhæft PDF fra mailen" på fakturaen',
      href: '/dashboard/incoming-invoices',
    },
    {
      key: 'supplier_prices',
      label: 'Leverandørpriser opdateret (< 60 dage)',
      ok: staleSuppliers.length === 0,
      detail: staleSuppliers.length === 0 ? 'alle aktive leverandørers priser er friske' : `forældede prislister: ${staleSuppliers.join(', ')} — tilbud kan få forkerte kostpriser`,
      fixHint: 'Indstillinger → Leverandører → Importér prisfil (eller aktivér synkronisering)',
      href: '/dashboard/settings/suppliers',
    },
    {
      key: 'invoice_suppliers',
      label: 'Leverandørfakturaer har leverandør',
      ok: (invoicesNoSupplier.count ?? 0) === 0,
      detail: (invoicesNoSupplier.count ?? 0) === 0 ? 'alle åbne leverandørfakturaer er koblet' : `${invoicesNoSupplier.count} åben(e) leverandørfaktura(er) uden leverandør`,
      fixHint: 'Leverandørfaktura → "Vælg leverandør" / "Opret ny" (kobler også de øvrige fra samme afsender); privat afsender → filteret "Ikke en faktura?"',
      href: '/dashboard/incoming-invoices',
    },
    {
      key: 'web_inquiries',
      label: 'Webhenvendelser fulgt op (90 dage)',
      ok: openWeb === 0,
      detail: openWeb === 0 ? 'alle henvendelser fra hjemmesiden har kunde eller lead' : `${openWeb} henvendelse(r) fra hjemmesiden uden kunde eller lead`,
      fixHint: 'Dashboard → "Henvendelser fra hjemmesiden" → "Opret lead"',
      href: '/dashboard',
    },
    {
      key: 'case_status',
      label: 'Sagsstatus følger arbejdet',
      ok: newWithWork === 0,
      detail: newWithWork === 0 ? 'ingen sager står som Ny med igangværende arbejde' : `${newWithWork} sag(er) står som Ny, men har startet/udført arbejde`,
      fixHint: 'Åbn sagen → "Sæt til I gang"',
      href: '/dashboard/orders',
    },
  )
  return { ok: true, items }
}
