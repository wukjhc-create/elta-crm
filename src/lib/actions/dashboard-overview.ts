'use server'

/**
 * Sprint 9A — Dashboard styringscockpit.
 *
 * Samler de fem "kræver handling"-felter til ét fault-tolerant
 * server-action. Hver delquery er wrapped i try/catch saa et enkelt
 * query-fald ikke crasher hele dashboardet — manglende data vises som
 * tom liste / 0.
 *
 * Genbruger eksisterende helpers:
 *   - countRequiresResponseEmails / getRequiresResponseEmailIds
 *   - customer_tasks, service_cases og offers direkte via supabase
 */

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import {
  getRequiresResponseEmailIds,
} from '@/lib/actions/email-response-status'
import { logger } from '@/lib/utils/logger'

export interface DashboardOverviewMail {
  id: string
  subject: string | null
  sender_name: string | null
  sender_email: string | null
  received_at: string
  ageDays: number
}

export interface DashboardOverviewTask {
  id: string
  title: string
  customer_id: string | null
  customer_name: string | null
  due_date: string | null
  priority: string
  auto_generated: boolean
  daysOverdue: number
}

export interface DashboardOverviewOffer {
  id: string
  offer_number: string
  title: string
  customer_name: string
  status: string
  created_at: string
  ageDays: number
}

export interface DashboardOverviewVisit {
  id: string
  title: string
  customer_id: string | null
  customer_name: string | null
  due_date: string
}

export interface DashboardOverview {
  mails: {
    requiresResponseCount: number
    /** N73: tråde der har ventet > REPLY_WINDOW_DAYS — typisk besvaret fra en personlig postkasse (ses ikke i CRM) */
    olderCount: number
    oldest: DashboardOverviewMail[]
  }
  tasks: {
    openCount: number
    autoCount: number
    overdueCount: number
    overdue: DashboardOverviewTask[]
  }
  cases: {
    new: number
    in_progress: number
    pending: number
    total: number
    /** N27: sager hvor alle job er udført og intet er ufaktureret (kun for cases.close; ellers 0). */
    readyToClose: number
    /** N28: afsluttede timeregistreringer der afventer godkendelse (kun for time_logs.approve; ellers 0). */
    timesPendingApproval: number
  }
  offers: {
    followupCount: number
    oldest: DashboardOverviewOffer[]
    /** N52: kladder ældre end 14 dage (aldrig sendt) */
    staleDraftCount: number
  }
  /** N51: sager med fakturerbart arbejde der ikke er faktureret (timer/materialer/øvrige; kun invoices.create). */
  unbilled: {
    caseCount: number
    saleTotal: number
    cases: Array<{ id: string; case_number: string | null; title: string; customer_name: string | null; lines: number; sale: number }>
  }
  /** N67: webhenvendelser (hjemmesidens formular, 90 d) uden kunde og uden lead — kun leads.create. */
  webInquiries: {
    allowed: boolean
    count: number
    /** contact: navn · by fra formularen (N82 — alle emner er ens "Ny henvendelse fra eltasolar.dk") */
    items: Array<{ id: string; subject: string | null; contact: string | null; received_at: string; ageDays: number; unread: boolean }>
  }
  /** N83: åbne leads (ikke vundet/tabt) uden ændring i > 7 dage — kun leads.edit */
  staleLeads: {
    allowed: boolean
    count: number
    items: Array<{ id: string; name: string; status: string; ageDays: number }>
  }
  /** N61: sendte fakturaer over forfald (ikke betalt/annulleret/kreditnota; kun invoices.view.all). */
  overdueInvoices: {
    /** false = rollen må ikke se fakturaer → kortet skjules */
    allowed: boolean
    count: number
    total: number
    /** next: N89 — næste rykkertrin efter samme regler som invoice-reminders-cronen */
    items: Array<{ id: string; invoice_number: string | null; customer_name: string | null; amount: number; daysOverdue: number; reminders: number; next: import('@/lib/invoices/reminder-plan').NextReminder }>
  }
  /** N50: ulæste kundebeskeder fra kundeportalen pr. kunde (kun customers.edit). */
  portal: {
    unreadCount: number
    customers: Array<{ id: string; name: string; unread: number; oldestDays: number }>
  }
  /** N44: nye kunder (30 d) uden tilbud og uden sag — henvendelser der ikke er fulgt op (kun offers.create). */
  newCustomers: {
    count: number
    items: Array<{ id: string; name: string; created_at: string; ageDays: number }>
  }
  visits: {
    upcoming: DashboardOverviewVisit[]
    /** True hvis intet besigtigelses-data fundet — UI viser placeholder. */
    empty: boolean
  }
  /** Per-section fejl saa UI kan vise en diskret advarsel uden at crashe. */
  errors: Partial<Record<'mails' | 'tasks' | 'cases' | 'offers' | 'visits' | 'newCustomers' | 'portal' | 'unbilled' | 'overdueInvoices' | 'webInquiries' | 'staleLeads', string>>
  generated_at: string
}

