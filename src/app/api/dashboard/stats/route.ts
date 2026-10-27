/**
 * GET /api/dashboard/stats
 *
 * Operational overview for the main dashboard. Auth: must be a logged-in
 * user (RLS handles the rest). Returns stats + list views + system
 * health rollup in one round-trip so the client only polls this single
 * endpoint.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { copenhagenParts, copenhagenLocalToIso, calendarDaysSince } from '@/lib/utils/copenhagen-time'
import { logger } from '@/lib/utils/logger'
import { getUserRoleForPage } from '@/lib/auth/page-guard'
import type { UserRole } from '@/types/auth.types'

export const dynamic = 'force-dynamic'

const OPS_ROLES: UserRole[] = ['admin', 'serviceleder', 'bogholderi'] as UserRole[]

interface DashboardStats {
  generated_at: string
  /** PM2-1/PM2-4: hvilke moduler brugeren må se — UI skjuler kort/links uden ret (data er også tom på serveren) */
  access: { inbox: boolean; offers: boolean; bank: boolean }
  counts: {
    new_emails_last_24h: number
    new_customers_last_24h: number
    open_cases: number
    offers_draft: number
    invoices_sent: number
    invoices_overdue: number
    payments_today: number
    system_errors_last_hour: number
  }
  latest_emails: Array<{
    id: string
    subject: string | null
    sender_name: string | null
    sender_email: string | null
    received_at: string
    customer_id: string | null
  }>
  latest_invoices: Array<{
    id: string
    invoice_number: string
    final_amount: number
    currency: string
    status: string
    payment_status: string
    created_at: string
  }>
  overdue_invoices: Array<{
    id: string
    invoice_number: string
    final_amount: number
    currency: string
    due_date: string | null
    days_overdue: number
    customer_id: string | null
  }>
  system_health: {
    overall: 'ok' | 'warning' | 'error'
    services: Array<{
      service: string
      status: 'ok' | 'warning' | 'error'
      errorsLastHour: number
      warningsLastHour: number
      lastErrorMessage: string | null
    }>
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const __offerOr = await (await import('@/lib/offers/offer-scope')).currentOfferScopeOr() // API-2: salg kun egne tilbud
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const sinceHour = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    // Dansk kalenderdag (før: UTC-dato → betalinger 00–02 dansk tid på forkert dag)
    const todayDateIso = copenhagenParts(now).date
    const tomorrow = new Date(`${todayDateIso}T12:00:00Z`)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    const todayStart = copenhagenLocalToIso(todayDateIso, '00:00')
    const todayEnd = new Date(new Date(copenhagenLocalToIso(tomorrow.toISOString().slice(0, 10), '00:00')).getTime() - 1).toISOString()

    // All counts run in parallel; each one falls back to 0 on error
    // so a single missing table never breaks the whole dashboard.
    // Supabase query builders are thenable but not Promises by type.
    // We coerce via `then` to a count to keep TS happy and the call
    // sites compact.
    const safe = async (
      p: PromiseLike<{ count: number | null }>
    ): Promise<number> => {
      try { return (await p).count ?? 0 } catch { return 0 }
    }

    // PM2-1 (rolle-review 2026-10-18; Henrik: al postkasse-afledt data kræver inbox.view): seneste mails OG antallet af
    // nye mails kun med inbox.view (RLS lader salg læse alle mails)
    const { hasPermission } = await import('@/lib/auth/permissions')
    const canSeeInbox = hasPermission(await getUserRoleForPage(), 'inbox.view')
    // 00240-F1 (Henrik 2026-10-27): fakturatal kræver invoices.view.all — ELLER own_cases + sagen i brugerens effektive
    // sags-scope. Før: ingen tilladelse tjekket, kun RLS (salg: created_by). Uden 'all' beregnes tallene af de scopede
    // fakturaer (scopedInvoiceStats) i stedet for de globale forespørgsler nedenfor.
    const { getAuthenticatedClientWithRole } = await import('@/lib/actions/action-helpers')
    const authCtx = await getAuthenticatedClientWithRole()
    const { invoiceCaseScope } = await import('@/lib/invoices/invoice-scope')
    const invScope = await invoiceCaseScope({ supabase, userId: authCtx.userId, role: authCtx.role, hasPermission: authCtx.hasPermission })
    const globalInvoices = invScope.type === 'all'
    const scopedInv = globalInvoices ? null : await scopedInvoiceStats(invScope, supabase, todayDateIso, todayStart, todayEnd)
    const [
      newEmails,
      newCustomers,
      openCases,
      offersDraft,
      invoicesSent,
      invoicesOverdueHead,
      paymentsToday,
      systemErrors,
    ] = await Promise.all([
      canSeeInbox
        ? safe(supabase.from('incoming_emails').select('id', { count: 'exact', head: true })
          .gte('received_at', since24h))
        : Promise.resolve(0),
      safe(supabase.from('customers').select('id', { count: 'exact', head: true })
        .gte('created_at', since24h)),
      // DB-6 (dashboard-review 2026-10-18): 'completed' findes ikke — konverterede sager talte med (cockpittet udelader dem)
      // DB-15b (dashboard-review 2026-10-19): som cockpittet (DB-1) — uden cases.view.all kun egne sager
      (async () => {
        const { getAuthenticatedClientWithRole } = await import('@/lib/actions/action-helpers')
        const ctx = await getAuthenticatedClientWithRole()
        const base = () => supabase.from('service_cases').select('id', { count: 'exact', head: true })
          .not('status', 'in', '("closed","converted")').eq('is_proposal', false)
        if (ctx.hasPermission('cases.view.all')) return safe(base())
        const { getCaseScope } = await import('@/lib/auth/case-scope')
        const scope = await getCaseScope({ role: ctx.role, userId: ctx.userId, supabase })
        if (scope.type === 'all') return safe(base())
        let n = 0
        for (let k = 0; k < scope.caseIds.length; k += 200) n += await safe(base().in('id', scope.caseIds.slice(k, k + 200)))
        return n
      })().catch(() => 0),
      safe(supabase.from('offers').select('id', { count: 'exact', head: true }).or(__offerOr)
        .eq('status', 'draft')
        .eq('is_proposal', false)),
      scopedInv ? Promise.resolve(scopedInv.sent) : safe(supabase.from('invoices').select('id', { count: 'exact', head: true })
        .eq('status', 'sent')),
      // Forfalden = forfaldsdato FØR i dag, ikke kreditnota/annulleret (samme regel som fakturalisten)
      scopedInv ? Promise.resolve(0) : safe(supabase.from('invoices').select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .neq('payment_status', 'paid')
        .neq('invoice_type', 'credit')
        .is('voided_at', null)
        .lt('due_date', todayDateIso)),
      scopedInv ? Promise.resolve(scopedInv.paymentsToday) : safe(supabase.from('invoice_payments').select('id', { count: 'exact', head: true })
        .gte('recorded_at', todayStart)
        .lte('recorded_at', todayEnd)),
      safe(supabase.from('system_health_log').select('id', { count: 'exact', head: true })
        .eq('status', 'error')
        .gte('created_at', sinceHour)),
    ])

    // List views — independently safe.
    const { fetchAllRows } = await import('@/lib/supabase/fetch-all')
    const [latestEmailsRes, latestInvoicesRes, overdueRes] = await Promise.all([
      canSeeInbox
        ? supabase
          .from('incoming_emails')
          .select('id, subject, sender_name, sender_email, received_at, customer_id')
          .order('received_at', { ascending: false })
          .limit(8)
        : Promise.resolve({ data: [] as Array<{ id: string; subject: string | null; sender_name: string | null; sender_email: string; received_at: string; customer_id: string | null }> }),
      scopedInv ? Promise.resolve({ data: scopedInv.latest }) : supabase
        .from('invoices')
        .select('id, invoice_number, final_amount, currency, status, payment_status, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
      // DB-6 (dashboard-review 2026-10-18): alle forfaldne (side for side) — tallet talte før også fuldt krediterede
      // fakturaer med, og listen blev filtreret efter .limit(10), så den kunne vise færre end der var
      scopedInv ? Promise.resolve({ data: scopedInv.overdue, ok: true }) : fetchAllRows<{ id: string; invoice_number: string; final_amount: number; amount_paid: number; currency: string | null; due_date: string | null; customer_id: string | null }>((from, to) => supabase
        .from('invoices')
        .select('id, invoice_number, final_amount, amount_paid, currency, due_date, customer_id')
        .eq('status', 'sent')
        .neq('payment_status', 'paid')
        .neq('invoice_type', 'credit')
        .is('voided_at', null)
        .lt('due_date', todayDateIso)
        .order('due_date', { ascending: true }).order('id')
        .range(from, to)).then((data) => ({ data, ok: true }), () => ({ data: [] as never[], ok: false })),
    ])

    // Rapport-review 2026-10-09 (#1): vist beløb = åbent beløb (− betalt − kreditnotaer); fuldt dækkede udelades
    const { creditedByOriginal, openAmount } = await import('@/lib/invoices/open-amount')
    const overdueRows = overdueRes.data ?? []
    const credited = await creditedByOriginal(scopedInv?.reader ?? supabase, overdueRows.map((r) => r.id as string)).catch(() => new Map<string, number>())
    // DB-6: samme regler som cockpittet/Fakturaøkonomi — kun DKK, åbent beløb ≥ 0,50 (FIN-11)
    const overdueOpen = overdueRows.filter((r) => String(r.currency ?? 'DKK').toUpperCase() === 'DKK'
      && openAmount(r as { id: string; final_amount: number; amount_paid: number }, credited) >= 0.5)
    const invoicesOverdue = overdueRes.ok ? overdueOpen.length : invoicesOverdueHead
    const overdue_invoices = overdueOpen.slice(0, 10).map((r) => {
      const daysOverdue = r.due_date ? Math.max(0, calendarDaysSince(String(r.due_date), now)) : 0
      return {
        id: r.id,
        invoice_number: r.invoice_number,
        final_amount: openAmount(r as { id: string; final_amount: number; amount_paid: number }, credited),
        currency: r.currency || 'DKK',
        due_date: r.due_date,
        days_overdue: daysOverdue,
        customer_id: r.customer_id,
      }
    })

    // System health — already safely-fallbacked internally.
    // Cron-review 2026-10-09 (#7): driftsloggen (postkasser, bank-id'er, modtagerlister) kun for samme roller som
    // system_alerts (admin/serviceleder/bogholderi); øvrige får en tom oversigt
    const role = await getUserRoleForPage()
    const canSeeOps = OPS_ROLES.includes(role)
    let systemHealth: DashboardStats['system_health'] = { overall: 'ok', services: [] }
    if (canSeeOps) try {
      const { getSystemHealth } = await import('@/lib/services/system-health')
      const snap = await getSystemHealth()
      systemHealth = {
        overall: snap.overall,
        services: snap.services.map((s) => ({
          service: s.service,
          status: s.status,
          errorsLastHour: s.errorsLastHour,
          warningsLastHour: s.warningsLastHour,
          lastErrorMessage: s.lastErrorMessage,
        })),
      }
    } catch { /* ignore */ }

    const statsRole = await getUserRoleForPage()
    const canSeeOffers = hasPermission(statsRole, 'offers.view')
    const payload: DashboardStats = {
      generated_at: now.toISOString(),
      access: { inbox: canSeeInbox, offers: canSeeOffers, bank: hasPermission(statsRole, 'bank.view') },
      counts: {
        new_emails_last_24h: newEmails,
        new_customers_last_24h: newCustomers,
        open_cases: openCases,
        // PM2-4: tilbudstal kun med offers.view
        offers_draft: canSeeOffers ? offersDraft : 0,
        invoices_sent: invoicesSent,
        invoices_overdue: invoicesOverdue,
        payments_today: paymentsToday,
        system_errors_last_hour: canSeeOps ? systemErrors : 0,
      },
      latest_emails: (latestEmailsRes.data ?? []).map((r) => ({
        id: r.id,
        subject: r.subject,
        sender_name: r.sender_name,
        sender_email: r.sender_email,
        received_at: r.received_at,
        customer_id: r.customer_id,
      })),
      latest_invoices: (latestInvoicesRes.data ?? []).map((r) => ({
        id: r.id,
        invoice_number: r.invoice_number,
        final_amount: Number(r.final_amount) || 0,
        currency: r.currency || 'DKK',
        status: r.status,
        payment_status: r.payment_status,
        created_at: r.created_at,
      })),
      overdue_invoices,
      system_health: systemHealth,
    }

    return NextResponse.json(payload)
  } catch (err) {
    logger.error('dashboard/stats failed', { error: err instanceof Error ? err : new Error(String(err)) })
    // API-7 (review 2026-10-17): ingen rå database-fejltekst til klienten (detaljen står i loggen)
    return NextResponse.json({ error: 'Kunne ikke hente nøgletal' }, { status: 500 })
  }
}

