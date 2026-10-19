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
      safe(supabase.from('service_cases').select('id', { count: 'exact', head: true })
        .not('status', 'in', '("closed","converted")')
        .eq('is_proposal', false)),
      safe(supabase.from('offers').select('id', { count: 'exact', head: true })
        .eq('status', 'draft')
        .eq('is_proposal', false)),
      safe(supabase.from('invoices').select('id', { count: 'exact', head: true })
        .eq('status', 'sent')),
      // Forfalden = forfaldsdato FØR i dag, ikke kreditnota/annulleret (samme regel som fakturalisten)
      safe(supabase.from('invoices').select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .neq('payment_status', 'paid')
        .neq('invoice_type', 'credit')
        .is('voided_at', null)
        .lt('due_date', todayDateIso)),
      safe(supabase.from('invoice_payments').select('id', { count: 'exact', head: true })
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
      supabase
        .from('invoices')
        .select('id, invoice_number, final_amount, currency, status, payment_status, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
      // DB-6 (dashboard-review 2026-10-18): alle forfaldne (side for side) — tallet talte før også fuldt krediterede
      // fakturaer med, og listen blev filtreret efter .limit(10), så den kunne vise færre end der var
      fetchAllRows<{ id: string; invoice_number: string; final_amount: number; amount_paid: number; currency: string | null; due_date: string | null; customer_id: string | null }>((from, to) => supabase
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
    const credited = await creditedByOriginal(supabase, overdueRows.map((r) => r.id as string)).catch(() => new Map<string, number>())
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