const OFFER_FOLLOWUP_DAYS = 7
const TOP_N = 5
/** N73: "Mails kræver svar" i cockpittet tæller kun tråde fra de seneste 14 dage */
const REPLY_WINDOW_DAYS = 14
const NEW_CUSTOMER_DAYS = 30

function daysBetween(iso: string, now: number): number {
  const diff = now - new Date(iso).getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const now = Date.now()
  const overview: DashboardOverview = {
    mails: { requiresResponseCount: 0, olderCount: 0, oldest: [] },
    tasks: { openCount: 0, autoCount: 0, overdueCount: 0, overdue: [] },
    cases: { new: 0, in_progress: 0, pending: 0, total: 0, readyToClose: 0, timesPendingApproval: 0 },
    offers: { followupCount: 0, oldest: [], staleDraftCount: 0 },
    newCustomers: { count: 0, items: [] },
    portal: { unreadCount: 0, customers: [] },
    unbilled: { caseCount: 0, saleTotal: 0, cases: [] },
    overdueInvoices: { allowed: false, count: 0, total: 0, items: [] },
    webInquiries: { allowed: false, count: 0, items: [] },
    staleLeads: { allowed: false, count: 0, items: [] },
    visits: { upcoming: [], empty: true },
    errors: {},
    generated_at: new Date().toISOString(),
  }

  // Én auth-/rolleopslag for hele cockpittet (før: ét pr. sektion → 6 ekstra Auth-kald + profilopslag pr. visning)
  let roleCtx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>
  let supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']
  try {
    roleCtx = await getAuthenticatedClientWithRole()
    supabase = roleCtx.supabase
  } catch (err) {
    logger.error('getDashboardOverview: not authenticated', { error: err })
    overview.errors.mails = 'auth'
    overview.errors.tasks = 'auth'
    overview.errors.cases = 'auth'
    overview.errors.offers = 'auth'
    overview.errors.visits = 'auth'
    return overview
  }

  await Promise.all([
    // Mails — kraever svar
    (async () => {
      try {
        // N73: prod 2026-10-04: 117 tråde "kræver svar", 95 ældre end 30 dage — svar sendt fra personlige postkasser
        // ses ikke i CRM (N69), så den samlede tæller var støj. Overskriften tæller nu kun tråde fra de seneste
        // REPLY_WINDOW_DAYS (pr. tråd, ikke pr. mail; én beregning i stedet for to); ældre vises som note.
        const ids = await getRequiresResponseEmailIds()
        type Row = { id: string; conversation_id: string | null; subject: string | null; sender_name: string | null; sender_email: string | null; received_at: string }
        const rows: Row[] = []
        for (let i = 0; i < ids.length; i += 500) {
          const { data } = await supabase.from('incoming_emails')
            .select('id, conversation_id, subject, sender_name, sender_email, received_at').in('id', ids.slice(i, i + 500))
          rows.push(...((data ?? []) as Row[]))
        }
        const latestPerThread = new Map<string, Row>()
        for (const r of rows) {
          const key = r.conversation_id ?? r.id
          const cur = latestPerThread.get(key)
          if (!cur || r.received_at > cur.received_at) latestPerThread.set(key, r)
        }
        const threads = Array.from(latestPerThread.values())
        const recent = threads.filter((r) => daysBetween(r.received_at, now) < REPLY_WINDOW_DAYS)
          .sort((a, b) => a.received_at.localeCompare(b.received_at))
        overview.mails.requiresResponseCount = recent.length
        overview.mails.olderCount = threads.length - recent.length
        overview.mails.oldest = recent.slice(0, TOP_N).map((r) => ({
          id: r.id, subject: r.subject, sender_name: r.sender_name, sender_email: r.sender_email,
          received_at: r.received_at, ageDays: daysBetween(r.received_at, now),
        }))
      } catch (err) {
        logger.error('getDashboardOverview: mails failed', { error: err })
        overview.errors.mails = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // Tasks — aabne + auto + overdue
    (async () => {
      try {
        const nowIso = new Date().toISOString()
        const [openRes, autoRes, overdueRes] = await Promise.all([
          supabase
            .from('customer_tasks')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'done'),
          supabase
            .from('customer_tasks')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'done')
            .eq('auto_generated', true),
          supabase
            .from('customer_tasks')
            .select(`
              id, title, customer_id, due_date, priority, auto_generated,
              customer:customers(company_name)
            `)
            .neq('status', 'done')
            .not('due_date', 'is', null)
            .lt('due_date', nowIso)
            .order('due_date', { ascending: true })
            .limit(TOP_N),
        ])
        overview.tasks.openCount = openRes.count || 0
        overview.tasks.autoCount = autoRes.count || 0
        const rows = (overdueRes.data || []) as Array<{
          id: string
          title: string
          customer_id: string | null
          due_date: string | null
          priority: string
          auto_generated: boolean | null
          customer: { company_name?: string | null } | Array<{ company_name?: string | null }> | null
        }>
        overview.tasks.overdue = rows.map((r) => {
          const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer
          return {
            id: r.id,
            title: r.title,
            customer_id: r.customer_id,
            customer_name: cust?.company_name ?? null,
            due_date: r.due_date,
            priority: r.priority,
            auto_generated: r.auto_generated === true,
            daysOverdue: r.due_date ? daysBetween(r.due_date, now) : 0,
          }
        })
        overview.tasks.overdueCount = overview.tasks.overdue.length
      } catch (err) {
        logger.error('getDashboardOverview: tasks failed', { error: err })
        overview.errors.tasks = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // Service-cases counts
    (async () => {
      try {
        const [newRes, progressRes, pendingRes, totalRes] = await Promise.all([
          supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('status', 'new').eq('is_proposal', false),
          supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('status', 'in_progress').eq('is_proposal', false),
          supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('is_proposal', false),
          supabase.from('service_cases').select('id', { count: 'exact', head: true }).not('status', 'in', '("closed","converted")').eq('is_proposal', false),
        ])
        overview.cases.new = newRes.count || 0
        overview.cases.in_progress = progressRes.count || 0
        overview.cases.pending = pendingRes.count || 0
        overview.cases.total = totalRes.count || 0
        // N27: klar til lukning — kandidater (≥1 job udført, ingen åbne job) i én forespørgsel, fuld vurdering
        // (inkl. ufaktureret/kørende timer) kun for kandidaterne. Kræver cases.close (ellers null → 0).
        const { data: open } = await supabase.from('service_cases').select('id').in('status', ['new', 'in_progress', 'pending']).eq('is_proposal', false).limit(200)
        const ids = ((open ?? []) as Array<{ id: string }>).map((x) => x.id)
        if (ids.length) {
          const { data: wos } = await supabase.from('work_orders').select('case_id, status').in('case_id', ids)
          const agg = new Map<string, { done: number; open: number }>()
          for (const w of (wos ?? []) as Array<{ case_id: string; status: string }>) {
            const a = agg.get(w.case_id) ?? { done: 0, open: 0 }
            if (w.status === 'done') a.done++
            else if (w.status === 'planned' || w.status === 'in_progress') a.open++
            agg.set(w.case_id, a)
          }
          const candidates = [...agg.entries()].filter(([, a]) => a.done > 0 && a.open === 0).map(([id]) => id).slice(0, 25)
          if (candidates.length) {
            const { getCaseCloseReadinessAction } = await import('@/lib/actions/service-cases')
            const rs = await Promise.all(candidates.map((id) => getCaseCloseReadinessAction(id)))
            overview.cases.readyToClose = rs.filter((r) => r.success && r.data?.ready).length
          }
        }
        // N28: timer der afventer godkendelse (montør registrerer → serviceleder/admin godkender)
        const ctx = roleCtx
        if (ctx.hasPermission('time_logs.approve')) {
          const { count } = await supabase.from('time_logs').select('id', { count: 'exact', head: true })
            .eq('approval_status', 'pending').not('end_time', 'is', null)
          overview.cases.timesPendingApproval = count || 0
        }
      } catch (err) {
        logger.error('getDashboardOverview: cases failed', { error: err })
        overview.errors.cases = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // Offers — sendte/sete der ikke er accepteret, aeldre end OFFER_FOLLOWUP_DAYS
    (async () => {
      try {
        const cutoff = new Date(now - OFFER_FOLLOWUP_DAYS * 86_400_000).toISOString()
        const [countRes, listRes] = await Promise.all([
          supabase
            .from('offers')
            .select('id', { count: 'exact', head: true })
            .in('status', ['sent', 'viewed'])
            .eq('is_proposal', false)
            .lt('created_at', cutoff),
          supabase
            .from('offers')
            .select(`
              id, offer_number, title, status, created_at,
              customer:customers!offers_customer_id_fkey(company_name)
            `)
            .in('status', ['sent', 'viewed'])
            .eq('is_proposal', false)
            .lt('created_at', cutoff)
            .order('created_at', { ascending: true })
            .limit(TOP_N),
        ])
        overview.offers.followupCount = countRes.count || 0
        // N52: kladder der aldrig blev sendt (> 14 dage)
        const staleCutoff = new Date(now - 14 * 86_400_000).toISOString()
        const { count: staleCount } = await supabase.from('offers').select('id', { count: 'exact', head: true })
          .eq('status', 'draft').eq('is_proposal', false).lt('created_at', staleCutoff)
        overview.offers.staleDraftCount = staleCount || 0
        const rows = (listRes.data || []) as Array<{
          id: string
          offer_number: string
          title: string
          status: string
          created_at: string
          customer: { company_name?: string | null } | Array<{ company_name?: string | null }> | null
        }>
        overview.offers.oldest = rows.map((r) => {
          const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer
          return {
            id: r.id,
            offer_number: r.offer_number,
            title: r.title,
            customer_name: cust?.company_name || '',
            status: r.status,
            created_at: r.created_at,
            ageDays: daysBetween(r.created_at, now),
          }
        })
      } catch (err) {
        logger.error('getDashboardOverview: offers failed', { error: err })
        overview.errors.offers = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // N51: klar til fakturering — fakturerbart arbejde uden faktura (samme regel som fakturakladden: billable +
    // invoice_line_id IS NULL; timer kun afsluttede). Salgsværdi (ingen kost).
    (async () => {
      try {
        const ctx = roleCtx
        if (!ctx.hasPermission('invoices.create')) return
        const [tl, mat, oth] = await Promise.all([
          supabase.from('time_logs').select('sale_amount, work_order:work_orders!inner(case_id)')
            .eq('billable', true).is('invoice_line_id', null).not('end_time', 'is', null).limit(2000),
          supabase.from('case_materials').select('case_id, total_sales_price').eq('billable', true).is('invoice_line_id', null).limit(2000),
          supabase.from('case_other_costs').select('case_id, total_sales_price').eq('billable', true).is('invoice_line_id', null).limit(2000),
        ])
        const agg = new Map<string, { lines: number; sale: number }>()
        const add = (caseId: string | null | undefined, sale: unknown) => {
          if (!caseId) return
          const cur = agg.get(caseId) ?? { lines: 0, sale: 0 }
          cur.lines += 1
          cur.sale += Number(sale ?? 0) || 0
          agg.set(caseId, cur)
        }
        for (const t of (tl.data ?? []) as Array<{ sale_amount: number | string | null; work_order: { case_id: string | null } | Array<{ case_id: string | null }> | null }>) {
          const wo = Array.isArray(t.work_order) ? t.work_order[0] : t.work_order
          add(wo?.case_id, t.sale_amount)
        }
        for (const m of (mat.data ?? []) as Array<{ case_id: string; total_sales_price: number | string | null }>) add(m.case_id, m.total_sales_price)
        for (const o of (oth.data ?? []) as Array<{ case_id: string; total_sales_price: number | string | null }>) add(o.case_id, o.total_sales_price)
        if (!agg.size) return
        const { data: cs } = await supabase.from('service_cases')
          .select('id, case_number, title, status, customer:customers!service_cases_customer_id_fkey(company_name)')
          .in('id', Array.from(agg.keys())).neq('status', 'converted')
        const list = ((cs ?? []) as Array<{ id: string; case_number: string | null; title: string; status: string; customer: { company_name?: string | null } | Array<{ company_name?: string | null }> | null }>)
          .map((c) => {
            const a = agg.get(c.id)!
            const cust = Array.isArray(c.customer) ? c.customer[0] : c.customer
            return { id: c.id, case_number: c.case_number, title: c.title, customer_name: cust?.company_name ?? null, lines: a.lines, sale: Math.round(a.sale * 100) / 100 }
          })
          .sort((x, y) => y.sale - x.sale)
        overview.unbilled = {
          caseCount: list.length,
          saleTotal: Math.round(list.reduce((s, c) => s + c.sale, 0) * 100) / 100,
          cases: list.slice(0, TOP_N),
        }
      } catch (err) {
        logger.error('getDashboardOverview: unbilled failed', { error: err })
        overview.errors.unbilled = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // N67: henvendelser fra hjemmesiden — prod 2026-10-04: 43 i alt (23 på 90 d), 0 blev til kunde/lead, 31 ulæste.
    // Samme afgrænsning som mail-fanen "Webhenvendelser" (formsubmit + "henvendelse" + ingen kunde); uden lead
    // (leads.custom_fields.source_email_id); arkiverede tæller ikke. Nyeste først.
    (async () => {
      try {
        const ctx = roleCtx
        if (!ctx.hasPermission('leads.create')) return
        overview.webInquiries.allowed = true
        const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
        const { data, error } = await supabase.from('incoming_emails')
          .select('id, subject, received_at, is_read')
          .ilike('sender_email', '%@formsubmit.co').ilike('subject', '%henvendelse%').is('customer_id', null)
          .eq('is_archived', false).gte('received_at', since)
          .order('received_at', { ascending: false }).limit(200)
        if (error) throw new Error(error.message)
        const rows = (data ?? []) as Array<{ id: string; subject: string | null; received_at: string; is_read: boolean }>
        if (!rows.length) return
        const { data: leads, error: leadErr } = await supabase.from('leads').select('custom_fields').not('custom_fields->>source_email_id', 'is', null).limit(5000)
        if (leadErr) throw new Error(leadErr.message)
        const withLead = new Set(((leads ?? []) as Array<{ custom_fields: { source_email_id?: string } | null }>).map((l) => l.custom_fields?.source_email_id).filter(Boolean))
        const open = rows.filter((r) => !withLead.has(r.id))
        // N82: navn · by fra formularen for de viste (kun TOP_N mails hentes med brødtekst)
        const shown = open.slice(0, TOP_N)
        const contactById = new Map<string, string | null>()
        if (shown.length) {
          const { parseCustomerFromEmail } = await import('@/lib/utils/email-parser')
          const { data: bodies } = await supabase.from('incoming_emails').select('id, body_text, body_html').in('id', shown.map((r) => r.id))
          for (const b of (bodies ?? []) as Array<{ id: string; body_text: string | null; body_html: string | null }>) {
            const p = parseCustomerFromEmail(b.body_text, b.body_html, null)
            contactById.set(b.id, [p.name, p.city].filter(Boolean).join(' · ') || null)
          }
        }
        overview.webInquiries = {
          allowed: true,
          count: open.length,
          items: shown.map((r) => ({ id: r.id, subject: r.subject, contact: contactById.get(r.id) ?? null, received_at: r.received_at, ageDays: daysBetween(r.received_at, now), unread: !r.is_read })),
        }
      } catch (err) {
        logger.error('getDashboardOverview: webInquiries failed', { error: err })
        overview.errors.webInquiries = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // N83: leads uden opfølgning — åbne (ikke won/lost) og ikke ændret i 7 dage; ældst først
    (async () => {
      try {
        const ctx = roleCtx
        if (!ctx.hasPermission('leads.edit')) return
        overview.staleLeads.allowed = true
        const cutoff = new Date(now - 7 * 86_400_000).toISOString()
        const { data, count, error } = await supabase.from('leads')
          .select('id, company_name, contact_person, status, updated_at', { count: 'exact' })
          .not('status', 'in', '(won,lost)').lt('updated_at', cutoff)
          .order('updated_at', { ascending: true }).limit(TOP_N)
        if (error) throw new Error(error.message)
        overview.staleLeads = {
          allowed: true,
          count: count ?? 0,
          items: ((data ?? []) as Array<{ id: string; company_name: string | null; contact_person: string | null; status: string; updated_at: string }>)
            .map((l) => ({ id: l.id, name: l.company_name || l.contact_person || '—', status: l.status, ageDays: daysBetween(l.updated_at, now) })),
        }
      } catch (err) {
        logger.error('getDashboardOverview: staleLeads failed', { error: err })
        overview.errors.staleLeads = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // N61: forfaldne fakturaer — samme regel som fakturaoversigten: status='sent', ikke annulleret, ikke kreditnota,
    // due_date før i dag (dansk kalenderdag). Ældste forfald først.
    (async () => {
      try {
        const ctx = roleCtx
        if (!ctx.hasPermission('invoices.view.all')) return
        overview.overdueInvoices.allowed = true
        const { calendarDaysSince } = await import('@/lib/utils/copenhagen-time')
        const { nextReminder } = await import('@/lib/invoices/reminder-plan')
        const { data, error } = await supabase.from('invoices')
          .select('id, invoice_number, invoice_type, final_amount, due_date, reminder_count, last_reminder_at, customer_id')
          .eq('status', 'sent').is('voided_at', null).not('due_date', 'is', null)
          .order('due_date', { ascending: true }).limit(500)
        if (error) throw new Error(error.message)
        const nowMs = Date.now()
        const rows = ((data ?? []) as Array<{ id: string; invoice_number: string | null; invoice_type: string | null; final_amount: number | string | null; due_date: string; reminder_count: number | null; last_reminder_at: string | null; customer_id: string | null }>)
          .filter((r) => r.invoice_type !== 'credit')
          .map((r) => ({ ...r, days: calendarDaysSince(r.due_date, nowMs) }))
          .filter((r) => r.days > 0)
        if (!rows.length) return
        const custIds = Array.from(new Set(rows.slice(0, TOP_N).map((r) => r.customer_id).filter((x): x is string => !!x)))
        const names = new Map<string, string>()
        if (custIds.length) {
          const { data: cs } = await supabase.from('customers').select('id, company_name').in('id', custIds)
          for (const c of (cs ?? []) as Array<{ id: string; company_name: string | null }>) names.set(c.id, c.company_name ?? '')
        }
        overview.overdueInvoices = {
          allowed: true,
          count: rows.length,
          total: Math.round(rows.reduce((sum, r) => sum + (Number(r.final_amount ?? 0) || 0), 0) * 100) / 100,
          items: rows.slice(0, TOP_N).map((r) => ({
            id: r.id, invoice_number: r.invoice_number, customer_name: r.customer_id ? names.get(r.customer_id) ?? null : null,
            amount: Number(r.final_amount ?? 0) || 0, daysOverdue: r.days, reminders: Number(r.reminder_count ?? 0),
            next: nextReminder(r.days, Number(r.reminder_count ?? 0), r.last_reminder_at ? calendarDaysSince(r.last_reminder_at.slice(0, 10), nowMs) : null),
          })),
        }
      } catch (err) {
        logger.error('getDashboardOverview: overdueInvoices failed', { error: err })
        overview.errors.overdueInvoices = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // N50: ulæste kundebeskeder fra portalen (chat pr. kunde)
    (async () => {
      try {
        const ctx = roleCtx
        if (!ctx.hasPermission('customers.edit')) return
        const { data } = await supabase.from('portal_messages').select('customer_id, created_at, customer:customers(company_name)')
          .eq('sender_type', 'customer').is('read_at', null).order('created_at', { ascending: true }).limit(500)
        const rows = (data ?? []) as Array<{ customer_id: string; created_at: string; customer: { company_name?: string | null } | Array<{ company_name?: string | null }> | null }>
        const byCustomer = new Map<string, { id: string; name: string; unread: number; oldestDays: number }>()
        for (const m of rows) {
          const cust = Array.isArray(m.customer) ? m.customer[0] : m.customer
          const cur = byCustomer.get(m.customer_id) ?? { id: m.customer_id, name: cust?.company_name || '—', unread: 0, oldestDays: daysBetween(m.created_at, now) }
          cur.unread += 1
          byCustomer.set(m.customer_id, cur)
        }
        overview.portal = { unreadCount: rows.length, customers: Array.from(byCustomer.values()).slice(0, TOP_N) }
      } catch (err) {
        logger.error('getDashboardOverview: portal failed', { error: err })
        overview.errors.portal = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // N44: nye kunder (30 d) uden tilbud og uden sag — kun for roller der kan oprette tilbud
    (async () => {
      try {
        const ctx = roleCtx
        if (!ctx.hasPermission('offers.create')) return
        const since = new Date(now - NEW_CUSTOMER_DAYS * 86_400_000).toISOString()
        const { data: custs } = await supabase.from('customers').select('id, company_name, created_at, email')
          .gte('created_at', since).eq('is_active', true).order('created_at', { ascending: false }).limit(200)
        let list = (custs ?? []) as Array<{ id: string; company_name: string | null; created_at: string; email: string | null }>
        if (!list.length) return
        // N75: "kunder" hvis e-maildomæne tilhører en kendt leverandør (fx oprettet af mail-automatikken ud fra en
        // leverandørs signatur, N74) er ikke salgsemner — vises ikke her. Deterministisk via suppliers.website/kontakt.
        const { senderDomain, suppliersForDomain } = await import('@/lib/invoice-control/sender-domain')
        const { data: sups } = await supabase.from('suppliers').select('id, website, contact_email').limit(1000)
        const supplierList = (sups ?? []) as Array<{ id: string; website: string | null; contact_email: string | null }>
        if (supplierList.length) list = list.filter((c) => { const d = senderDomain(c.email); return !d || suppliersForDomain(d, supplierList).length === 0 })
        if (!list.length) return
        const ids = list.map((c) => c.id)
        const [offRes, caseRes] = await Promise.all([
          supabase.from('offers').select('customer_id').in('customer_id', ids),
          supabase.from('service_cases').select('customer_id').in('customer_id', ids),
        ])
        const handled = new Set<string>([
          ...((offRes.data ?? []) as Array<{ customer_id: string | null }>).map((r) => r.customer_id ?? ''),
          ...((caseRes.data ?? []) as Array<{ customer_id: string | null }>).map((r) => r.customer_id ?? ''),
        ])
        const open = list.filter((c) => !handled.has(c.id))
        overview.newCustomers = {
          count: open.length,
          items: open.slice(0, TOP_N).map((c) => ({ id: c.id, name: c.company_name || '—', created_at: c.created_at, ageDays: daysBetween(c.created_at, now) })),
        }
      } catch (err) {
        logger.error('getDashboardOverview: newCustomers failed', { error: err })
        overview.errors.newCustomers = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // Visits — kommende besigtigelses-tasks
    (async () => {
      try {
        const nowIso = new Date().toISOString()
        const { data } = await supabase
          .from('customer_tasks')
          .select(`
            id, title, customer_id, due_date,
            customer:customers(company_name)
          `)
          .neq('status', 'done')
          .gte('due_date', nowIso)
          .ilike('title', '%esigtigelse%')
          .order('due_date', { ascending: true })
          .limit(TOP_N)
        const rows = (data || []) as Array<{
          id: string
          title: string
          customer_id: string | null
          due_date: string | null
          customer: { company_name?: string | null } | Array<{ company_name?: string | null }> | null
        }>
        const list = rows
          .filter((r) => !!r.due_date)
          .map((r) => {
            const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer
            return {
              id: r.id,
              title: r.title,
              customer_id: r.customer_id,
              customer_name: cust?.company_name ?? null,
              due_date: r.due_date as string,
            }
          })
        overview.visits.upcoming = list
        overview.visits.empty = list.length === 0
      } catch (err) {
        logger.error('getDashboardOverview: visits failed', { error: err })
        overview.errors.visits = err instanceof Error ? err.message : 'failed'
      }
    })(),
  ])

  return overview
}
