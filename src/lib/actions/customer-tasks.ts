'use server'
import { escapeLike } from '@/lib/validations/postgrest-filter'
import { secretTokenReader } from '@/lib/portal/token-reader'
import { escapeHtml, escapeHtmlWithLineBreaks } from '@/lib/utils/html-escape'

/**
 * Server Actions — Customer Tasks (Opgaver)
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'
import { sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import { generateBesigtigelseICS } from '@/lib/utils/ics'
import { APP_URL } from '@/lib/constants'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import type { Permission } from '@/lib/auth/permissions'

/**
 * RBAC app-lag (P-006, runde 3): rettighedstjek FOER noget andet sker. Returnerer fejltekst ved afvisning
 * (null = tilladt), saa hver action kan svare i sin egen returtype. Kaster aldrig.
 */
async function gateDenied(permission: Permission): Promise<string | null> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    return ctx.hasPermission(permission) ? null : `Manglende tilladelse: ${permission}`
  } catch {
    return 'Ikke logget ind'
  }
}

/**
 * Kunde-review 2026-10-09 (#6): ændring/sletning af en opgave kræver kunderelationen (customers.edit) — ellers kun
 * egne opgaver (tildelt eller oprettet af brugeren). Før kunne montør/bogholderi (customers.view) slette enhver opgave
 * på enhver kunde, inkl. bookede besigtigelser.
 */
async function taskWriteDenied(taskId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return 'Ugyldigt opgave-id'
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('customers.view')) return 'Manglende tilladelse: customers.view'
    if (ctx.hasPermission('customers.edit')) return null
    const { data } = await ctx.supabase.from('customer_tasks').select('assigned_to, created_by').eq('id', taskId).maybeSingle()
    const t = data as { assigned_to: string | null; created_by: string | null } | null
    if (!t) return 'Opgaven blev ikke fundet'
    return t.assigned_to === ctx.userId || t.created_by === ctx.userId ? null : 'Du kan kun ændre dine egne opgaver'
  } catch {
    return 'Ikke logget ind'
  }
}
import type {
  CustomerTaskWithRelations,
  CreateCustomerTaskInput,
  UpdateCustomerTaskInput,
} from '@/types/customer-tasks.types'

// =====================================================
// HELPERS
// =====================================================

type ProfileMap = Record<string, { id: string; full_name: string | null; email: string }>

async function enrichWithProfiles(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  tasks: CustomerTaskWithRelations[]
): Promise<CustomerTaskWithRelations[]> {
  const assignedIds = [...new Set(tasks.map((t) => t.assigned_to).filter(Boolean))] as string[]
  if (assignedIds.length === 0) return tasks

  // Sprint 7E fix — profiles RLS begraenser authenticated user til at se
  // egen profile. Konsekvens: tasks tildelt andre brugere viste
  // "Ikke tildelt" i UI'et fordi enrichment-lookup'et returnerede
  // tom map. Vi bypasser RLS via admin-client server-side. Samme
  // moenster som getActiveProfiles + getTeamMembers.
  const admin = createAdminClient()
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', assignedIds)

  const profileMap: ProfileMap = {}
  for (const p of profiles || []) {
    profileMap[p.id] = p as ProfileMap[string]
  }

  // Berig email fra auth.users naar profile.email er NULL.
  const missingEmail = Object.values(profileMap).filter((p) => !p.email).map((p) => p.id)
  if (missingEmail.length > 0) {
    try {
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 200 })
      for (const u of users || []) {
        const entry = profileMap[u.id]
        if (entry && !entry.email && u.email) {
          entry.email = u.email
        }
      }
    } catch {
      // ikke-kritisk
    }
  }

  return tasks.map((t) => ({
    ...t,
    assigned_profile: t.assigned_to ? profileMap[t.assigned_to] || null : null,
  }))
}

// =====================================================
// READ
// =====================================================

