'use server'

/**
 * "Opsætning før pilot" — skrivebeskyttet tjekliste over drift-opsætning der
 * påvirker kunder/medarbejdere direkte (fundet under overnight-runnet
 * 2026-10-01). Kun ja/nej og antal — aldrig værdier eller hemmeligheder.
 * Kun admin; data læses via service-role efter gaten.
 */

import { leadSourceEmailIds } from '@/lib/leads/source-email'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { invoiceBankInfo } from '@/lib/invoices/bank-info'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

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

  const [companyRes, montorRes, employeeRes, billedRes] = await Promise.all([
    admin.from('company_settings').select('company_name, company_vat_number, bank_reg_no, bank_account').limit(1).maybeSingle(),
    // Pilot-review 2026-10-14 (P-4): kun aktive logins (en deaktiveret montør gav falsk alarm)
    admin.from('profiles').select('id').eq('role', 'montør').eq('is_active', true),
    admin.from('employees').select('profile_id').not('profile_id', 'is', null),
    // side for side (før .limit(5000) → højst 1.000 fakturaer)
    fetchAllRows<{ id: string; customer_id: string }>((from, to) => admin.from('invoices').select('id, customer_id').in('status', ['sent', 'paid'])
      .is('external_invoice_id', null).not('customer_id', 'is', null).order('id').range(from, to)).then((data) => ({ data })),
  ])

  const company = companyRes.data
  const montorProfiles = montorRes.data
  const employees = employeeRes.data
  const billed = billedRes.data
  const cs = company as { company_name?: string | null; company_vat_number?: string | null; bank_reg_no?: string | null; bank_account?: string | null } | null
  const bank = invoiceBankInfo(cs)

  const montorLookupFailed = Boolean(montorRes.error || employeeRes.error)
  const linked = new Set(((employees ?? []) as Array<{ profile_id: string }>).map((e) => e.profile_id))
  const montorIds = ((montorProfiles ?? []) as Array<{ id: string }>).map((p) => p.id)
  const unlinkedMontors = montorIds.filter((id) => !linked.has(id)).length

  const billedIds = [...new Set(((billed ?? []) as Array<{ customer_id: string }>).map((b) => b.customer_id))]
  let unlinkedCustomers = 0
  let customerLinkFailed = false
  for (let i = 0; i < billedIds.length; i += 200) {
    const { count, error } = await admin
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .in('id', billedIds.slice(i, i + 200))
      .or('external_provider.is.null,external_provider.neq.economic,external_customer_id.is.null')
    if (error) { customerLinkFailed = true; break }
    unlinkedCustomers += count ?? 0
  }

  // Pilot-review 2026-10-14 (P-4): selvregistrering (offentlig Auth-indstilling — ingen hemmeligheder)
  const signup = await readSelfSignupEnabled()
  const { isGraphConfigured } = await import('@/lib/services/microsoft-graph')
  const graphOk = isGraphConfigured()
  const appUrlOk = /^https:\/\/[^\s/]+/.test(process.env.NEXT_PUBLIC_APP_URL ?? '')

  const items: PilotSetupItem[] = [
    {
      key: 'self_signup',
      label: 'Selvregistrering slået fra',
      ok: signup === false,
      detail: signup === null
        ? 'Kunne ikke læses'
        : signup
          ? 'Alle med app-adressen kan oprette en bruger (standardrolle montør) og læse kundedata'
          : 'Kun inviterede brugere kan logge ind',
      fixHint: 'Supabase → Authentication → Sign In / Providers → slå "Allow new users to sign up" fra (docs/runbooks/supabase-disable-signup.md)',
    },
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
      ok: !montorLookupFailed && unlinkedMontors === 0,
      detail: montorLookupFailed
        ? 'Kunne ikke tælle montør-logins. Det tælles ikke som 0.'
        : unlinkedMontors === 0
        ? `${montorIds.length} montør-login(s), alle koblet`
        : `${unlinkedMontors} af ${montorIds.length} montør-login(s) er ikke koblet — de ser ingen job og kan ikke registrere tid`,
      fixHint: 'Medarbejdere → Rediger → Login → "Knyt eksisterende bruger"',
      href: '/dashboard/employees',
    },
    {
      key: 'economic_customers',
      label: 'Fakturerede kunder koblet til e-conomic',
      ok: !customerLinkFailed && unlinkedCustomers === 0,
      detail: customerLinkFailed
        ? 'Kunne ikke tælle kunder uden e-conomic. Det tælles ikke som 0.'
        : unlinkedCustomers === 0
        ? 'alle kunder med sendte fakturaer er koblet'
        : `${unlinkedCustomers} kunde(r) med sendte fakturaer er ikke koblet — ville blive oprettet som nye debitorer ved eksport`,
      fixHint: 'Kundekort → Fakturaer → e-conomic-kundenr. (findes kunden allerede i e-conomic)',
      href: '/dashboard/settings/economic',
    },
    // R-7 (pilot-review 2026-10-15): uden disse virker invitationer/nulstil adgangskode ikke — kun ja/nej, aldrig værdier
    {
      key: 'graph_mail',
      label: 'Mail-afsendelse (Microsoft Graph) konfigureret',
      ok: graphOk,
      detail: graphOk ? 'mails til kunder og medarbejdere kan sendes' : 'nulstil adgangskode, adgangsmails og tilbuds-/fakturamails kan IKKE sendes (brugeren får alligevel "E-mail sendt")',
      fixHint: 'Vercel-env: Microsoft Graph (tenant/klient/secret) — se .env.example',
    },
    {
      key: 'app_url',
      label: 'App-adresse sat (links i mails)',
      ok: appUrlOk,
      detail: appUrlOk ? 'links i invitationer og nulstil-mails peger på appen' : 'NEXT_PUBLIC_APP_URL mangler eller er ikke en https-adresse — links i mails virker ikke',
      fixHint: 'Vercel-env NEXT_PUBLIC_APP_URL = https://<appens adresse>',
    },
  ]

  // Driftskøer fundet 2026-10-04 (N41/N50/N57/N58) — kun antal
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const [portalUnread, mailInvoicesNoFile, aoFresh, newCases, invoicesNoSupplier, webInquiries, placeholderCustomers] = await Promise.all([
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
    // N74/N80: aktive kunder uden rigtig e-mail (pladsholder fra mail-automatikken) — kan ikke modtage tilbud/faktura
    admin.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true).ilike('email', '%@elta-crm.local'),
  ])
  const webFailed = Boolean(webInquiries.error)
  const webIds = webFailed ? [] : ((webInquiries.data ?? []) as Array<{ id: string }>).map((w) => w.id)
  let openWeb = 0
  if (webIds.length) {
    const withLead = await leadSourceEmailIds(admin)
    openWeb = webIds.filter((id) => !withLead.has(id)).length
  }
  // Frisk = mindst én vare opdateret inden for 60 dage (eksistens-tjek stopper ved første match: ~50–80 ms i prod;
  // "seneste updated_at" sorterede 322k LM-varer og tog 4 s)
  const staleSuppliers: string[] = []
  let pricesFailed = Boolean(aoFresh.error)
  const freshCutoff = new Date(Date.now() - 60 * 86_400_000).toISOString()
  if (!aoFresh.error) {
    for (const sp of (aoFresh.data ?? []) as Array<{ id: string; code: string }>) {
      const [totalRes, freshRes] = await Promise.all([
        admin.from('supplier_products').select('id', { count: 'estimated', head: true }).eq('supplier_id', sp.id),
        admin.from('supplier_products').select('id').eq('supplier_id', sp.id).gt('updated_at', freshCutoff).limit(1),
      ])
      if (totalRes.error || freshRes.error) { pricesFailed = true; continue }
      if ((totalRes.count ?? 0) > 0 && (freshRes.data ?? []).length === 0) staleSuppliers.push(sp.code)
    }
  }
  const casesFailed = Boolean(newCases.error)
  const newWithWork = casesFailed ? 0 : ((newCases.data ?? []) as Array<{ work_orders: Array<{ status: string }> | null }>)
    .filter((c) => (c.work_orders ?? []).some((w) => w.status === 'in_progress' || w.status === 'done')).length
  items.push(
    {
      key: 'portal_unread',
      label: 'Kundebeskeder fra portalen besvaret',
      ok: !portalUnread.error && (portalUnread.count ?? 0) === 0,
      detail: portalUnread.error ? 'Kunne ikke tælle kundebeskeder. Det tælles ikke som 0.' : (portalUnread.count ?? 0) === 0 ? 'ingen ulæste kundebeskeder' : `${portalUnread.count} ulæste kundebesked(er) — kunder venter på svar`,
      fixHint: 'Dashboard → "Kundebeskeder (portal)" → åbn kundens chat',
      href: '/dashboard',
    },
    {
      key: 'invoice_attachments',
      label: 'Mail-leverandørfakturaer har bilag',
      ok: !mailInvoicesNoFile.error && (mailInvoicesNoFile.count ?? 0) === 0,
      detail: mailInvoicesNoFile.error ? 'Kunne ikke tælle mail-fakturaer. Det tælles ikke som 0.' : (mailInvoicesNoFile.count ?? 0) === 0 ? 'alle mail-fakturaer har bilag' : `${mailInvoicesNoFile.count} mail-faktura(er) uden bilag — kan ikke læses/kontrolleres`,
      fixHint: 'Vercel-env INVOICE_ATTACHMENT_FETCH_ENABLED=true (henter automatisk) — eller "Vedhæft PDF fra mailen" på fakturaen',
      href: '/dashboard/incoming-invoices',
    },
    {
      key: 'supplier_prices',
      label: 'Leverandørpriser opdateret (< 60 dage)',
      ok: !pricesFailed && staleSuppliers.length === 0,
      detail: pricesFailed ? 'Kunne ikke tjekke leverandørpriser. Det tælles ikke som friske.' : staleSuppliers.length === 0 ? 'alle aktive leverandørers priser er friske' : `forældede prislister: ${staleSuppliers.join(', ')} — tilbud kan få forkerte kostpriser`,
      fixHint: 'Indstillinger → Leverandører → Importér prisfil (eller aktivér synkronisering)',
      href: '/dashboard/settings/suppliers',
    },
    {
      key: 'invoice_suppliers',
      label: 'Leverandørfakturaer har leverandør',
      ok: !invoicesNoSupplier.error && (invoicesNoSupplier.count ?? 0) === 0,
      detail: invoicesNoSupplier.error ? 'Kunne ikke tælle leverandørfakturaer. Det tælles ikke som 0.' : (invoicesNoSupplier.count ?? 0) === 0 ? 'alle åbne leverandørfakturaer er koblet' : `${invoicesNoSupplier.count} åben(e) leverandørfaktura(er) uden leverandør`,
      fixHint: 'Leverandørfaktura → "Vælg leverandør" / "Opret ny" (kobler også de øvrige fra samme afsender); privat afsender → filteret "Ikke en faktura?"',
      href: '/dashboard/incoming-invoices',
    },
    {
      key: 'web_inquiries',
      label: 'Webhenvendelser fulgt op (90 dage)',
      ok: !webFailed && openWeb === 0,
      detail: webFailed ? 'Kunne ikke tælle henvendelser. Det tælles ikke som 0.' : openWeb === 0 ? 'alle henvendelser fra hjemmesiden har kunde eller lead' : `${openWeb} henvendelse(r) fra hjemmesiden uden kunde eller lead`,
      fixHint: 'Dashboard → "Henvendelser fra hjemmesiden" → "Opret lead"',
      href: '/dashboard',
    },
    {
      key: 'customer_emails',
      label: 'Aktive kunder har en rigtig e-mail',
      ok: !placeholderCustomers.error && (placeholderCustomers.count ?? 0) === 0,
      detail: placeholderCustomers.error ? 'Kunne ikke tælle kunder uden e-mail. Det tælles ikke som 0.' : (placeholderCustomers.count ?? 0) === 0 ? 'alle aktive kunder har e-mail' : `${placeholderCustomers.count} aktiv(e) kunde(r) oprettet fra mail uden e-mail — kan ikke modtage tilbud/faktura`,
      fixHint: 'Kunder → "Oprettet fra mail" → ret e-mail eller deaktivér (leverandører/dubletter)',
      href: '/dashboard/customers?origin=auto',
    },
    {
      key: 'case_status',
      label: 'Sagsstatus følger arbejdet',
      ok: !casesFailed && newWithWork === 0,
      detail: casesFailed ? 'Kunne ikke tælle sager. Det tælles ikke som 0.' : newWithWork === 0 ? 'ingen sager står som Ny med igangværende arbejde' : `${newWithWork} sag(er) står som Ny, men har startet/udført arbejde`,
      fixHint: 'Åbn sagen → "Sæt til I gang"',
      href: '/dashboard/orders',
    },
  )
  return { ok: true, items }
}

/** true = selvregistrering slået TIL, false = fra, null = ukendt. Læser den offentlige Auth-indstilling (anon-nøglen). */
async function readSelfSignupEnabled(): Promise<boolean | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) return null
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: anon }, cache: 'no-store' })
    if (!res.ok) return null
    const body = (await res.json()) as { disable_signup?: boolean }
    return typeof body.disable_signup === 'boolean' ? !body.disable_signup : null
  } catch {
    return null
  }
}