type ScopedInvoiceRow = { id: string; invoice_number: string; final_amount: number; amount_paid: number; currency: string | null; status: string; payment_status: string; invoice_type: string | null; voided_at: string | null; due_date: string | null; created_at: string; customer_id: string | null; case_id: string | null }

/**
 * 00240-F1: dashboardets fakturatal for brugere UDEN invoices.view.all — kun fakturaer på sager i scopet (admin-læsning
 * afgrænset til scope-sagerne; RLS ville skære salg ned til created_by). Samme regler som de globale forespørgsler.
 */
async function scopedInvoiceStats(
  scope: Exclude<Awaited<ReturnType<typeof import('@/lib/invoices/invoice-scope').invoiceCaseScope>>, { type: 'all' }>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  todayDateIso: string,
  todayStart: string,
  todayEnd: string,
) {
  const { invoiceReader, invoiceInScope } = await import('@/lib/invoices/invoice-scope')
  const { fetchAllRows } = await import('@/lib/supabase/fetch-all')
  const { IN_CHUNK_SIZE } = await import('@/lib/supabase/in-chunks')
  const reader = invoiceReader(scope, supabase)
  const cols = 'id, invoice_number, final_amount, amount_paid, currency, status, payment_status, invoice_type, voided_at, due_date, created_at, customer_id, case_id'
  let rows: ScopedInvoiceRow[] = []
  if (scope.type === 'all_cases') {
    rows = await fetchAllRows<ScopedInvoiceRow>((f, t) => reader.from('invoices').select(cols).not('case_id', 'is', null).order('id').range(f, t))
  } else if (scope.type === 'cases') {
    for (let k = 0; k < scope.caseIds.length; k += IN_CHUNK_SIZE) {
      const chunk = scope.caseIds.slice(k, k + IN_CHUNK_SIZE)
      rows.push(...await fetchAllRows<ScopedInvoiceRow>((f, t) => reader.from('invoices').select(cols).in('case_id', chunk).order('id').range(f, t)))
    }
  }
  rows = rows.filter((r) => invoiceInScope(scope, r.case_id))
  const overdue = rows
    .filter((r) => r.status === 'sent' && r.payment_status !== 'paid' && r.invoice_type !== 'credit' && !r.voided_at && !!r.due_date && r.due_date < todayDateIso)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)) || a.id.localeCompare(b.id))
  const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)
  let paymentsToday = 0
  const ids = rows.map((r) => r.id)
  for (let k = 0; k < ids.length; k += IN_CHUNK_SIZE) {
    const { count } = await reader.from('invoice_payments').select('id', { count: 'exact', head: true })
      .in('invoice_id', ids.slice(k, k + IN_CHUNK_SIZE)).gte('recorded_at', todayStart).lte('recorded_at', todayEnd)
    paymentsToday += count ?? 0
  }
  return { reader, sent: rows.filter((r) => r.status === 'sent').length, overdue, latest, paymentsToday }
}