export async function getCustomerTasks(
  customerId: string
): Promise<CustomerTaskWithRelations[]> {
  // Kunde-review 2026-10-09 (#6): gate (før ingen) — enrichWithProfiles henter kollegers profiler med admin-klienten
  if (await gateDenied('customers.view')) return []
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return []
  const supabase = await createClient()

  // TK-5 (review 2026-10-17): montør kun egne opgaver (som getAllTasks) — før alle kundens opgaver inkl. beskrivelser
  const ctx = await getAuthenticatedClientWithRole()
  let q = supabase
    .from('customer_tasks')
    .select('*')
    .eq('customer_id', customerId)
  if (ctx.role === 'montør') q = q.eq('assigned_to', ctx.userId)
  const { data, error } = await q
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('Failed to fetch customer tasks', { error, entityId: customerId })
    return []
  }

  return enrichWithProfiles(supabase, (data || []) as CustomerTaskWithRelations[])
}

/**
 * Sprint Ø7.5 — opgaver knyttet til en sag (service_case_id). Intern, gated
 * cases.view (all/assigned). Bruges af sagens Opgaver-fane til at vise
 * opstartstjeklisten. Cost-free; ingen portal/kundevendt adgang.
 */
export async function getServiceCaseTasks(
  caseId: string
): Promise<CustomerTaskWithRelations[]> {
  if (!caseId) return []
  let supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase']
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('cases.view.all') && !ctx.hasPermission('cases.view.assigned')) {
      return []
    }
    // TK-4 (review 2026-10-17): kun sager i brugerens scope
    if (!ctx.hasPermission('cases.view.all')) {
      const { userCanViewCase } = await import('@/lib/auth/case-scope')
      if (!(await userCanViewCase(caseId, ctx))) return []
    }
    supabase = ctx.supabase
  } catch {
    return []
  }

  const { data, error } = await supabase
    .from('customer_tasks')
    .select('*')
    .eq('service_case_id', caseId)
    .order('created_at', { ascending: true })

  if (error) {
    logger.error('Failed to fetch service case tasks', { error, entityId: caseId })
    return []
  }

  return enrichWithProfiles(supabase, (data || []) as CustomerTaskWithRelations[])
}

export async function getAllTasks(options?: {
  status?: string
  priority?: string
  assignedTo?: string
  search?: string
  /** Kun opgaver med disse auto_rule-værdier (fx ELTA Assistant-opkald i kalenderen) */
  autoRules?: string[]
  /** P-11 (pilot-review 2026-10-16): forfaldsdato i [dueFrom, dueTo) (ISO) — kalenderens måned */
  dueFrom?: string
  dueTo?: string
  /** P-11: kast ved DB-fejl (kalenderen viser så en besked i stedet for en tom måned) */
  throwOnError?: boolean
  /** PF-7 (performance-review 2026-10-16): udelad udførte opgaver i databasen (før hentet og skjult i klienten) */
  excludeDone?: boolean
}): Promise<CustomerTaskWithRelations[]> {
  // Sprint 7E fix — scope tasks per rolle.
  // Montor maa kun se tasks tildelt til egen profile.id (assigned_to).
  // Andre roller (admin/serviceleder/salg/bogholderi) ser alle tasks.
  let role: string = 'montør'
  let userId: string | null = null
  let canViewAll = false
  let supabase: Awaited<ReturnType<typeof createClient>>
  try {
    const ctx = await getAuthenticatedClientWithRole()
    role = ctx.role
    userId = ctx.userId
    supabase = ctx.supabase
    // W-8 (pilot-review 2026-10-15): før ingen rettighedskontrol — alle indloggede så alle opgaver. Fuld liste kræver
    // tasks.view; andre (salg/bogholderi) ser kun opgaver de har oprettet eller er tildelt
    canViewAll = ctx.hasPermission('tasks.view')
  } catch {
    // Ikke logget ind — returnér tom liste.
    return []
  }

  let query = supabase
    .from('customer_tasks')
    .select(`
      *,
      customer:customers (
        id,
        company_name,
        customer_number,
        phone,
        mobile,
        email,
        billing_address,
        billing_postal_code,
        billing_city
      ),
      offer:offers (
        id,
        title,
        offer_number
      )
    `)
    .order('created_at', { ascending: false })

  // Sprint 7E — montor scope
  if (role === 'montør') {
    if (!userId) return []
    query = query.eq('assigned_to', userId)
  } else if (!canViewAll) {
    if (!userId) return []
    query = query.or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
  }

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status)
  }
  if (options?.priority && options.priority !== 'all') {
    query = query.eq('priority', options.priority)
  }
  if (options?.assignedTo && options.assignedTo !== 'all' && role !== 'montør') {
    // Montor's filter ignoreres — assigned_to er allerede fast til userId.
    query = query.eq('assigned_to', options.assignedTo)
  }
  if (options?.search) {
    // W-7: escapes (% og _ i søgningen matchede alt)
    query = query.ilike('title', `%${escapeLike(options.search)}%`)
  }
  if (options?.autoRules?.length) {
    query = query.in('auto_rule', options.autoRules)
  }
  if (options?.dueFrom) query = query.gte('due_date', options.dueFrom)
  if (options?.dueTo) query = query.lt('due_date', options.dueTo)
  if (options?.excludeDone) query = query.neq('status', 'done')

  // W-7: loft (listen voksede ubegrænset med alle udførte opgaver)
  const { data, error } = await query.limit(1000)

  if (error) {
    logger.error('Failed to fetch all tasks', { error })
    if (options?.throwOnError) throw new Error('Opgaverne kunne ikke hentes')
    return []
  }

  return enrichWithProfiles(supabase, (data || []) as CustomerTaskWithRelations[])
}

