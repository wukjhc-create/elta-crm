/**
 * 00247: kontrollerede brugerhandlinger på opkald. Bevidst IKKE 'use server' — server-handlingerne i
 * lib/actions/telephony-calls.ts giver kontekst (brugerens klient + effektive rettigheder), og harnessen kan køre samme
 * logik med persona-klienter.
 *
 * Regler (låste beslutninger 2026-11-03):
 *  - Læsning med BRUGERENS klient (RLS): ubekræftede opkald kræver calls.view_unmatched; bekræftede calls.view + kunde i
 *    læse-scope. Et kunde-forslag vises kun, hvis brugeren selv kan se kunden — forslaget giver aldrig adgang.
 *  - Kunde og sag er SEPARATE handlinger (calls.match). Opkald, kunde og sag skal kunne ses af brugeren med egen klient;
 *    sagen skal høre til den bekræftede kunde (også håndhævet af DB-triggeren). Id'er fra webhooken bruges aldrig.
 *  - Skrivning via service_role-funktionen telephony_set_call_match: optimistisk lås (match_version) + audit_logs i samme
 *    transaktion. Intet her opretter opgave, påmindelse, SMS eller kundekommunikation.
 *  - Medarbejder-kobling (Relatel-id → profil) kun med users.manage_roles; aldrig ud fra navn.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Permission } from '@/lib/auth/permissions'
import { isMissingTelephonySchema } from '@/lib/integrations/telephony/persist'

export interface CallActionCtx {
  /** brugerens egen klient (RLS) */
  supabase: SupabaseClient
  /** service_role — kun til de kontrollerede funktioner/koblinger */
  admin: SupabaseClient
  userId: string
  hasPermission: (p: Permission) => boolean
}

export const TELEPHONY_UNAVAILABLE_TEXT = 'Opkaldshistorik er ikke slået til her endnu.'
const STALE_TEXT = 'Opkaldet er ændret af en anden i mellemtiden. Genindlæs og prøv igen.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CallActionResult =
  | { success: true; outcome: string; version: number }
  | { success: false; error: string; unavailable?: boolean }

export interface CallListItem {
  id: string
  direction: 'inbound' | 'outbound' | null
  number: string | null
  started_at: string
  answered_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  status: string
  missed: boolean
  has_voicemail: boolean
  voicemail_duration_seconds: number | null
  employee_profile_id: string | null
  match_status: string
  match_version: number
  candidate_count: number
  customer: { id: string; name: string } | null
  service_case_id: string | null
  /** kun når brugeren selv kan se den foreslåede kunde */
  suggestion: { id: string; name: string } | null
}

// Ingen udbyder-id'er (opkald, medarbejder, telefonsvarer) ud til UI'et
const LIST_COLUMNS = 'id, direction, external_number_normalized, started_at, answered_at, ended_at, duration_seconds, status, missed, has_voicemail, voicemail_duration_seconds, employee_profile_id, match_status, match_version, candidate_count, customer_id, suggested_customer_id, service_case_id'

export async function listCallsCore(ctx: CallActionCtx, opts: { limit?: number; unconfirmedOnly?: boolean } = {}): Promise<{ available: boolean; calls: CallListItem[]; error?: string }> {
  if (!ctx.hasPermission('calls.view') && !ctx.hasPermission('calls.view_unmatched')) return { available: false, calls: [], error: 'Du har ikke adgang til opkald.' }
  let q = ctx.supabase.from('telephony_calls').select(LIST_COLUMNS).order('started_at', { ascending: false }).limit(Math.min(Math.max(opts.limit ?? 50, 1), 200))
  if (opts.unconfirmedOnly) q = q.is('customer_id', null)
  const { data, error } = await q
  if (isMissingTelephonySchema(error)) return { available: false, calls: [], error: TELEPHONY_UNAVAILABLE_TEXT }
  if (error) return { available: true, calls: [], error: 'Opkald kunne ikke hentes.' }
  const rows = (data ?? []) as Array<Record<string, any>>
  const ids = [...new Set(rows.flatMap((r) => [r.customer_id, r.suggested_customer_id]).filter(Boolean))] as string[]
  // brugerens egen klient: kunder uden for brugerens scope kommer ikke med → forslaget skjules
  const { data: custs } = ids.length ? await ctx.supabase.from('customers').select('id, company_name').in('id', ids) : { data: [] }
  const names = new Map(((custs ?? []) as Array<{ id: string; company_name: string }>).map((c) => [c.id, c.company_name]))
  return {
    available: true,
    calls: rows.map((r) => ({
      id: r.id, direction: r.direction, number: r.external_number_normalized, started_at: r.started_at, answered_at: r.answered_at,
      ended_at: r.ended_at, duration_seconds: r.duration_seconds, status: r.status, missed: r.missed, has_voicemail: r.has_voicemail,
      voicemail_duration_seconds: r.voicemail_duration_seconds, employee_profile_id: r.employee_profile_id, match_status: r.match_status,
      match_version: r.match_version, candidate_count: r.candidate_count, service_case_id: r.service_case_id,
      customer: r.customer_id ? { id: r.customer_id, name: names.get(r.customer_id) ?? 'Kunde' } : null,
      suggestion: r.suggested_customer_id && names.has(r.suggested_customer_id) ? { id: r.suggested_customer_id, name: names.get(r.suggested_customer_id)! } : null,
    })),
  }
}

