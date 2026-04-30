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
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

interface DashboardStats {
  generated_at: string
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
    const todayDateIso = now.toISOString().slice(0, 10)
    const todayStart = todayDateIso + 'T00:00:00.000Z'
    const todayEnd = todayDateIso + 'T23:59:59.999Z'

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

    const [
      newEmails,
      newCustomers,
      openCases,
      offersDraft,
      invoicesSent,
      invoicesOverdue,
      paymentsToday,
      systemErrors,
    ] = await Promise.all([
      safe(supabase.from('incoming_emails').select('id', { count: 'exact', head: true })
        .gte('received_at', since24h)),
      safe(supabase.from('customers').select('id', { count: 'exact', head: true })
        .gte('created_at', since24h)),
      safe(supabase.from('service_cases').select('id', { count: 'exact', head: true })
        .neq('status', 'closed')
        .neq('status', 'completed')),
      safe(supabase.from('offers').select('id', { count: 'exact', head: true })
        .eq('status', 'draft')),
      safe(supabase.from('invoices').select('id', { count: 'exact', head: true })
        .eq('status', 'sent')),
      safe(supabase.from('invoices').select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .neq('payment_status', 'paid')
        .lte('due_date', todayDateIso)),
      safe(supabase.from('invoice_payments').select('id', { count: 'exact', head: true })
        .gte('recorded_at', todayStart)
        .lte('recorded_at', todayEnd)),
      safe(supabase.from('system_health_log').select('id', { count: 'exact', head: true })
        .eq('status', 'error')
        .gte('created_at', sinceHour)),
    ])

    // List views — independently safe.
    const [latestEmailsRes, latestInvoicesRes, overdueRes] = await Promise.all([
      supabase
        .from('incoming_emails')
        .select('id, subject, sender_name, sender_email, received_at, customer_id')
        .order('received_at', { ascending: false })
        .limit(8),
      supabase
        .from('invoices')
        .select('id, invoice_number, final_amount, currency, status, payment_status, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('invoices')
        .select('id, invoice_number, final_amount, currency, due_date, customer_id')
        .eq('status', 'sent')
        .neq('payment_status', 'paid')
        .lte('due_date', todayDateIso)
        .order('due_date', { ascending: true })
        .limit(10),
    ])

    const overdue_invoices = (overdueRes.data ?? []).map((r) => {
      const due = r.due_date ? new Date(r.due_date) : null
      const daysOverdue = due
        ? Math.max(0, Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000)))
        : 0
      return {
        id: r.id,
        invoice_number: r.invoice_number,
        final_amount: Number(r.final_amount) || 0,
        currency: r.currency || 'DKK',
        due_date: r.due_date,
        days_overdue: daysOverdue,
        customer_id: r.customer_id,
      }
    })

    // System health — already safely-fallbacked internally.
    let systemHealth: DashboardStats['system_health'] = { overall: 'ok', services: [] }
    try {
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

    const payload: DashboardStats = {
      generated_at: now.toISOString(),
      counts: {
        new_emails_last_24h: newEmails,
        new_customers_last_24h: newCustomers,
        open_cases: openCases,
        offers_draft: offersDraft,
        invoices_sent: invoicesSent,
        invoices_overdue: invoicesOverdue,
        payments_today: paymentsToday,
        system_errors_last_hour: systemErrors,
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