/**
 * PF-7 (performance-review 2026-10-16): antal UDFØRTE opgaver med samme rolle-scope og filtre som getAllTasks — til
 * "Udførte (N)"-knappen, når listen ikke henter de udførte (HEAD-count, ingen rækker).
 */
export async function countDoneTasks(options?: { priority?: string; assignedTo?: string; search?: string }): Promise<number> {
  let role: string = 'montør'
  let userId: string | null = null
  let canViewAll = false
  let supabase: Awaited<ReturnType<typeof createClient>>
  try {
    const ctx = await getAuthenticatedClientWithRole()
    role = ctx.role
    userId = ctx.userId
    supabase = ctx.supabase
    canViewAll = ctx.hasPermission('tasks.view')
  } catch {
    return 0
  }
  let q = supabase.from('customer_tasks').select('id', { count: 'exact', head: true }).eq('status', 'done')
  if (role === 'montør') {
    if (!userId) return 0
    q = q.eq('assigned_to', userId)
  } else if (!canViewAll) {
    if (!userId) return 0
    q = q.or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
  }
  if (options?.priority && options.priority !== 'all') q = q.eq('priority', options.priority)
  if (options?.assignedTo && options.assignedTo !== 'all' && role !== 'montør') q = q.eq('assigned_to', options.assignedTo)
  if (options?.search) q = q.ilike('title', `%${escapeLike(options.search)}%`)
  const { count, error } = await q
  if (error) {
    logger.error('countDoneTasks failed', { error })
    return 0
  }
  return count ?? 0
}

/**
 * Lightweight task counters for the sidebar badge.
 *
 * Sprint Performance 1: replaces the sidebar's getAllTasks() call, which
 * fetched the ENTIRE customer_tasks table (with customer + offer joins)
 * every 60 s just to count rows client-side. This uses two HEAD count
 * queries (count: 'exact', head: true) — no row payload is transferred at
 * all — while preserving the same role scoping (montør sees only own tasks)
 * and the same definitions (active = not done, overdue = active + past due).
 */
export async function getTaskCounts(): Promise<{ active: number; overdue: number }> {
  let role: string = 'montør'
  let userId: string | null = null
  let canViewAll = false
  let supabase: Awaited<ReturnType<typeof createClient>>
  try {
    const ctx = await getAuthenticatedClientWithRole()
    role = ctx.role
    userId = ctx.userId
    supabase = ctx.supabase
    canViewAll = ctx.hasPermission('tasks.view')
  } catch {
    return { active: 0, overdue: 0 }
  }

  const nowIso = new Date().toISOString()

  let activeQuery = supabase
    .from('customer_tasks')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'done')

  let overdueQuery = supabase
    .from('customer_tasks')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'done')
    .not('due_date', 'is', null)
    .lt('due_date', nowIso)

  // Sprint 7E — montør scope: only tasks assigned to the current user.
  if (role === 'montør') {
    if (!userId) return { active: 0, overdue: 0 }
    activeQuery = activeQuery.eq('assigned_to', userId)
    overdueQuery = overdueQuery.eq('assigned_to', userId)
  } else if (!canViewAll) {
    // W-8: samme afgrænsning som getAllTasks (egne oprettede/tildelte)
    if (!userId) return { active: 0, overdue: 0 }
    activeQuery = activeQuery.or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
    overdueQuery = overdueQuery.or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
  }

  const [activeRes, overdueRes] = await Promise.all([activeQuery, overdueQuery])

  if (activeRes.error || overdueRes.error) {
    logger.error('Failed to fetch task counts', { error: activeRes.error || overdueRes.error })
    return { active: 0, overdue: 0 }
  }

  return { active: activeRes.count ?? 0, overdue: overdueRes.count ?? 0 }
}