/** Opkaldet med brugerens klient (RLS): findes det ikke for brugeren, findes det ikke */
async function visibleCall(ctx: CallActionCtx, callId: string): Promise<{ call?: { id: string; customer_id: string | null; match_version: number }; error?: string; unavailable?: boolean }> {
  const { data, error } = await ctx.supabase.from('telephony_calls').select('id, customer_id, match_version').eq('id', callId).maybeSingle()
  if (isMissingTelephonySchema(error)) return { error: TELEPHONY_UNAVAILABLE_TEXT, unavailable: true }
  if (error) return { error: 'Opkaldet kunne ikke hentes.' }
  if (!data) return { error: 'Opkaldet findes ikke.' }
  return { call: data as { id: string; customer_id: string | null; match_version: number } }
}

async function runMatch(ctx: CallActionCtx, callId: string, expectedVersion: number, action: 'confirm' | 'link_case' | 'reject', customerId: string | null, caseId: string | null): Promise<CallActionResult> {
  const { data, error } = await ctx.admin.rpc('telephony_set_call_match', {
    p_call_id: callId, p_expected_version: expectedVersion, p_action: action, p_customer_id: customerId, p_service_case_id: caseId, p_actor: ctx.userId,
  })
  if (isMissingTelephonySchema(error)) return { success: false, error: TELEPHONY_UNAVAILABLE_TEXT, unavailable: true }
  if (error?.code === '23514') return { success: false, error: 'Sagen hører ikke til opkaldets kunde.' }
  if (error?.code === '42501') return { success: false, error: 'Din bruger er ikke aktiv.' }
  if (error) return { success: false, error: 'Opkaldet kunne ikke opdateres.' }
  const row = (Array.isArray(data) ? data[0] : data) as { outcome: string; match_version: number | null } | null
  if (!row) return { success: false, error: 'Opkaldet kunne ikke opdateres.' }
  if (row.outcome === 'stale') return { success: false, error: STALE_TEXT }
  if (row.outcome === 'not_found') return { success: false, error: 'Opkaldet findes ikke.' }
  return { success: true, outcome: row.outcome, version: row.match_version ?? expectedVersion }
}

function badInput(...ids: Array<string | null>): string | null {
  return ids.every((id) => id === null || UUID.test(id)) ? null : 'Ugyldigt id.'
}

/** Bekræft/ret opkaldets kunde (aldrig automatisk). En ændret kunde fjerner en tidligere sag. */
export async function confirmCallCustomerCore(ctx: CallActionCtx, callId: string, customerId: string, expectedVersion: number): Promise<CallActionResult> {
  if (!ctx.hasPermission('calls.match')) return { success: false, error: 'Du har ikke adgang til at koble opkald til kunder.' }
  const bad = badInput(callId, customerId) ?? (Number.isInteger(expectedVersion) && expectedVersion >= 0 ? null : 'Ugyldig version.')
  if (bad) return { success: false, error: bad }
  const v = await visibleCall(ctx, callId)
  if (!v.call) return { success: false, error: v.error!, unavailable: v.unavailable }
  const { data: cust } = await ctx.supabase.from('customers').select('id').eq('id', customerId).maybeSingle()
  if (!cust) return { success: false, error: 'Kunden findes ikke.' }
  return runMatch(ctx, callId, expectedVersion, 'confirm', customerId, null)
}

/** Kobl (eller fjern, caseId = null) en sag på den bekræftede kunde. Sagen skal kunne ses af brugeren og høre til kunden. */
export async function linkCallCaseCore(ctx: CallActionCtx, callId: string, caseId: string | null, expectedVersion: number): Promise<CallActionResult> {
  if (!ctx.hasPermission('calls.match')) return { success: false, error: 'Du har ikke adgang til at koble opkald til sager.' }
  const bad = badInput(callId, caseId) ?? (Number.isInteger(expectedVersion) && expectedVersion >= 0 ? null : 'Ugyldig version.')
  if (bad) return { success: false, error: bad }
  const v = await visibleCall(ctx, callId)
  if (!v.call) return { success: false, error: v.error!, unavailable: v.unavailable }
  if (!v.call.customer_id) return { success: false, error: 'Bekræft opkaldets kunde, før en sag kobles på.' }
  if (caseId) {
    const { data: kase } = await ctx.supabase.from('service_cases').select('id, customer_id, is_proposal').eq('id', caseId).maybeSingle()
    if (!kase || (kase as { is_proposal: boolean | null }).is_proposal) return { success: false, error: 'Sagen findes ikke.' }
    if ((kase as { customer_id: string | null }).customer_id !== v.call.customer_id) return { success: false, error: 'Sagen hører ikke til opkaldets kunde.' }
  }
  return runMatch(ctx, callId, expectedVersion, 'link_case', v.call.customer_id, caseId)
}

