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

import { leadSourceEmailIds } from '@/lib/leads/source-email'
import { OFFER_FOLLOWUP_STATUSES, offerFollowupAgeFilter } from '@/lib/offers/followup-window'
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
    /** PM2-1: kun med inbox.view (salg/bogholderi så før emne og afsender på mails fra kontakt@/ordre@) */
    allowed: boolean
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
    /** DB-15m: true når kandidaterne er loftet (kun de 200 nyeste vurderet) */
    readyToCloseCapped?: boolean
    /** N28: afsluttede timeregistreringer der afventer godkendelse (kun for time_logs.approve; ellers 0). */
    timesPendingApproval: number
  }
  offers: {
    /** PM2-4: kun med offers.view */
    allowed: boolean
    followupCount: number
    oldest: DashboardOverviewOffer[]
    /** N52: kladder ældre end 14 dage (aldrig sendt) */
    staleDraftCount: number
  }
  /** N51: sager med fakturerbart arbejde der ikke er faktureret (timer/materialer/øvrige; kun invoices.create). */
  unbilled: {
    /** DB-8 (dashboard-review 2026-10-18): false = rollen har ikke data → kortet skjules (ikke "alt faktureret") */
    allowed?: boolean
    caseCount: number
    saleTotal: number
    cases: Array<{ id: string; case_number: string | null; title: string; customer_name: string | null; lines: number; sale: number }>
  }
  /** N67: webhenvendelser (hjemmesidens formular, 90 d) uden kunde og uden lead — kun inbox.view + leads.create. */
  webInquiries: {
    allowed: boolean
    count: number
    /** contact: navn · by fra formularen (N82 — alle emner er ens "Ny henvendelse fra eltasolar.dk") */
    items: Array<{ id: string; subject: string | null; contact: string | null; existingCustomer: { id: string; name: string } | null; received_at: string; ageDays: number; unread: boolean }>
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
    allowed?: boolean // DB-8
    unreadCount: number
    customers: Array<{ id: string; name: string; unread: number; oldestDays: number }>
  }
  /** N44: nye kunder (30 d) uden tilbud og uden sag — henvendelser der ikke er fulgt op (kun offers.create). */
  newCustomers: {
    allowed?: boolean // DB-8
    count: number
    items: Array<{ id: string; name: string; created_at: string; ageDays: number }>
  }
  visits: {
    upcoming: DashboardOverviewVisit[]
    /** DB-15a: alle kommende besigtigelser (listen viser højst TOP_N) */
    count: number
    /** True hvis intet besigtigelses-data fundet — UI viser placeholder. */
    empty: boolean
  }
  /** Per-section fejl saa UI kan vise en diskret advarsel uden at crashe. */
  errors: Partial<Record<'mails' | 'tasks' | 'cases' | 'offers' | 'visits' | 'newCustomers' | 'portal' | 'unbilled' | 'overdueInvoices' | 'webInquiries' | 'staleLeads', string>>
  generated_at: string
}

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
    mails: { allowed: false, requiresResponseCount: 0, olderCount: 0, oldest: [] },
    tasks: { openCount: 0, autoCount: 0, overdueCount: 0, overdue: [] },
    cases: { new: 0, in_progress: 0, pending: 0, total: 0, readyToClose: 0, timesPendingApproval: 0 },
    offers: { allowed: false, followupCount: 0, oldest: [], staleDraftCount: 0 },
    newCustomers: { allowed: false, count: 0, items: [] },
    portal: { allowed: false, unreadCount: 0, customers: [] },
    unbilled: { allowed: false, caseCount: 0, saleTotal: 0, cases: [] },
    overdueInvoices: { allowed: false, count: 0, total: 0, items: [] },
    webInquiries: { allowed: false, count: 0, items: [] },
    staleLeads: { allowed: false, count: 0, items: [] },
    visits: { upcoming: [], count: 0, empty: true },
    errors: {},
    generated_at: new Date().toISOString(),
  }

  // Én auth-/rolleopslag for hele cockpittet (før: ét pr. sektion → 6 ekstra Auth-kald + profilopslag pr. visning)
  let roleCtx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>
  let supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']
  let __offerOr = 'id.not.is.null' // API-2: salg kun egne tilbud (sættes efter login)
  try {
    roleCtx = await getAuthenticatedClientWithRole()
    supabase = roleCtx.supabase
    if (roleCtx.hasPermission('offers.view')) {
      const { getOfferScope, offerScopeOr } = await import('@/lib/offers/offer-scope')
      __offerOr = offerScopeOr(await getOfferScope(roleCtx)) ?? 'id.not.is.null'
    }
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
        // PM2-1 (rolle-review 2026-10-18): postkassen kun for roller med inbox.view
        if (!roleCtx.hasPermission('inbox.view')) return
        overview.mails.allowed = true
        // N73: prod 2026-10-04: 117 tråde "kræver svar", 95 ældre end 30 dage — svar sendt fra personlige postkasser
        // ses ikke i CRM (N69), så den samlede tæller var støj. Overskriften tæller nu kun tråde fra de seneste
        // REPLY_WINDOW_DAYS (pr. tråd, ikke pr. mail; én beregning i stedet for to); ældre vises som note.
        const ids = await getRequiresResponseEmailIds()
        type Row = { id: string; conversation_id: string | null; subject: string | null; sender_name: string | null; sender_email: string | null; received_at: string }
        const rows: Row[] = []
        // bid 200 (500 UUID'er sprænger URL-grænsen ~350 → tælleren blev stille for lav, se lib/supabase/in-chunks.ts)
        // Q-3 (review 2026-10-16): bidderne hentes samtidig (før én ad gangen)
        const chunks: string[][] = []
        for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200))
        const parts = await Promise.all(chunks.map((chunk) => supabase.from('incoming_emails')
          .select('id, conversation_id, subject, sender_name, sender_email, received_at').in('id', chunk)))
        for (const { data } of parts) rows.push(...((data ?? []) as Row[]))
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
        // TK-6 (review 2026-10-17): samme rolle-afgrænsning som opgavesiden (W-8) — før så salg/bogholderi alles opgaver
        const { scopeTaskQuery } = await import('@/lib/tasks/task-scope')
        const sc = { role: roleCtx.role, userId: roleCtx.userId, hasPermission: roleCtx.hasPermission as never }
        const openQ = scopeTaskQuery(supabase.from('customer_tasks').select('id', { count: 'exact', head: true }).neq('status', 'done'), sc)
        const autoQ = scopeTaskQuery(supabase.from('customer_tasks').select('id', { count: 'exact', head: true }).neq('status', 'done').eq('auto_generated', true), sc)
        if (!openQ || !autoQ) return
        const [openRes, autoRes, overdueRes] = await Promise.all([
          openQ,
          autoQ,
          scopeTaskQuery(supabase
            .from('customer_tasks')
            .select(`
              id, title, customer_id, due_date, priority, auto_generated,
              customer:customers(company_name)
            `, { count: 'exact' })
            .neq('status', 'done')
            .not('due_date', 'is', null)
            .lt('due_date', nowIso), sc)!
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
        overview.tasks.overdueCount = overdueRes.count ?? overview.tasks.overdue.length // DB-15d: alle (før listens 5)
      } catch (err) {
        logger.error('getDashboardOverview: tasks failed', { error: err })
        overview.errors.tasks = err instanceof Error ? err.message : 'failed'
      }
    })(),

    // Service-cases counts
    (async () => {
      try {
        // DB-1 (dashboard-review 2026-10-18): roller uden cases.view.all (salg) tæller kun sager i eget scope — før hele
        // firmaets tal, mens listen de klikkede til kun viste deres egne (fx 120 mod 8)
        let scopeIds: string[] | null = null
        if (!roleCtx.hasPermission('cases.view.all')) {
          const { getCaseScope } = await import('@/lib/auth/case-scope')
          const scope = await getCaseScope({ role: roleCtx.role, userId: roleCtx.userId, supabase })
          scopeIds = scope.type === 'all' ? null : scope.caseIds
        }
        const countCases = async (apply: (q: ReturnType<typeof supabase.from>) => unknown): Promise<number> => {
          const base = () => supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false)
          if (scopeIds === null) return ((await (apply(base() as never) as PromiseLike<{ count: number | null }>)).count) ?? 0
          let sum = 0
          for (let k = 0; k < scopeIds.length; k += 200) {
            const q = (base() as unknown as { in: (c: string, v: string[]) => unknown }).in('id', scopeIds.slice(k, k + 200))
            sum += ((await (apply(q as never) as PromiseLike<{ count: number | null }>)).count) ?? 0
          }
          return sum
        }
        const [newCount, progressCount, pendingCount, totalCount] = await Promise.all([
          countCases((q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq('status', 'new')),
          countCases((q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq('status', 'in_progress')),
          countCases((q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq('status', 'pending')),
          countCases((q) => (q as unknown as { not: (c: string, o: string, v: string) => unknown }).not('status', 'in', '("closed","converted")')),
        ])
        overview.cases.new = newCount
        overview.cases.in_progress = progressCount
        overview.cases.pending = pendingCount
        overview.cases.total = totalCount
        // N27: klar til lukning — kandidater (≥1 job udført, ingen åbne job) i én forespørgsel, fuld vurdering
        // (inkl. ufaktureret/kørende timer) kun for kandidaterne. Kræver cases.close (ellers null → 0).
        // M-12/B-10 (pilot-review 2026-10-15): før .limit(200) uden rækkefølge → med >200 åbne sager forsvandt vilkårlige
        // (også nye) sager fra tællingen; nu alle åbne (pagineret, nyeste først) og arbejdsordrer i bidder
        const { fetchAllRows } = await import('@/lib/supabase/fetch-all')
        const open = await fetchAllRows<{ id: string }>((f, t) => supabase.from('service_cases').select('id')
          .in('status', ['new', 'in_progress', 'pending']).eq('is_proposal', false)
          .order('created_at', { ascending: false }).order('id').range(f, t))
        const ids = open.map((x) => x.id)
        if (ids.length) {
          // R-5 (review 2026-10-16): 1:N-relation → hver bid pagineres
          const woChunks: string[][] = []
          for (let k = 0; k < ids.length; k += 100) woChunks.push(ids.slice(k, k + 100))
          const wos = (await Promise.all(woChunks.map((chunk) => fetchAllRows<{ case_id: string; status: string }>((f, t) => supabase.from('work_orders')
            .select('id, case_id, status').in('case_id', chunk).order('id').range(f, t))))).flat()
          const agg = new Map<string, { done: number; open: number }>()
          for (const w of wos) {
            const a = agg.get(w.case_id) ?? { done: 0, open: 0 }
            if (w.status === 'done') a.done++
            else if (w.status === 'planned' || w.status === 'in_progress') a.open++
            agg.set(w.case_id, a)
          }
          // nyeste sager først (ids er sorteret efter oprettelse); loft 200 kandidater til den samlede vurdering
          const allCandidates = ids.filter((id) => { const a = agg.get(id); return !!a && a.done > 0 && a.open === 0 })
          const candidates = allCandidates.slice(0, 200)
          overview.cases.readyToCloseCapped = allCandidates.length > 200 // DB-15m: loftet siges højt
          if (candidates.length && roleCtx.hasPermission('cases.close')) {
            // R-10: samlet vurdering (5 forespørgsler) i stedet for ≈5 pr. kandidat
            const { batchCaseCloseReadiness } = await import('@/lib/cases/close-readiness-batch')
            const rs = await batchCaseCloseReadiness(supabase, candidates)
            overview.cases.readyToClose = [...rs.values()].filter((r) => r.ready).length
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
        if (!roleCtx.hasPermission('offers.view')) return // PM2-4: tilbudsdata kun med offers.view
        overview.offers.allowed = true
        const followupAge = offerFollowupAgeFilter(now) // DB-3: samme definition som tilbudslisten (?followup=1)
        const [countRes, listRes] = await Promise.all([
          supabase
            .from('offers')
            .select('id', { count: 'exact', head: true }).or(__offerOr)
            .in('status', [...OFFER_FOLLOWUP_STATUSES])
            .eq('is_proposal', false)
            // DB-3 (dashboard-review 2026-10-18): alder regnes fra AFSENDELSEN (sent_at) — en kladde oprettet for 20 dage
            // siden og sendt i går er ikke 20 dage gammel. Uden sent_at (ældre rækker) bruges oprettelsen.
            .or(followupAge),
          supabase
            .from('offers')
            .select(`
              id, offer_number, title, status, created_at, sent_at,
              customer:customers!offers_customer_id_fkey(company_name)
            `).or(__offerOr)
            .in('status', [...OFFER_FOLLOWUP_STATUSES])
            .eq('is_proposal', false)
            .or(followupAge)
            .order('sent_at', { ascending: true, nullsFirst: true })
            .limit(TOP_N),
        ])
        overview.offers.followupCount = countRes.count || 0
        // N52: kladder der aldrig blev sendt (> 14 dage)
        const staleCutoff = new Date(now - 14 * 86_400_000).toISOString()
        const { count: staleCount } = await supabase.from('offers').select('id', { count: 'exact', head: true }).or(__offerOr)
          .eq('status', 'draft').eq('is_proposal', false).lt('created_at', staleCutoff)
        overview.offers.staleDraftCount = staleCount || 0
        const rows = (listRes.data || []) as Array<{
          id: string
          offer_number: string
          title: string
          status: string
          created_at: string
          sent_at?: string | null
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
            ageDays: daysBetween(r.sent_at ?? r.created_at, now), // DB-15h: som tallet/filtret (afsendelsen)
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
        overview.unbilled.allowed = true // DB-8
        // pagineret (PostgREST afkortede .limit(2000) til 1000 → for lav salgsværdi/antal sager ved mange linjer)
        const { fetchAllRows } = await import('@/lib/supabase/fetch-all')
        const [tlRows, matRows, othRows] = await Promise.all([
          fetchAllRows((f, t) => supabase.from('time_logs').select('id, sale_amount, work_order:work_orders!inner(case_id)')
            // TT-10: kun godkendte timer er klar til fakturering (afventende springes over af fakturaen)
            .eq('billable', true).is('invoice_line_id', null).not('end_time', 'is', null).eq('approval_status', 'approved').order('id').range(f, t)),
          fetchAllRows((f, t) => supabase.from('case_materials').select('id, case_id, total_sales_price').eq('billable', true).is('invoice_line_id', null).order('id').range(f, t)),
          fetchAllRows((f, t) => supabase.from('case_other_costs').select('id, case_id, total_sales_price').eq('billable', true).is('invoice_line_id', null).order('id').range(f, t)),
        ])
        const tl = { data: tlRows }, mat = { data: matRows }, oth = { data: othRows }
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
        // i bidder af 200 (én .in() med alle sager sprænger URL-længden ved vækst → tomt kort)
        const aggIds = Array.from(agg.keys())
        const cs: unknown[] = []
        for (let k = 0; k < aggIds.length; k += 200) {
          const { data, error } = await supabase.from('service_cases')
            .select('id, case_number, title, status, customer:customers!service_cases_customer_id_fkey(company_name)')
            .in('id', aggIds.slice(k, k + 200)).neq('status', 'converted')
          if (error) throw new Error(error.message)
          cs.push(...(data ?? []))
        }
        const list = (cs as Array<{ id: string; case_number: string | null; title: string; status: string; customer: { company_name?: string | null } | Array<{ company_name?: string | null }> | null }>)
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
        // samme gate som "Opret lead"-handlingerne (inbox.view + leads.create) — salg har leads.create men ikke indbakken
        if (!ctx.hasPermission('leads.create') || !ctx.hasPermission('inbox.view')) return
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
        const withLead = await leadSourceEmailIds(supabase)
        const open = rows.filter((r) => !withLead.has(r.id))
        // N82: navn · by fra formularen for de viste (kun TOP_N mails hentes med brødtekst)
        const shown = open.slice(0, TOP_N)
        const contactById = new Map<string, string | null>()
        // N95: prod — 9 af 23 åbne henvendelser er fra personer der allerede er kunder (samme e-mail), men mailen er ukoblet
        const existingById = new Map<string, { id: string; name: string }>()
        if (shown.length) {
          const { parseCustomerFromEmail } = await import('@/lib/utils/email-parser')
          const { escapeLike } = await import('@/lib/validations/postgrest-filter')
          const { data: bodies } = await supabase.from('incoming_emails').select('id, body_text, body_html').in('id', shown.map((r) => r.id))
          // Q-3: kundeopslag pr. henvendelse kører samtidig (før N+1 efter hinanden)
          await Promise.all(((bodies ?? []) as Array<{ id: string; body_text: string | null; body_html: string | null }>).map(async (b) => {
            const p = parseCustomerFromEmail(b.body_text, b.body_html, null)
            contactById.set(b.id, [p.name, p.city || p.postalCode].filter(Boolean).join(' · ') || null)
            const em = (p.email ?? '').trim().toLowerCase()
            if (em.includes('@')) {
              const { data: cust } = await supabase.from('customers').select('id, company_name').eq('is_active', true).ilike('email', escapeLike(em)).limit(1).maybeSingle()
              if (cust) existingById.set(b.id, { id: (cust as { id: string }).id, name: (cust as { company_name: string }).company_name })
            }
          }))
        }
        overview.webInquiries = {
          allowed: true,
          count: open.length,
          items: shown.map((r) => ({ id: r.id, subject: r.subject, contact: contactById.get(r.id) ?? null, existingCustomer: existingById.get(r.id) ?? null,
            received_at: r.received_at, ageDays: daysBetween(r.received_at, now), unread: !r.is_read })),
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
        const { calendarDaysSince, copenhagenCalendarDaysBetween } = await import('@/lib/utils/copenhagen-time')
        const { nextReminder } = await import('@/lib/invoices/reminder-plan')
        // DB-5 (dashboard-review 2026-10-18): samme regler som Fakturaøkonomi og fakturalisten — side for side (før
        // .limit(500)), kun DKK (før alle valutaer som "kr"), åbent beløb ≥ 0,50 (FIN-11; før enhver øre-rest)
        const { fetchAllRows } = await import('@/lib/supabase/fetch-all')
        const data = await fetchAllRows((f, t) => supabase.from('invoices')
          .select('id, invoice_number, invoice_type, final_amount, amount_paid, due_date, reminder_count, last_reminder_at, customer_id, currency')
          .eq('status', 'sent').is('voided_at', null).not('due_date', 'is', null)
          .order('due_date', { ascending: true }).order('id').range(f, t))
        const nowMs = Date.now()
        const overdue = ((data ?? []) as Array<{ id: string; invoice_number: string | null; invoice_type: string | null; final_amount: number | string | null; amount_paid: number | string | null; due_date: string; reminder_count: number | null; last_reminder_at: string | null; customer_id: string | null }>)
          .filter((r) => r.invoice_type !== 'credit' && String((r as { currency?: string | null }).currency ?? 'DKK').toUpperCase() === 'DKK')
          .map((r) => ({ ...r, days: calendarDaysSince(r.due_date, nowMs) }))
          .filter((r) => r.days > 0)
        // Rapport-review 2026-10-09 (#1): åbent beløb (− betalt − kreditnotaer) som fakturaoversigten; fuldt betalte/
        // krediterede fakturaer tælles ikke som forfaldne
        const { creditedByOriginal, openAmount } = await import('@/lib/invoices/open-amount')
        const credited = await creditedByOriginal(supabase, overdue.map((r) => r.id))
        const rows = overdue.map((r) => ({ ...r, open: openAmount(r, credited) })).filter((r) => r.open >= 0.5) // DB-5: FIN-11-tærskel
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
          total: Math.round(rows.reduce((sum, r) => sum + r.open, 0) * 100) / 100,
          items: rows.slice(0, TOP_N).map((r) => ({
            id: r.id, invoice_number: r.invoice_number, customer_name: r.customer_id ? names.get(r.customer_id) ?? null : null,
            amount: r.open, daysOverdue: r.days, reminders: Number(r.reminder_count ?? 0),
            // FIN-10 (finance-review 2026-10-17): danske kalenderdage som invoice-reminders-cronen (A-11) — før UTC-døgn
            next: nextReminder(copenhagenCalendarDaysBetween(r.due_date, new Date(nowMs)), Number(r.reminder_count ?? 0),
              r.last_reminder_at ? copenhagenCalendarDaysBetween(r.last_reminder_at, new Date(nowMs)) : null),
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
        overview.portal.allowed = true // DB-8
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
        overview.newCustomers.allowed = true // DB-8
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
          supabase.from('offers').select('customer_id').or(__offerOr).in('customer_id', ids),
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
        // TK-6: samme rolle-afgrænsning som opgavesiden
        const { scopeTaskQuery } = await import('@/lib/tasks/task-scope')
        const visitsQ = scopeTaskQuery(supabase
          .from('customer_tasks')
          .select(`
            id, title, customer_id, due_date,
            customer:customers(company_name)
          `, { count: 'exact' })
          .neq('status', 'done')
          .gte('due_date', nowIso)
          .ilike('title', '%esigtigelse%'), { role: roleCtx.role, userId: roleCtx.userId, hasPermission: roleCtx.hasPermission as never })
        if (!visitsQ) return
        const { data, count: visitCount } = await visitsQ
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
        overview.visits.count = visitCount ?? list.length // DB-15a: før = listens længde (højst 5)
        overview.visits.empty = list.length === 0
      } catch (err) {
        logger.error('getDashboardOverview: visits failed', { error: err })
        overview.errors.visits = err instanceof Error ? err.message : 'failed'
      }
    })(),
  ])

  return overview
}