export async function getMyPendingReminders(): Promise<CustomerTaskWithRelations[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('customer_tasks')
    .select(`
      *,
      customer:customers (
        id,
        company_name,
        customer_number
      ),
      offer:offers (
        id,
        title,
        offer_number
      )
    `)
    .eq('assigned_to', user.id)
    .neq('status', 'done')
    .lte('reminder_at', now)
    .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
    .order('reminder_at', { ascending: true })
    .limit(50) // TK-10 (review 2026-10-17): pollen kører hvert minut — højst 50 påmindelser ad gangen

  if (error) {
    logger.error('Failed to fetch reminders', { error })
    return []
  }

  return enrichWithProfiles(supabase, (data || []) as CustomerTaskWithRelations[])
}

export async function getActiveProfiles(): Promise<
  Array<{ id: string; full_name: string | null; email: string; role?: string | null }>
> {
  // Sprint 7E fix — profiles RLS begraenser authenticated users til at
  // se egen profile only. For at vise alle interne brugere i tasks
  // assignee-dropdown skal vi bypasse RLS via admin-client.
  // Permission gate: kun roller der maa se brugerlister.
  let allowed = false
  try {
    const ctx = await getAuthenticatedClientWithRole()
    allowed = ctx.hasPermission('users.view') || ctx.hasPermission('tasks.create')
  } catch {
    return []
  }
  if (!allowed) return []

  const admin = createAdminClient()

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, full_name, email, role')
    .order('full_name', { ascending: true })

  if (error) {
    logger.error('Failed to fetch profiles', { error })
    return []
  }

  // Berig med auth.users.email saa profiler uden profile.email stadig
  // har et brugbart label.
  let authEmailMap = new Map<string, string>()
  try {
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 200 })
    authEmailMap = new Map(
      (users || []).map((u) => [u.id, u.email ?? ''] as const).filter((x) => x[1])
    )
  } catch {
    // ikke-kritisk; fortsat med profile.email-only
  }

  return (profiles ?? []).map((p) => ({
    id: p.id as string,
    full_name: (p.full_name as string | null) || null,
    email: (p.email as string | null) || authEmailMap.get(p.id as string) || '',
    role: (p.role as string | null) ?? null,
  }))
}

// =====================================================
// WRITE
// =====================================================

/**
 * PM2-5 (Henrik 2026-10-19): må brugeren oprette en opgave på kunden? tasks.create (admin/serviceleder/salg/bogholderi)
 * generelt; montør kun på en kunde, hvor en (ikke annulleret) arbejdsordre er tildelt montøren — og kun til sig selv.
 */
async function taskCreateRule(customerId: string): Promise<{ allowed: false; reason: string } | { allowed: true; selfOnly: boolean; userId: string }> {
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('customers.view')) return { allowed: false, reason: 'Manglende tilladelse: customers.view' }
  if (ctx.hasPermission('tasks.create')) return { allowed: true, selfOnly: false, userId: ctx.userId }
  if (ctx.hasPermission('work_orders.view.assigned')) {
    const { getWorkOrderEmployeeScope } = await import('@/lib/auth/case-scope')
    const scope = await getWorkOrderEmployeeScope({ supabase: ctx.supabase, userId: ctx.userId, role: ctx.role })
    if (scope.type === 'employee' && scope.employeeId) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { count } = await createAdminClient().from('work_orders').select('id, service_cases!inner(customer_id)', { count: 'exact', head: true })
        .eq('assigned_employee_id', scope.employeeId).neq('status', 'cancelled').eq('service_cases.customer_id', customerId)
      if ((count ?? 0) > 0) return { allowed: true, selfOnly: true, userId: ctx.userId }
    }
    return { allowed: false, reason: 'Montører kan kun oprette opgaver på kunder med en arbejdsordre tildelt dem' }
  }
  return { allowed: false, reason: 'Manglende tilladelse: tasks.create' }
}