/** Fjern et forkert match/forslag (kunde, sag og forslag nulstilles; opkaldet foreslås ikke igen) */
export async function rejectCallMatchCore(ctx: CallActionCtx, callId: string, expectedVersion: number): Promise<CallActionResult> {
  if (!ctx.hasPermission('calls.match')) return { success: false, error: 'Du har ikke adgang til at rette opkald.' }
  const bad = badInput(callId) ?? (Number.isInteger(expectedVersion) && expectedVersion >= 0 ? null : 'Ugyldig version.')
  if (bad) return { success: false, error: bad }
  const v = await visibleCall(ctx, callId)
  if (!v.call) return { success: false, error: v.error!, unavailable: v.unavailable }
  return runMatch(ctx, callId, expectedVersion, 'reject', null, null)
}

const PROVIDER_EMPLOYEE_ID = /^[A-Za-z0-9_.:@-]{1,64}$/

/**
 * Relatel-medarbejder-id → profil (users.manage_roles). profileId = null deaktiverer koblingen. En profil har højst én
 * aktiv kobling: en tidligere aktiv kobling for profilen deaktiveres. Historik bevares (ingen sletning). Auditeret.
 */
export async function setEmployeeLinkCore(ctx: CallActionCtx, providerEmployeeId: string, profileId: string | null): Promise<{ success: boolean; error?: string; outcome?: string }> {
  if (!ctx.hasPermission('users.manage_roles')) return { success: false, error: 'Du har ikke adgang til at koble telefoni-medarbejdere.' }
  const empId = (providerEmployeeId ?? '').trim()
  if (!PROVIDER_EMPLOYEE_ID.test(empId)) return { success: false, error: 'Ugyldigt Relatel-medarbejder-id.' }
  if (profileId !== null && !UUID.test(profileId)) return { success: false, error: 'Ugyldig bruger.' }
  const { data: existing, error: exErr } = await ctx.admin.from('telephony_employee_links').select('profile_id, is_active')
    .eq('provider', 'relatel').eq('provider_employee_id', empId).maybeSingle()
  if (isMissingTelephonySchema(exErr)) return { success: false, error: TELEPHONY_UNAVAILABLE_TEXT }
  if (exErr) return { success: false, error: 'Koblingen kunne ikke hentes.' }
  const prev = existing as { profile_id: string; is_active: boolean } | null
  const now = new Date().toISOString()
  let outcome: string
  if (profileId === null) {
    if (!prev || !prev.is_active) return { success: true, outcome: 'unchanged' }
    const { error } = await ctx.admin.from('telephony_employee_links').update({ is_active: false, updated_at: now }).eq('provider', 'relatel').eq('provider_employee_id', empId)
    if (error) return { success: false, error: 'Koblingen kunne ikke deaktiveres.' }
    outcome = 'deactivated'
  } else {
    const { data: prof } = await ctx.admin.from('profiles').select('id, is_active').eq('id', profileId).maybeSingle()
    if (!prof || (prof as { is_active: boolean | null }).is_active === false) return { success: false, error: 'Brugeren findes ikke eller er deaktiveret.' }
    if (prev && prev.is_active && prev.profile_id === profileId) return { success: true, outcome: 'unchanged' }
    const { error: offErr } = await ctx.admin.from('telephony_employee_links').update({ is_active: false, updated_at: now })
      .eq('provider', 'relatel').eq('profile_id', profileId).eq('is_active', true).neq('provider_employee_id', empId)
    if (offErr) return { success: false, error: 'Koblingen kunne ikke gemmes.' }
    const { error } = prev
      ? await ctx.admin.from('telephony_employee_links').update({ profile_id: profileId, is_active: true, updated_at: now }).eq('provider', 'relatel').eq('provider_employee_id', empId)
      : await ctx.admin.from('telephony_employee_links').insert({ provider: 'relatel', provider_employee_id: empId, profile_id: profileId, is_active: true })
    if (error?.code === '23505') return { success: false, error: 'Koblingen findes allerede.' }
    if (error) return { success: false, error: 'Koblingen kunne ikke gemmes.' }
    outcome = prev ? (prev.profile_id === profileId ? 'reactivated' : 'changed') : 'created'
  }
  await ctx.admin.from('audit_logs').insert({
    user_id: ctx.userId, entity_type: 'telephony_employee_link', entity_id: profileId ?? prev?.profile_id ?? null, action: `telephony_employee_link_${outcome}`,
    action_description: 'Telefoni-medarbejderkobling ændret',
    changes: { profile_id: { old: prev?.profile_id ?? null, new: profileId }, is_active: { old: prev?.is_active ?? null, new: profileId !== null } },
    metadata: { provider: 'relatel', provider_employee_id: empId },
  })
  return { success: true, outcome }
}
