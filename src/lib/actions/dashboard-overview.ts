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

import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import {
  countRequiresResponseEmails,
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
  }
  offers: {
    followupCount: number
    oldest: DashboardOverviewOffer[]
  }
  visits: {
    upcoming: DashboardOverviewVisit[]
    /** True hvis intet besigtigelses-data fundet — UI viser placeholder. */
    empty: boolean
  }
  /** Per-section fejl saa UI kan vise en diskret advarsel uden at crashe. */
  errors: Partial<Record<'mails' | 'tasks' | 'cases' | 'offers' | 'visits', string>>
  generated_at: string
}

const OFFER_FOLLOWUP_DAYS = 7
const TOP_N = 5

function daysBetween(iso: string, now: number): number {
  const diff = now - new Date(iso).getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const now = Date.now()
  const overview: DashboardOverview = {
    mails: { requiresResponseCount: 0, oldest: [] },
    tasks: { openCount: 0, autoCount: 0, overdueCount: 0, overdue: [] },
    cases: { new: 0, in_progress: 0, pending: 0, total: 0 },
    offers: { followupCount: 0, oldest: [] },
    visits: { upcoming: [], empty: true },
    errors: {},
    generated_at: new Date().toISOString(),
  }

  let supabase: Awaited<ReturnType<typeof getAuthenticatedClient>>['supabase']
  try {
    const ctx = await getAuthenticatedClient()
    supabase = ctx.supabase
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
        const count = await countRequiresResponseEmails()
        overview.mails.requiresResponseCount = count
        if (count > 0) {
          const ids = await getRequiresResponseEmailIds()
          const top = ids.slice(0, TOP_N * 4)
          if (top.length > 0) {
            const { data } = await supabase
              .from('incoming_emails')
              .select('id, subject, sender_name, sender_email, received_at')
              .in('id', top)
              .order('received_at', { ascending: true })
              .limit(TOP_N)
            overview.mails.oldest = (data || []).map((r) => ({
              id: r.id as string,
              subject: (r.subject as string | null) ?? null,
              sender_name: (r.sender_name as string | null) ?? null,
              sender_email: (r.sender_email as string | null) ?? null,
              received_at: r.received_at as string,
              ageDays: daysBetween(r.received_at as string, now),
            }))
          }
        }
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