/** PM2-5: hvad brugeren må på kundekortets opgaveliste (UI viser kun handlinger serveren tillader) */
export async function getCustomerTaskAbilitiesAction(customerId: string): Promise<{ canCreate: boolean; canEditAll: boolean; userId: string | null }> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(customerId)) return { canCreate: false, canEditAll: false, userId: null }
    const rule = await taskCreateRule(customerId)
    const ctx = await getAuthenticatedClientWithRole()
    return { canCreate: rule.allowed, canEditAll: ctx.hasPermission('customers.edit'), userId: ctx.userId }
  } catch {
    return { canCreate: false, canEditAll: false, userId: null }
  }
}

export async function createCustomerTask(
  input: CreateCustomerTaskInput
): Promise<{ success: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(String(input.customer_id ?? ''))) return { success: false, error: 'Ugyldig kunde' }
  const rule = await taskCreateRule(input.customer_id).catch(() => ({ allowed: false as const, reason: 'Ikke logget ind' }))
  if (!rule.allowed) return { success: false, error: rule.reason }
  // montør: kun til sig selv
  if (rule.selfOnly && input.assigned_to && input.assigned_to !== rule.userId) return { success: false, error: 'Montører kan kun oprette opgaver til sig selv' }
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Ikke logget ind' }

  // CU-8 (kunde-review 2026-10-17): tilbuddet skal høre til kunden, og den ansvarlige skal være en aktiv bruger
  // (før blev begge taget ukontrolleret fra klienten)
  if (input.offer_id) {
    const { data: off } = await supabase.from('offers').select('customer_id').eq('id', input.offer_id).maybeSingle()
    if (!off || (off as { customer_id: string | null }).customer_id !== input.customer_id) return { success: false, error: 'Tilbuddet hører ikke til kunden' }
  }
  if (input.assigned_to && input.assigned_to !== user.id) {
    const { data: prof } = await supabase.from('profiles').select('is_active').eq('id', input.assigned_to).maybeSingle()
    if (!prof || (prof as { is_active: boolean | null }).is_active === false) return { success: false, error: 'Den ansvarlige findes ikke eller er deaktiveret' }
  }

  const { error } = await supabase.from('customer_tasks').insert({
    customer_id: input.customer_id,
    offer_id: input.offer_id || null,
    title: input.title,
    description: input.description || null,
    priority: input.priority || 'normal',
    assigned_to: input.assigned_to || user.id,
    due_date: input.due_date || null,
    reminder_at: input.reminder_at || null,
    created_by: user.id,
  })

  if (error) {
    logger.error('Failed to create customer task', { error })
    return { success: false, error: formatError(error, 'Opgaven kunne ikke oprettes') }
  }

  revalidatePath(`/dashboard/customers/${input.customer_id}`)
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/offers')
  return { success: true }
}

export async function updateCustomerTask(
  input: UpdateCustomerTaskInput
): Promise<{ success: boolean; error?: string }> {
  const denied = (await gateDenied('customers.view')) ?? (await taskWriteDenied(input.id))
  if (denied) return { success: false, error: denied }
  const supabase = await createClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (input.title !== undefined) updates.title = input.title
  if (input.description !== undefined) updates.description = input.description
  if (input.status !== undefined) updates.status = input.status
  if (input.priority !== undefined) updates.priority = input.priority
  if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to
  if (input.due_date !== undefined) updates.due_date = input.due_date
  if (input.reminder_at !== undefined) updates.reminder_at = input.reminder_at
  if (input.snoozed_until !== undefined) updates.snoozed_until = input.snoozed_until
  // TK-3 (review 2026-10-17): ny påmindelse/forfald eller genåbning ophæver en tidligere "skjul"/udsæt — før forblev
  // påmindelsen skjult i op til 7 dage. Kun ved REEL ændring (formularerne sender felterne ved hver gem).
  if (input.snoozed_until === undefined && (input.reminder_at !== undefined || input.due_date !== undefined || input.status !== undefined)) {
    const { data: cur } = await supabase.from('customer_tasks').select('reminder_at, due_date, status, snoozed_until').eq('id', input.id).maybeSingle()
    const c = cur as { reminder_at: string | null; due_date: string | null; status: string; snoozed_until: string | null } | null
    const ts = (v: string | null | undefined) => (v ? Date.parse(v) : null)
    const changed = !!c && (
      (input.reminder_at !== undefined && ts(input.reminder_at) !== ts(c.reminder_at))
      || (input.due_date !== undefined && ts(input.due_date) !== ts(c.due_date))
      || (input.status !== undefined && input.status !== c.status && input.status !== 'done'))
    if (changed && c?.snoozed_until) updates.snoozed_until = null
  }

  const { error } = await supabase
    .from('customer_tasks')
    .update(updates)
    .eq('id', input.id)

  if (error) {
    logger.error('Failed to update customer task', { error, entityId: input.id })
    return { success: false, error: formatError(error, 'Opgaven kunne ikke opdateres') }
  }

  revalidatePath('/dashboard/customers')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

export async function completeCustomerTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const denied = (await gateDenied('customers.view')) ?? (await taskWriteDenied(taskId))
  if (denied) return { success: false, error: denied }
  const supabase = await createClient()

  const { error } = await supabase
    .from('customer_tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    logger.error('Failed to complete customer task', { error, entityId: taskId })
    return { success: false, error: formatError(error, 'Opgaven kunne ikke markeres som udført') }
  }

  revalidatePath('/dashboard/customers')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

export async function deleteCustomerTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const denied = (await gateDenied('customers.view')) ?? (await taskWriteDenied(taskId))
  if (denied) return { success: false, error: denied }
  const supabase = await createClient()

  const { error } = await supabase
    .from('customer_tasks')
    .delete()
    .eq('id', taskId)

  if (error) {
    logger.error('Failed to delete customer task', { error, entityId: taskId })
    return { success: false, error: formatError(error, 'Opgaven kunne ikke slettes') }
  }

  revalidatePath('/dashboard/customers')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

export async function snoozeTask(
  taskId: string,
  until: string
): Promise<{ success: boolean; error?: string }> {
  const denied = (await gateDenied('customers.view')) ?? (await taskWriteDenied(taskId))
  if (denied) return { success: false, error: denied }
  const supabase = await createClient()

  const { error } = await supabase
    .from('customer_tasks')
    .update({
      snoozed_until: until,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    logger.error('Failed to snooze task', { error, entityId: taskId })
    return { success: false, error: formatError(error, 'Opgaven kunne ikke udsættes') }
  }

  revalidatePath('/dashboard/customers')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

// =====================================================
// BESIGTIGELSE (Book inspection visit)
// =====================================================

export async function bookBesigtigelse(
  customerId: string,
  customerName: string,
  _customerEmail: string, // modtageren vælges af mail-routeren
  date: string,
  time: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  // Mail-review 2026-10-08 (#7): sender kundemail → kræver redigeringsret (før customers.view, inkl. montør/bogholderi)
  const denied = await gateDenied('customers.edit')
  if (denied) return { success: false, error: denied }
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Ikke logget ind' }

    // Format date for display (e.g. "18. marts 2026")
    const dateObj = new Date(date)
    const formattedDate = dateObj.toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    // Fetch customer address + portal token
    const { data: customer } = await supabase
      .from('customers')
      .select('billing_address, billing_city, billing_postal_code, shipping_address, shipping_city, shipping_postal_code')
      .eq('id', customerId)
      .single()

    const { data: portalTokens } = await (await secretTokenReader())
      .from('portal_access_tokens')
      .select('token')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      // PM-3 (portal-review 2026-10-17): aldrig et udløbet link i bekræftelsesmail/ICS
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(1)

    const portalToken = portalTokens?.[0]?.token
    const portalUrl = portalToken ? `${APP_URL}/portal/${portalToken}` : null

    // Build customer address string
    const address = customer?.shipping_address || customer?.billing_address || ''
    const city = customer?.shipping_city || customer?.billing_city || ''
    const postal = customer?.shipping_postal_code || customer?.billing_postal_code || ''
    const fullAddress = [address, `${postal} ${city}`.trim()].filter(Boolean).join(', ')

    // Generate ICS calendar file
    const icsContent = generateBesigtigelseICS({
      title: 'Besigtigelse: Elta Solar',
      location: fullAddress || undefined,
      description: portalUrl
        ? `Vi glæder os til at se dig. Du kan altid finde dine dokumenter og detaljer her: ${portalUrl}`
        : 'Vi glæder os til at se dig.',
      startDate: date,
      startTime: time,
    })

    // Send confirmation email via Graph API
    const subject = `Bekræftelse: Besigtigelse d. ${formattedDate}`
    const html = `
      <!DOCTYPE html>
      <html lang="da">
      <head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f4f4f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
          <tr>
            <td style="background-color:#1e3a5f;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Elta Solar</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:18px;">Bekræftelse af besigtigelse</h2>
              <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
                Kære ${escapeHtml(customerName)},
              </p>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
                Vi bekræfter hermed jeres besigtigelse på følgende tidspunkt:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                    <strong style="color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Dato</strong><br/>
                    <span style="color:#1e293b;font-size:15px;">${formattedDate}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <strong style="color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Tidspunkt</strong><br/>
                    <span style="color:#1e293b;font-size:15px;">${escapeHtml(time)}</span>
                  </td>
                </tr>
              </table>
              ${notes ? `
              <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
                <strong>Bemærkninger:</strong>
              </p>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;background-color:#f8fafc;padding:12px 16px;border-radius:6px;border-left:3px solid #1e3a5f;">
                ${escapeHtmlWithLineBreaks(notes)}
              </p>
              ` : ''}
              ${portalUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#1e40af;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
                      Se din besigtigelse i kundeportalen
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
              <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
                Har du spørgsmål eller ønsker at ændre tidspunktet, er du velkommen til at kontakte os.
              </p>
              <p style="margin:24px 0 0;color:#374151;font-size:15px;line-height:1.6;">
                Med venlig hilsen,<br/>
                <strong>Elta Solar ApS</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                Elta Solar ApS &bull; Denne e-mail er sendt automatisk
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `.trim()

    // Sprint 8H Phase 4: central mail-router (besigtigelse-intent).
    // Kun customerId tilgaengelig — routen falder tilbage paa
    // paying_customer (samme som customerEmail-param tidligere).
    const { resolveBesigtigelseMailRoute, logMailRoute } = await import(
      '@/lib/actions/mail-route-resolvers'
    )
    const routeResult = await resolveBesigtigelseMailRoute(customerId)
    if (!routeResult.ok || !routeResult.route) {
      logger.error('bookBesigtigelse mail-route failed', {
        error: routeResult.error,
        entityId: customerId,
      })
      return { success: false, error: routeResult.error || 'Kunne ikke bygge mail-route' }
    }
    const route = routeResult.route

    // Mail-review 2026-10-08 (#7): opgaven oprettes FØR mailen og er kravet. Før: mail først → fejlede opgaven (eller
    // fik mailen timeout), bookede brugeren igen → kunden fik to bekræftelser med to kalenderinvitationer.
    const title = `Besigtigelse hos ${customerName}`
    // TZ-3 (format-review 2026-10-18): due_date er timestamptz — kun datoen gav UTC-midnat (02:00 dansk), så besigtigelsen
    // forsvandt fra "Kommende" og talte som forsinket fra 02:00 på selve dagen. Nu det bookede klokkeslæt i dansk tid.
    const { copenhagenLocalToIso } = await import('@/lib/utils/copenhagen-time')
    const dueIso = /^\d{2}:\d{2}$/.test(time) ? copenhagenLocalToIso(date, time) : copenhagenLocalToIso(date, '08:00')
    const { data: dup } = await supabase.from('customer_tasks').select('id')
      .eq('customer_id', customerId).eq('title', title).eq('due_date', dueIso)
      .gte('created_at', new Date(Date.now() - 2 * 60_000).toISOString()).limit(1)
    if ((dup ?? []).length > 0) {
      return { success: true } // dobbeltklik: allerede booket og mailet
    }
    const baseDescription = [
      `Besigtigelse planlagt d. ${formattedDate} kl. ${time}`,
      fullAddress ? `Adresse: ${fullAddress}` : null,
      notes ? `Bemærkninger: ${notes}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    const { data: task, error: taskError } = await supabase.from('customer_tasks').insert({
      customer_id: customerId,
      title,
      description: `${baseDescription}\nBekræftelses-email sendes til ${route.toEmail}`,
      priority: 'high',
      due_date: dueIso,
      assigned_to: user.id,
      created_by: user.id,
    }).select('id').single()

    if (taskError || !task) {
      logger.error('Failed to create besigtigelse task', { error: taskError, entityId: customerId })
      return { success: false, error: taskError?.message ?? 'Kunne ikke oprette opgaven' }
    }
    const taskId = (task as { id: string }).id
    // ML-9 (mail-review 2026-10-17): tjek-så-indsæt kunne overhales af et samtidigt klik (begge passerede tjekket) → to
    // bekræftelser + to kalenderinvitationer. Efter indsættelsen vinder kun den ÆLDSTE identiske opgave; taberen fjerner
    // sin egen og sender intet.
    {
      const { data: same } = await supabase.from('customer_tasks').select('id, created_at')
        .eq('customer_id', customerId).eq('title', title).eq('due_date', dueIso)
        .gte('created_at', new Date(Date.now() - 2 * 60_000).toISOString())
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(5)
      const first = ((same ?? []) as Array<{ id: string }>)[0]
      if (first && first.id !== taskId) {
        await supabase.from('customer_tasks').delete().eq('id', taskId)
        return { success: true } // samtidigt klik: den anden anmodning booker og mailer
      }
    }

    const emailResult = await sendEmailViaGraph({
      to: route.toEmail,
      subject,
      html,
      attachments: [
        {
          filename: 'besigtigelse.ics',
          content: Buffer.from(icsContent, 'utf-8'),
          contentType: 'text/calendar',
        },
      ],
    })
    await logMailRoute(
      route,
      emailResult.success ? 'sent' : 'failed',
      { source: 'book_besigtigelse', error: emailResult.error, uncertain: emailResult.uncertain ?? false }
    )
    if (!emailResult.success && !emailResult.uncertain) {
      logger.error('Failed to send besigtigelse confirmation email', {
        error: emailResult.error,
        entityId: customerId,
      })
      await supabase.from('customer_tasks').delete().eq('id', taskId)
      return { success: false, error: `Kunne ikke sende bekræftelses-email: ${emailResult.error}` }
    }
    await supabase.from('customer_tasks').update({
      description: emailResult.uncertain
        ? `${baseDescription}\n⚠ Bekræftelses-email til ${route.toEmail}: ukendt udfald (timeout) — tjek Sendt post, book ikke igen`
        : `${baseDescription}\nBekræftelses-email sendt til ${route.toEmail}`,
    }).eq('id', taskId)

    revalidatePath('/dashboard/customers')
    revalidatePath('/dashboard/tasks')
    revalidatePath('/dashboard/calendar')
    return { success: true }
  } catch (err) {
    logger.error('Unexpected error in bookBesigtigelse', { error: err })
    return { success: false, error: 'Uventet fejl ved booking af besigtigelse' }
  }
}

// =====================================================
// PRICE ALERTS (system_alerts)
// =====================================================

export interface PriceAlert {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  details: Record<string, unknown>
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
}

export async function getUnreadPriceAlerts(): Promise<PriceAlert[]> {
  // Pris-/marginadvarsler: samme rettighed som klokkens systemadvarsler (economy.cost_prices, D49) — DB'en (00194) håndhæver det samme
  if (await gateDenied('economy.cost_prices')) return []
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('system_alerts')
      .select('*')
      .in('alert_type', ['price_change', 'price_increase', 'price_decrease', 'margin_below'])
      .eq('is_read', false)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      // system_alerts findes ikke i prod/staging (00046 aldrig kørt) — ikke en fejl, bare ingen advarsler
      if (error.code === 'PGRST205') return []
      logger.error('Failed to fetch price alerts', { error })
      return []
    }

    return data || []
  } catch {
    return []
  }
}

export async function dismissPriceAlert(
  alertId: string
): Promise<{ success: boolean }> {
  const denied = await gateDenied('economy.cost_prices')
  if (denied) return { success: false }
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('system_alerts')
      .update({
        is_dismissed: true,
        dismissed_at: new Date().toISOString(),
      })
      .eq('id', alertId)

    if (error) {
      logger.error('Failed to dismiss price alert', { error })
      return { success: false }
    }

    return { success: true }
  } catch {
    return { success: false }
  }
}

export async function markPriceAlertRead(
  alertId: string
): Promise<{ success: boolean }> {
  if (await gateDenied('economy.cost_prices')) return { success: false }
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('system_alerts')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', alertId)

    if (error) return { success: false }
    return { success: true }
  } catch {
    return { success: false }
  }
}
