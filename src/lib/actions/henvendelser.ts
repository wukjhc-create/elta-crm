'use server'

/**
 * Henvendelser — server-actions (AI-receptionist fase 2). Alle kald bruger den indloggede medarbejders RLS-klient;
 * ingen service-role (undtaget: offentlig upload i upload-links-public.ts efter token-validering).
 * Ingen ekstern afsendelse (SMS/mail/opkald) findes her. Kunde-/sagsforslag oprettes IKKE automatisk — createServiceCase
 * sender en bekræftelsesmail til kunden og kaldes derfor aldrig af receptionisten (et menneske bruger den normale formular).
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { permissionDeniedText } from '@/lib/auth/permission-text'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { isMissingTableError } from '@/lib/notes/customer-notes-availability'
import { clip, TEAMS, type Team } from '@/lib/reception/contract'
import { runReceptionTurn, type ReceptionTurn } from '@/lib/reception/engine'
import { enginePortsFor, executeApprovedActions, ingestCommunication, type ActionOutcome, type IngestError } from '@/lib/reception/henvendelser-core'
import { emailToInbound, isFormSubmit, portalToInbound, type EmailSourceRow, type PortalSourceRow } from '@/lib/reception/adapters'
import { receptionLlmEnabled, uploadLinksEnabled } from '@/lib/reception/flags'
import { OPEN_STATES as OPEN_STATE_LIST, type HenvendelseChannel, type HenvendelseView } from '@/lib/reception/henvendelser-views'

const OPEN_STATES = [...OPEN_STATE_LIST]

type R<T> = { success: true; data: T } | { success: false; error: string }

const UNAVAILABLE = 'Henvendelser er ikke slået til i dette miljø endnu (migration 00249 mangler). Intet er ændret.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dbErr = (e: { code?: string | null; message?: string | null } | null, fallback: string) => (isMissingTableError(e) ? UNAVAILABLE : fallback)

const INGEST_ERROR_TEXT: Record<IngestError, string> = {
  unavailable: UNAVAILABLE,
  permission_denied: 'Du må ikke oprette denne henvendelse (rettighed, eller kilden er skjult for dig). Intet er gemt.',
  source_mismatch: 'Kunde/sag passer ikke til kilden. Intet er gemt.',
  invalid_input: 'Ugyldige data. Intet er gemt.',
  not_supported: 'Denne kilde kan ikke indtages endnu. Intet er gemt.',
  insert_failed: 'Henvendelsen kunne ikke gemmes. Intet er gemt — prøv igen.',
}

/** Fase 3A: kontor-visninger (status/ejerskab) — kanal er et separat filter (lib/reception/henvendelser-views.ts) */
export type HenvendelseFilter = HenvendelseView
export type { HenvendelseChannel }

export interface HenvendelseRow {
  id: string; channel: string; status: string; title: string; aiSummary: string | null; intent: string | null; urgency: string
  lastAt: string; customer: { id: string; name: string } | null; customerState: string
  candidate: { id: string; name: string } | null; candidateHidden: boolean; candidateCount: number
  caseRef: { id: string; number: string | null } | null; caseState: string; caseCandidate: { id: string; number: string | null } | null
  assignedName: string | null; assignedTeam: string | null; nextAction: string | null; handoffReasons: string[]; matchVersion: number; intakeActor: string
  /** Antal beskeder i tråden (00250); null hvis ikke læsbart */
  itemCount: number | null; textPurged: boolean
}

const ROLE_TEAM: Record<string, Team> = { admin: 'kontor', serviceleder: 'service', salg: 'salg', bogholderi: 'bogholderi', montør: 'montor', montor: 'montor' }

export async function listHenvendelser(filter: HenvendelseFilter = 'new', channel: HenvendelseChannel | null = null): Promise<R<{ rows: HenvendelseRow[]; myTeam: Team | null; canManage: boolean }>> {
  const ctx = await getAuthenticatedClientWithRole().catch(() => null)
  if (!ctx) return { success: false, error: 'Ikke logget ind' }
  if (!ctx.hasPermission('conversations.view')) return { success: false, error: permissionDeniedText('conversations.view') }
  const myTeam = ROLE_TEAM[ctx.role] ?? null
  const cols = 'id, channel, status, title, ai_summary, intent, urgency, last_at, customer_id, customer_candidate_id, customer_match_state, candidate_count, service_case_id, case_candidate_id, case_match_state, assigned_profile_id, assigned_team, next_action, handoff_reasons, match_version, intake_actor'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const build = (sel: string): any => {
    let q = ctx.supabase.from('conversations').select(sel)
    if (filter === 'new') q = q.in('status', ['new', 'handoff'])
    if (filter === 'mine') q = q.eq('assigned_profile_id', ctx.userId).in('status', OPEN_STATES)
    if (filter === 'unassigned') q = q.is('assigned_profile_id', null).is('assigned_team', null).in('status', OPEN_STATES)
    if (filter === 'urgent') q = q.in('urgency', ['high', 'emergency']).in('status', OPEN_STATES)
    if (filter === 'awaiting_customer') q = q.eq('status', 'awaiting_customer')
    if (filter === 'awaiting_elta') q = q.eq('status', 'awaiting_elta')
    if (filter === 'handled') q = q.eq('status', 'handled')
    if (filter === 'handoff') q = q.eq('status', 'handoff')
    if (filter === 'team') q = myTeam ? q.eq('assigned_team', myTeam).in('status', OPEN_STATES) : q.eq('assigned_team', '__none__')
    if (channel) q = channel === 'web_chat' ? q.in('channel', ['web_chat', 'upload_link']) : q.eq('channel', channel)
    return q.order('last_at', { ascending: false }).limit(200)
  }
  // 00250: trådens længde + ryddet-markør; uden 00250 (fx prod før migration) bruges 00249-kolonnerne — aldrig en tom liste
  let res = await build(`${cols}, text_purged_at, conversation_items(count)`)
  const has250 = !res.error
  if (res.error) res = await build(cols)
  const { data, error } = res as { data: unknown[] | null; error: { code?: string | null; message?: string | null } | null }
  if (error) return { success: false, error: dbErr(error, 'Henvendelserne kunne ikke læses. Listen er ikke tom — prøv igen.') }
  const rows = (data ?? []) as Array<Record<string, unknown>>

  // Navne/numre læses med brugerens klient: en kandidat brugeren ikke må se vises som "skjult" — aldrig navngivet
  const custIds = [...new Set(rows.flatMap((r) => [r.customer_id, r.customer_candidate_id]).filter((x): x is string => typeof x === 'string'))]
  const caseIds = [...new Set(rows.flatMap((r) => [r.service_case_id, r.case_candidate_id]).filter((x): x is string => typeof x === 'string'))]
  const profIds = [...new Set(rows.map((r) => r.assigned_profile_id).filter((x): x is string => typeof x === 'string'))]
  const [cust, cases, profs] = await Promise.all([
    custIds.length ? ctx.supabase.from('customers').select('id, company_name').in('id', custIds) : Promise.resolve({ data: [], error: null }),
    caseIds.length ? ctx.supabase.from('service_cases').select('id, case_number').in('id', caseIds) : Promise.resolve({ data: [], error: null }),
    profIds.length ? ctx.supabase.from('profiles').select('id, full_name').in('id', profIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (cust.error || cases.error || profs.error) return { success: false, error: 'Kunder/sager til henvendelserne kunne ikke læses. Prøv igen.' }
  const cName = new Map(((cust.data ?? []) as Array<{ id: string; company_name: string | null }>).map((c) => [c.id, c.company_name ?? 'Kunde']))
  const cNum = new Map(((cases.data ?? []) as Array<{ id: string; case_number: string | null }>).map((c) => [c.id, c.case_number]))
  const pName = new Map(((profs.data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? 'Medarbejder']))
  const s = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    success: true,
    data: {
      myTeam, canManage: ctx.hasPermission('conversations.manage'),
      rows: rows.map((r): HenvendelseRow => {
        const cid = s(r.customer_id), cand = s(r.customer_candidate_id), kid = s(r.service_case_id), kcand = s(r.case_candidate_id)
        return {
          id: String(r.id), channel: String(r.channel), status: String(r.status), title: String(r.title), aiSummary: s(r.ai_summary), intent: s(r.intent),
          urgency: String(r.urgency), lastAt: String(r.last_at),
          customer: cid ? { id: cid, name: cName.get(cid) ?? 'Kunde' } : null, customerState: String(r.customer_match_state),
          candidate: cand && cName.has(cand) ? { id: cand, name: cName.get(cand)! } : null, candidateHidden: !!cand && !cName.has(cand),
          candidateCount: Number(r.candidate_count ?? 0),
          caseRef: kid ? { id: kid, number: cNum.get(kid) ?? null } : null, caseState: String(r.case_match_state),
          caseCandidate: kcand && cNum.has(kcand) ? { id: kcand, number: cNum.get(kcand) ?? null } : null,
          assignedName: s(r.assigned_profile_id) ? pName.get(String(r.assigned_profile_id)) ?? 'Medarbejder' : null,
          assignedTeam: s(r.assigned_team), nextAction: s(r.next_action),
          handoffReasons: Array.isArray(r.handoff_reasons) ? (r.handoff_reasons as string[]) : [], matchVersion: Number(r.match_version ?? 0),
          intakeActor: String(r.intake_actor ?? 'user'),
          itemCount: has250 && Array.isArray(r.conversation_items) ? Number((r.conversation_items as Array<{ count?: number }>)[0]?.count ?? 0) : null,
          textPurged: has250 && !!r.text_purged_at,
        }
      }),
    },
  }
}

export interface HenvendelseDetail {
  /** Én kronologisk tråd: beskeder (alle kanaler), med vedhæftnings-REFERENCER (navn/type, aldrig URL) */
  items: Array<{ id: string; channel: string; direction: string; occurredAt: string; title: string | null; preview: string | null; sender: string | null; transcript: string; sourceTable: string; attachments: Array<{ name: string; mime: string | null }>; fullText: string | null; purged: boolean; sourceMissing: boolean }>
  /** Historik (audit) — admin ser alt, andre deres egne handlinger (audit_logs-RLS) */
  history: Array<{ at: string; action: string; description: string; byUser: boolean }>
  status: { status: string; handledAt: string | null; textPurged: boolean }
  actions: Array<{ id: string; type: string; outcome: string; state: string; actor: string; reasons: string[]; createdAt: string }>
  uploadLinks: Array<{ id: string; expiresAt: string; filesUploaded: number; maxFiles: number; revoked: boolean }>
  openCases: Array<{ id: string; number: string | null; title: string }>
}

export async function getHenvendelseDetail(id: string): Promise<R<HenvendelseDetail>> {
  if (!UUID.test(id)) return { success: false, error: 'Ugyldig henvendelse' }
  const ctx = await getAuthenticatedClientWithRole().catch(() => null)
  if (!ctx) return { success: false, error: 'Ikke logget ind' }
  if (!ctx.hasPermission('conversations.view')) return { success: false, error: permissionDeniedText('conversations.view') }
  const conv = await ctx.supabase.from('conversations').select('id, customer_id, customer_candidate_id').eq('id', id).maybeSingle()
  if (conv.error) return { success: false, error: dbErr(conv.error, 'Henvendelsen kunne ikke læses.') }
  if (!conv.data) return { success: false, error: 'Henvendelsen findes ikke eller er skjult for dig.' }
  const custForCases = (conv.data as { customer_id: string | null; customer_candidate_id: string | null }).customer_id ?? (conv.data as { customer_candidate_id: string | null }).customer_candidate_id
  const itemCols = 'id, channel, direction, occurred_at, title, body_preview, sender_label, transcript_status, source_table, source_id, attachment_document_ids'
  const items250 = await ctx.supabase.from('conversation_items').select(`${itemCols}, attachment_refs, text_purged_at, source_missing_at`).eq('conversation_id', id).order('occurred_at')
  const itemsRes = items250.error ? await ctx.supabase.from('conversation_items').select(itemCols).eq('conversation_id', id).order('occurred_at') : items250
  const [items, actions, links, cases, conv2, hist] = await Promise.all([
    Promise.resolve(itemsRes),
    ctx.supabase.from('conversation_actions').select('id, action_type, policy_outcome, state, actor, reasons, created_at').eq('conversation_id', id).order('created_at'),
    ctx.supabase.from('upload_requests').select('id, expires_at, files_uploaded, max_files, revoked_at').eq('conversation_id', id).order('created_at'),
    custForCases ? ctx.supabase.from('service_cases').select('id, case_number, title').eq('customer_id', custForCases).eq('is_proposal', false).not('status', 'in', '(closed,converted)').limit(20) : Promise.resolve({ data: [], error: null }),
    ctx.supabase.from('conversations').select('status, handled_at').eq('id', id).maybeSingle(),
    // Historik er et supplement: læsefejl giver en tom historik med note, aldrig en fejl i tråden
    ctx.supabase.from('audit_logs').select('created_at, action, action_description, user_id').eq('entity_type', 'conversation').eq('entity_id', id).order('created_at').limit(100),
  ])
  if (items.error || actions.error || links.error || cases.error || conv2.error) return { success: false, error: 'Detaljerne kunne ikke læses helt. Prøv igen — intet vises som tomt.' }
  // Web-chat: fuld tekst fra den kanoniske kilde (RLS: kun beskeder i henvendelser brugeren selv kan se)
  const chatIds = ((items.data ?? []) as Array<Record<string, unknown>>).filter((i) => i.source_table === 'web_chat_messages' && typeof i.source_id === 'string').map((i) => String(i.source_id))
  const chat = chatIds.length ? await ctx.supabase.from('web_chat_messages').select('id, body').in('id', chatIds) : { data: [], error: null }
  const chatBody = new Map(((chat.data ?? []) as Array<{ id: string; body: string }>).map((m) => [m.id, m.body]))
  const st = (conv2.data ?? {}) as { status?: string; handled_at?: string | null }
  return {
    success: true,
    data: {
      items: ((items.data ?? []) as Array<Record<string, unknown>>).map((i) => ({
        id: String(i.id), channel: String(i.channel), direction: String(i.direction), occurredAt: String(i.occurred_at), title: (i.title as string) ?? null,
        preview: (i.body_preview as string) ?? null, sender: (i.sender_label as string) ?? null, transcript: String(i.transcript_status), sourceTable: String(i.source_table),
        attachments: [
          ...(Array.isArray(i.attachment_refs) ? (i.attachment_refs as Array<{ name?: string; mime?: string }>).map((a) => ({ name: String(a.name ?? 'vedhæftning'), mime: a.mime ? String(a.mime) : null })) : []),
          ...(Array.isArray(i.attachment_document_ids) ? (i.attachment_document_ids as unknown[]).map(() => ({ name: 'Uploadet fil', mime: null })) : []),
        ],
        fullText: i.source_table === 'web_chat_messages' && typeof i.source_id === 'string' ? chatBody.get(String(i.source_id)) ?? null : null,
        purged: !!i.text_purged_at, sourceMissing: !!i.source_missing_at,
      })),
      history: hist.error ? [] : ((hist.data ?? []) as Array<{ created_at: string; action: string; action_description: string | null; user_id: string | null }>).map((h) => ({ at: h.created_at, action: h.action, description: h.action_description ?? h.action, byUser: !!h.user_id })),
      status: { status: String(st.status ?? ''), handledAt: st.handled_at ?? null, textPurged: (items.data ?? []).some((i) => !!(i as Record<string, unknown>).text_purged_at) },
      actions: ((actions.data ?? []) as Array<Record<string, unknown>>).map((a) => ({ id: String(a.id), type: String(a.action_type), outcome: String(a.policy_outcome), state: String(a.state), actor: String(a.actor ?? 'ai_receptionist'), reasons: (a.reasons as string[]) ?? [], createdAt: String(a.created_at) })),
      uploadLinks: ((links.data ?? []) as Array<Record<string, unknown>>).map((l) => ({ id: String(l.id), expiresAt: String(l.expires_at), filesUploaded: Number(l.files_uploaded), maxFiles: Number(l.max_files), revoked: !!l.revoked_at })),
      openCases: ((cases.data ?? []) as Array<{ id: string; case_number: string | null; title: string | null }>).map((c) => ({ id: c.id, number: c.case_number, title: c.title ?? 'Sag' })),
    },
  }
}

async function requireManageCtx() {
  const ctx = await getAuthenticatedClientWithRole().catch(() => null)
  if (!ctx) return { error: 'Ikke logget ind' as const }
  if (!ctx.hasPermission('conversations.manage')) return { error: permissionDeniedText('conversations.manage') }
  return { ctx }
}

async function audit(userId: string, id: string, action: string, description: string, metadata: Record<string, unknown> = {}) {
  await insertAuditRow({ user_id: userId, entity_type: 'conversation', entity_id: id, action, action_description: description, metadata: { actor: 'user', ...metadata } })
}

/** Bekræft kunden (kandidaten eller en anden kunde brugeren selv har valgt). Versionslås mod samtidige ændringer. */
export async function confirmHenvendelseCustomer(id: string, customerId: string, matchVersion: number): Promise<R<{ matchVersion: number }>> {
  if (!UUID.test(id) || !UUID.test(customerId) || !Number.isInteger(matchVersion)) return { success: false, error: 'Ugyldige data' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  if (!ctx.hasPermission('customers.view')) return { success: false, error: permissionDeniedText('customers.view') }
  // Kunden skal være synlig for brugeren (RLS) — ellers kan den ikke vælges
  const c = await ctx.supabase.from('customers').select('id').eq('id', customerId).maybeSingle()
  if (c.error) return { success: false, error: 'Kunden kunne ikke læses. Intet er ændret.' }
  if (!c.data) return { success: false, error: 'Kunden findes ikke eller er skjult for dig. Intet er ændret.' }
  // Review-fund H3: et kundeskift lukker først åbne upload-links (de er bundet til den tidligere kunde). Fejler det,
  // ændres intet — ellers kunne en tidligere kundes filer ende på den nye kundes henvendelse.
  const cur = await ctx.supabase.from('conversations').select('customer_id').eq('id', id).maybeSingle()
  if (cur.error || !cur.data) return { success: false, error: dbErr(cur.error, 'Henvendelsen kunne ikke læses. Intet er ændret.') }
  const prev = (cur.data as { customer_id: string | null }).customer_id
  if (prev && prev !== customerId) {
    const rv = await ctx.supabase.from('upload_requests').update({ revoked_at: new Date().toISOString() }).eq('conversation_id', id).is('revoked_at', null)
    if (rv.error) return { success: false, error: 'Åbne upload-links kunne ikke lukkes. Kunden er ikke skiftet.' }
  }
  const u = await ctx.supabase.from('conversations').update({
    customer_id: customerId, customer_match_state: 'confirmed', customer_candidate_id: null, match_version: matchVersion + 1,
    // kundeskift nulstiller sagen (den tilhørte evt. en anden kunde)
    service_case_id: null, case_candidate_id: null, case_match_state: 'none', status: 'open',
  }).eq('id', id).eq('match_version', matchVersion).neq('status', 'handled').select('id')
  if (u.error) return { success: false, error: dbErr(u.error, 'Kunden kunne ikke bekræftes. Intet er ændret.') }
  if (!(u.data ?? []).length) return { success: false, error: 'Henvendelsen er ændret af en anden eller er afsluttet — genindlæs. Intet er ændret.' }
  await audit(ctx.userId, id, 'conversation_customer_confirmed', 'Kunde bekræftet på henvendelse', { customer_id: customerId })
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: { matchVersion: matchVersion + 1 } }
}

export async function rejectHenvendelseCustomer(id: string, matchVersion: number): Promise<R<{ matchVersion: number }>> {
  if (!UUID.test(id) || !Number.isInteger(matchVersion)) return { success: false, error: 'Ugyldige data' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  const u = await ctx.supabase.from('conversations').update({ customer_match_state: 'rejected', customer_candidate_id: null, match_version: matchVersion + 1 })
    .eq('id', id).eq('match_version', matchVersion).is('customer_id', null).select('id')
  if (u.error) return { success: false, error: dbErr(u.error, 'Kunne ikke afvise kandidaten. Intet er ændret.') }
  if (!(u.data ?? []).length) return { success: false, error: 'Henvendelsen er ændret af en anden — genindlæs. Intet er ændret.' }
  await audit(ctx.userId, id, 'conversation_customer_rejected', 'Kundekandidat afvist')
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: { matchVersion: matchVersion + 1 } }
}

/** Bekræft sagen — kræver bekræftet kunde; DB-værnet afviser en sag der ikke tilhører kunden */
export async function confirmHenvendelseCase(id: string, caseId: string, matchVersion: number): Promise<R<{ matchVersion: number }>> {
  if (!UUID.test(id) || !UUID.test(caseId) || !Number.isInteger(matchVersion)) return { success: false, error: 'Ugyldige data' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  const conv = await ctx.supabase.from('conversations').select('customer_id').eq('id', id).maybeSingle()
  if (conv.error || !conv.data) return { success: false, error: 'Henvendelsen kunne ikke læses. Intet er ændret.' }
  const customerId = (conv.data as { customer_id: string | null }).customer_id
  if (!customerId) return { success: false, error: 'Bekræft kunden først. Intet er ændret.' }
  const k = await ctx.supabase.from('service_cases').select('id').eq('id', caseId).eq('customer_id', customerId).maybeSingle()
  if (k.error) return { success: false, error: 'Sagen kunne ikke læses. Intet er ændret.' }
  if (!k.data) return { success: false, error: 'Sagen hører ikke til kunden eller er skjult for dig. Intet er ændret.' }
  const u = await ctx.supabase.from('conversations').update({ service_case_id: caseId, case_match_state: 'confirmed', case_candidate_id: null, match_version: matchVersion + 1 })
    .eq('id', id).eq('match_version', matchVersion).eq('customer_id', customerId).select('id')
  if (u.error) return { success: false, error: dbErr(u.error, 'Sagen kunne ikke bekræftes. Intet er ændret.') }
  if (!(u.data ?? []).length) return { success: false, error: 'Henvendelsen er ændret af en anden — genindlæs. Intet er ændret.' }
  await audit(ctx.userId, id, 'conversation_case_confirmed', 'Sag bekræftet på henvendelse', { service_case_id: caseId })
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: { matchVersion: matchVersion + 1 } }
}

export async function assignHenvendelse(id: string, assign: { profileId: string | null; team: string | null }): Promise<R<null>> {
  if (!UUID.test(id)) return { success: false, error: 'Ugyldig henvendelse' }
  if (assign.profileId !== null && !UUID.test(assign.profileId)) return { success: false, error: 'Ugyldig medarbejder' }
  if (assign.team !== null && !(TEAMS as readonly string[]).includes(assign.team)) return { success: false, error: 'Ugyldigt team' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  if (assign.profileId) {
    const p = await ctx.supabase.from('profiles').select('id, is_active').eq('id', assign.profileId).maybeSingle()
    if (p.error || !p.data || (p.data as { is_active?: boolean }).is_active === false) return { success: false, error: 'Medarbejderen findes ikke eller er deaktiveret. Intet er ændret.' }
  }
  const u = await ctx.supabase.from('conversations').update({ assigned_profile_id: assign.profileId, assigned_team: assign.team }).eq('id', id).select('id')
  if (u.error) return { success: false, error: dbErr(u.error, 'Kunne ikke tildele. Intet er ændret.') }
  if (!(u.data ?? []).length) return { success: false, error: 'Henvendelsen findes ikke eller er skjult for dig.' }
  await audit(ctx.userId, id, 'conversation_assigned', 'Henvendelse tildelt', { profile_id: assign.profileId, team: assign.team })
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: null }
}

export async function markHenvendelseHandled(id: string): Promise<R<null>> {
  if (!UUID.test(id)) return { success: false, error: 'Ugyldig henvendelse' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  const u = await ctx.supabase.from('conversations').update({ status: 'handled', handled_at: new Date().toISOString(), handled_by: ctx.userId, next_action: null })
    .eq('id', id).neq('status', 'handled').select('id')
  if (u.error) return { success: false, error: dbErr(u.error, 'Kunne ikke afslutte. Intet er ændret.') }
  if (!(u.data ?? []).length) return { success: false, error: 'Henvendelsen er allerede afsluttet eller skjult for dig.' }
  await audit(ctx.userId, id, 'conversation_handled', 'Henvendelse afsluttet')
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: null }
}

const STATUS_TEXT: Record<'open' | 'awaiting_customer' | 'awaiting_elta', string> = { open: 'genåbnet', awaiting_customer: 'venter på kunden', awaiting_elta: 'venter på ELTA' }

/** Fase 3A: venter på kunde / venter på ELTA / genåbn (også en afsluttet henvendelse). Intet sendes til kunden. */
export async function setHenvendelseStatus(id: string, status: 'open' | 'awaiting_customer' | 'awaiting_elta'): Promise<R<null>> {
  if (!UUID.test(id) || !(['open', 'awaiting_customer', 'awaiting_elta'] as string[]).includes(status)) return { success: false, error: 'Ugyldige data' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  const u = await ctx.supabase.from('conversations').update({ status, handled_at: null, handled_by: null }).eq('id', id).neq('status', status).select('id')
  if (u.error) return { success: false, error: dbErr(u.error, 'Status kunne ikke ændres. Intet er ændret.') }
  if (!(u.data ?? []).length) return { success: false, error: 'Henvendelsen har allerede den status eller er skjult for dig.' }
  await audit(ctx.userId, id, 'conversation_status_changed', `Henvendelse ${STATUS_TEXT[status]}`, { status })
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: null }
}

/** Fase 3A: tilbageringning via den EKSISTERENDE opgave-action (tilbageringnings-køen; kræver bekræftet kunde) */
export async function createCallbackFromHenvendelse(id: string): Promise<R<{ existing: boolean }>> {
  if (!UUID.test(id)) return { success: false, error: 'Ugyldig henvendelse' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  if (!ctx.hasPermission('tasks.create')) return { success: false, error: permissionDeniedText('tasks.create') }
  const conv = await ctx.supabase.from('conversations').select('customer_id, ai_summary, title').eq('id', id).maybeSingle()
  if (conv.error || !conv.data) return { success: false, error: 'Henvendelsen kunne ikke læses. Intet er oprettet.' }
  const c = conv.data as { customer_id: string | null; ai_summary: string | null; title: string }
  if (!c.customer_id) return { success: false, error: 'Bekræft kunden først. Intet er oprettet.' }
  const { createCustomerTask } = await import('@/lib/actions/customer-tasks')
  const r = await createCustomerTask({ customer_id: c.customer_id, title: 'Ring tilbage (Henvendelse)', description: clip(`${c.ai_summary ?? c.title}

Fra Henvendelse ${id}.`, 10_000), priority: 'normal', callbackQueue: true })
  if (!r.success) return { success: false, error: r.error ?? 'Tilbageringningen kunne ikke oprettes' }
  const rec = await ctx.supabase.from('conversation_actions').insert({ conversation_id: id, action_type: 'create_callback', policy_outcome: 'auto', state: 'executed', actor: 'user',
    payload: {}, reasons: [], idempotency_key: `user:create_callback:${Date.now()}`, executed_ref: r.existingCallback ? 'callback:existing' : 'callback:created', decided_by: ctx.userId, decided_at: new Date().toISOString(), created_by: ctx.userId })
  await audit(ctx.userId, id, 'conversation_callback_created', 'Tilbageringning oprettet fra henvendelse', { recorded: !rec.error, existing: !!r.existingCallback })
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: { existing: !!r.existingCallback } }
}

/**
 * Fase 3A: sagsforslag (service_cases.is_proposal = true) for den BEKRÆFTEDE kunde — med brugerens egen klient
 * (RLS: cases.create). Ingen mail til kunden (det er createServiceCase, som receptionisten aldrig kalder); forslaget
 * forfremmes/afvises i den eksisterende Forslag-indbakke og bekræftes derefter på henvendelsen.
 */
export async function createCaseProposalFromHenvendelse(id: string): Promise<R<{ caseId: string }>> {
  if (!UUID.test(id)) return { success: false, error: 'Ugyldig henvendelse' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  if (!ctx.hasPermission('cases.create')) return { success: false, error: permissionDeniedText('cases.create') }
  const conv = await ctx.supabase.from('conversations').select('customer_id, channel, title, ai_summary, urgency').eq('id', id).maybeSingle()
  if (conv.error || !conv.data) return { success: false, error: 'Henvendelsen kunne ikke læses. Intet er oprettet.' }
  const c = conv.data as { customer_id: string | null; channel: string; title: string; ai_summary: string | null; urgency: string }
  if (!c.customer_id) return { success: false, error: 'Bekræft kunden først. Intet er oprettet.' }
  const source = c.channel === 'email' ? 'email' : c.channel === 'phone' ? 'phone' : c.channel === 'portal' ? 'portal' : 'manual'
  const priority = c.urgency === 'emergency' ? 'urgent' : c.urgency === 'high' ? 'high' : c.urgency === 'low' ? 'low' : 'medium'
  const ins = await ctx.supabase.from('service_cases').insert({ customer_id: c.customer_id, title: clip(c.title, 200), description: clip(`${c.ai_summary ?? ''}

Forslag fra Henvendelse ${id}.`, 2000),
    status: 'new', priority, source, is_proposal: true, created_by: ctx.userId }).select('id').single()
  if (ins.error || !ins.data) return { success: false, error: 'Sagsforslaget kunne ikke oprettes (rettighed eller data). Intet er oprettet.' }
  const caseId = (ins.data as { id: string }).id
  const rec = await ctx.supabase.from('conversation_actions').insert({ conversation_id: id, action_type: 'create_case_proposal', policy_outcome: 'proposal', state: 'executed', actor: 'user',
    payload: {}, reasons: [], idempotency_key: `user:create_case_proposal:${Date.now()}`, executed_ref: `case_proposal:${caseId}`, decided_by: ctx.userId, decided_at: new Date().toISOString(), created_by: ctx.userId })
  await audit(ctx.userId, id, 'conversation_case_proposal_created', 'Sagsforslag oprettet fra henvendelse', { service_case_id: caseId, recorded: !rec.error })
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: { caseId } }
}

/** Opret opgave fra henvendelsen via den EKSISTERENDE opgave-action (kræver bekræftet kunde) */
export async function createTaskFromHenvendelse(id: string, title: string): Promise<R<null>> {
  if (!UUID.test(id)) return { success: false, error: 'Ugyldig henvendelse' }
  const t = String(title ?? '').trim()
  if (!t || t.length > 300) return { success: false, error: 'Titel mangler eller er for lang (max 300 tegn)' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  if (!ctx.hasPermission('tasks.create')) return { success: false, error: permissionDeniedText('tasks.create') }
  const conv = await ctx.supabase.from('conversations').select('customer_id, service_case_id, ai_summary, title').eq('id', id).maybeSingle()
  if (conv.error || !conv.data) return { success: false, error: 'Henvendelsen kunne ikke læses. Intet er oprettet.' }
  const c = conv.data as { customer_id: string | null; service_case_id: string | null; ai_summary: string | null; title: string }
  if (!c.customer_id) return { success: false, error: 'Bekræft kunden først. Intet er oprettet.' }
  const { createCustomerTask } = await import('@/lib/actions/customer-tasks')
  const r = await createCustomerTask({ customer_id: c.customer_id, ...(c.service_case_id ? { service_case_id: c.service_case_id } : {}), title: t,
    description: clip(`${c.ai_summary ?? c.title}\n\nFra Henvendelse ${id}.`, 10_000), priority: 'normal' })
  if (!r.success) return { success: false, error: r.error ?? 'Opgaven kunne ikke oprettes' }
  const rec = await ctx.supabase.from('conversation_actions').insert({ conversation_id: id, action_type: 'create_task', policy_outcome: 'auto', state: 'executed', actor: 'user',
    payload: { title: t }, reasons: [], idempotency_key: `user:create_task:${Date.now()}`, executed_ref: 'task:created', decided_by: ctx.userId, decided_at: new Date().toISOString(), created_by: ctx.userId })
  await audit(ctx.userId, id, 'conversation_task_created', 'Opgave oprettet fra henvendelse', { recorded: !rec.error })
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: null }
}

/** Godkend/afvis et forslag. Opgave-lignende forslag udføres via createCustomerTask; kunde-/sagsforslag udføres i de normale formularer. */
export async function decideHenvendelseAction(actionId: string, decision: 'approve' | 'reject'): Promise<R<{ state: string; hint: string | null }>> {
  if (!UUID.test(actionId) || (decision !== 'approve' && decision !== 'reject')) return { success: false, error: 'Ugyldige data' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  const a = await ctx.supabase.from('conversation_actions').select('id, conversation_id, action_type, policy_outcome, state, payload').eq('id', actionId).maybeSingle()
  if (a.error || !a.data) return { success: false, error: 'Forslaget kunne ikke læses. Intet er ændret.' }
  const act = a.data as { id: string; conversation_id: string; action_type: string; policy_outcome: string; state: string; payload: Record<string, unknown> }
  if (act.state !== 'proposed') return { success: false, error: 'Forslaget er allerede afgjort.' }
  const now = new Date().toISOString()
  if (decision === 'reject') {
    const u = await ctx.supabase.from('conversation_actions').update({ state: 'rejected', decided_by: ctx.userId, decided_at: now }).eq('id', actionId).eq('state', 'proposed').select('id')
    if (u.error || !(u.data ?? []).length) return { success: false, error: 'Kunne ikke afvise. Intet er ændret.' }
    await audit(ctx.userId, act.conversation_id, 'conversation_action_rejected', `Forslag afvist: ${act.action_type}`)
    revalidatePath('/dashboard/henvendelser')
    return { success: true, data: { state: 'rejected', hint: null } }
  }
  if (act.policy_outcome === 'forbidden') return { success: false, error: 'Forbudte handlinger kan ikke godkendes.' }
  if (['create_task', 'create_callback', 'create_planning_request'].includes(act.action_type)) {
    if (!ctx.hasPermission('tasks.create')) return { success: false, error: permissionDeniedText('tasks.create') }
    const conv = await ctx.supabase.from('conversations').select('customer_id, service_case_id, ai_summary').eq('id', act.conversation_id).maybeSingle()
    const c = conv.data as { customer_id: string | null; service_case_id: string | null; ai_summary: string | null } | null
    if (conv.error || !c) return { success: false, error: 'Henvendelsen kunne ikke læses. Intet er oprettet.' }
    if (!c.customer_id) return { success: false, error: 'Bekræft kunden først. Intet er oprettet.' }
    const { createCustomerTask } = await import('@/lib/actions/customer-tasks')
    const title = act.action_type === 'create_callback' ? 'Ring tilbage (Henvendelse)' : act.action_type === 'create_planning_request' ? `Planlægning: ${String(act.payload.title ?? 'ønsker besøg/tid')}` : String(act.payload.title ?? 'Opgave fra Henvendelse')
    const r = await createCustomerTask({ customer_id: c.customer_id, title: clip(title, 300), description: clip(`${c.ai_summary ?? ''}\n\nGodkendt forslag fra Henvendelse ${act.conversation_id}.`, 10_000), priority: 'normal',
      ...(act.action_type === 'create_callback' ? { callbackQueue: true } : c.service_case_id ? { service_case_id: c.service_case_id } : {}) })
    const u = await ctx.supabase.from('conversation_actions').update(r.success ? { state: 'executed', executed_ref: r.existingCallback ? 'callback:existing' : 'task:created', decided_by: ctx.userId, decided_at: now } : { state: 'failed', error_code: 'task_failed', decided_by: ctx.userId, decided_at: now }).eq('id', actionId).eq('state', 'proposed')
    await audit(ctx.userId, act.conversation_id, 'conversation_action_approved', `Forslag godkendt: ${act.action_type}`, { executed: r.success, state_recorded: !u.error })
    revalidatePath('/dashboard/henvendelser')
    if (!r.success) return { success: false, error: r.error ?? 'Opgaven kunne ikke oprettes' }
    return { success: true, data: { state: 'executed', hint: null } }
  }
  if (act.action_type === 'mark_handled') {
    const h = await markHenvendelseHandled(act.conversation_id)
    if (!h.success) return h
    await ctx.supabase.from('conversation_actions').update({ state: 'executed', executed_ref: 'handled', decided_by: ctx.userId, decided_at: now }).eq('id', actionId)
    return { success: true, data: { state: 'executed', hint: null } }
  }
  // Kunde-/sagsforslag og upload-link: godkendelsen registreres; selve oprettelsen sker i den normale formular / via "Opret upload-link"
  const u = await ctx.supabase.from('conversation_actions').update({ state: 'approved', decided_by: ctx.userId, decided_at: now }).eq('id', actionId).eq('state', 'proposed').select('id')
  if (u.error || !(u.data ?? []).length) return { success: false, error: 'Kunne ikke godkende. Intet er ændret.' }
  await audit(ctx.userId, act.conversation_id, 'conversation_action_approved', `Forslag godkendt: ${act.action_type}`)
  revalidatePath('/dashboard/henvendelser')
  const hint = act.action_type === 'create_customer_proposal' ? 'Opret kunden i den normale kundeformular, og bekræft derefter kunden på henvendelsen.'
    : act.action_type === 'create_case_proposal' ? 'Opret sagen fra kundens side (den normale sagsformular), og bekræft den derefter på henvendelsen.'
      : act.action_type === 'request_documents' ? 'Opret et upload-link på henvendelsen og del det selv med kunden. Systemet sender intet.' : null
  return { success: true, data: { state: 'approved', hint } }
}

/** Indtag nye mails og portalbeskeder (seneste 14 dage, højst 50 af hver) som henvendelser. Kun FORSLAG — ingen auto-udførelse. */
export async function syncHenvendelserFromSources(): Promise<R<{ created: number; duplicates: number; failed: number; skipped: number }>> {
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  // Trin C er en EKSPLICIT, godkendt historisk indlæsning — teknisk spærret uden RECEPTION_BACKFILL_ENABLED (final review B1)
  const { backfillEnabled } = await import('@/lib/reception/flags')
  if (!backfillEnabled()) return { success: false, error: 'Historisk indlæsning er slået fra. Nye mails og portalbeskeder kommer automatisk, når kanalen er aktiveret.' }
  const { ctx } = m
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const actorCtx = { supabase: ctx.supabase, userId: ctx.userId, hasPermission: ctx.hasPermission }
  const counts = { created: 0, duplicates: 0, failed: 0, skipped: 0 }
  let unavailable = false
  const handle = async (comm: ReturnType<typeof emailToInbound>, text: string | null) => {
    if (!comm) { counts.skipped++; return }
    // Review-fund M4: uden conversations.view_unmatched kan kun BEKRÆFTEDE henvendelser oprettes (RLS) — spring resten over
    if (comm.customer.state !== 'confirmed' && !ctx.hasPermission('conversations.view_unmatched')) { counts.skipped++; return }
    const ports = enginePortsFor(ctx.supabase, { confirmedCustomerId: comm.customer.customerId, candidateCustomerId: comm.customer.candidateId })
    const turn = await runReceptionTurn({ channel: comm.channel, text, sender: { phone: comm.sender.phone, email: comm.sender.email, contactId: comm.sender.contactId }, conversationKey: comm.dedupeKey }, ports)
    // Ét atomisk DB-kald: henvendelse + item + forslag + audit (kun forslag — execute: false)
    const r = await ingestCommunication(actorCtx, comm, turn, { execute: false })
    if (r.outcome === 'created' || r.outcome === 'appended') counts.created++
    else if (r.outcome === 'duplicate') counts.duplicates++
    else if (r.error === 'unavailable') unavailable = true
    else counts.failed++
  }
  if (ctx.hasPermission('customers.emails.view') || ctx.hasPermission('inbox.view')) {
    const mails = await ctx.supabase.from('incoming_emails').select('id, subject, sender_email, sender_name, body_preview, body_text, body_html, received_at, customer_id, customer_contact_id, linked_by, link_status, has_attachments, is_archived')
      .gte('received_at', since).eq('is_archived', false).order('received_at', { ascending: false }).limit(50)
    if (mails.error) return { success: false, error: dbErr(mails.error, 'Mails kunne ikke læses. Intet er indtaget.') }
    const { extractFormSubmitFields } = await import('@/lib/utils/email-parser')
    for (const row of (mails.data ?? []) as Array<EmailSourceRow & { body_text: string | null; body_html: string | null }>) {
      const form = isFormSubmit(row) ? extractFormSubmitFields(row.body_text, row.body_html) : null
      const comm = emailToInbound({ ...row, form_fields: form })
      await handle(comm, comm ? `${comm.title}. ${comm.message}` : null)
    }
  }
  const portal = await ctx.supabase.from('portal_messages').select('id, customer_id, sender_type, sender_name, message, attachments, created_at')
    .gte('created_at', since).eq('sender_type', 'customer').order('created_at', { ascending: false }).limit(50)
  if (portal.error) return { success: false, error: dbErr(portal.error, 'Portalbeskeder kunne ikke læses. Mails er indtaget.') }
  for (const row of (portal.data ?? []) as PortalSourceRow[]) {
    const comm = portalToInbound(row)
    await handle(comm, comm?.message ?? null)
  }
  if (unavailable) return { success: false, error: UNAVAILABLE }
  await audit(ctx.userId, '00000000-0000-0000-0000-000000000000', 'conversations_synced', 'Henvendelser indtaget fra mail/portal', counts)
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: counts }
}

export interface SimulatorInput { text: string; phone?: string; email?: string; customerNumber?: string; postalCode?: string; streetName?: string; caseNumber?: string; persist?: boolean; transcriptUnavailable?: boolean }

/** Tekst-simulator (fase 2, før stemme): kører motoren mod CRM'et med brugerens klient. Gem = opret henvendelse + udfør auto-handlinger. */
export async function simulateReception(input: SimulatorInput): Promise<R<{ turn: ReceptionTurn; conversationId: string | null; actions: ActionOutcome[] }>> {
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  if (!ctx.hasPermission('conversations.view_unmatched')) return { success: false, error: permissionDeniedText('conversations.view_unmatched') }
  const text = String(input.text ?? '').slice(0, 2000)
  if (!input.transcriptUnavailable && !text.trim()) return { success: false, error: 'Skriv en besked' }
  const ports = enginePortsFor(ctx.supabase)
  if (receptionLlmEnabled()) {
    const { llmClassify } = await import('@/lib/reception/llm-classify')
    ports.classify = (t, kw) => llmClassify(t, kw)
  }
  const key = `sim:${crypto.randomUUID()}`
  const turn = await runReceptionTurn({
    channel: 'phone', text: input.transcriptUnavailable ? null : text, conversationKey: key,
    sender: { phone: input.phone || null, email: input.email || null, customerNumber: input.customerNumber || null },
    claimed: { postalCode: input.postalCode || null, streetName: input.streetName || null, caseNumber: input.caseNumber || null },
  }, ports)
  if (!input.persist) return { success: true, data: { turn, conversationId: null, actions: [] } }
  const actorCtx = { supabase: ctx.supabase, userId: ctx.userId, hasPermission: ctx.hasPermission }
  const r = await ingestCommunication(actorCtx, {
    provider: 'simulator', providerEventId: null, channel: 'phone', direction: 'inbound', occurredAt: new Date().toISOString(),
    sender: { label: 'Simulator', phone: input.phone || null, email: input.email || null, customerNumber: input.customerNumber || null, contactId: null },
    customer: { state: turn.identity.state, customerId: null, candidateId: turn.identity.state === 'unique_match' ? turn.identity.candidates[0].customerId : null, candidateCount: turn.identity.candidates.length },
    case: { state: turn.caseMatch.state, caseId: null, candidateId: turn.caseMatch.candidateId },
    title: turn.title, message: clip(text, 500), transcript: { state: input.transcriptUnavailable ? 'unavailable' : 'not_applicable', ref: null },
    attachments: [], urgency: turn.urgency, requestedActions: turn.actions.map((a) => a.type), assigned: { profileId: null, team: turn.handoff?.team ?? null },
    processingState: turn.handoff ? 'handoff' : 'new', dedupeKey: key, source: { table: 'simulator', id: null },
  }, turn, { execute: true })
  if (r.outcome !== 'created') return { success: false, error: r.outcome === 'error' ? INGEST_ERROR_TEXT[r.error] : 'Allerede gemt.' }
  const actions = await executeApprovedActions(actorCtx, r.conversationId, turn, r.actions)
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: { turn, conversationId: r.conversationId, actions } }
}

/** Opret engangs-upload-link (vises ÉN gang; systemet sender intet). Kræver bekræftet kunde. */
export async function createUploadLinkForHenvendelse(id: string): Promise<R<{ url: string; expiresAt: string }>> {
  if (!UUID.test(id)) return { success: false, error: 'Ugyldig henvendelse' }
  if (!uploadLinksEnabled()) return { success: false, error: 'Upload-links er ikke slået til (RECEPTION_UPLOAD_LINKS_ENABLED).' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  const conv = await ctx.supabase.from('conversations').select('customer_id, service_case_id').eq('id', id).maybeSingle()
  if (conv.error || !conv.data) return { success: false, error: dbErr(conv.error, 'Henvendelsen kunne ikke læses. Intet link er oprettet.') }
  const c = conv.data as { customer_id: string | null; service_case_id: string | null }
  if (!c.customer_id) return { success: false, error: 'Bekræft kunden først. Intet link er oprettet.' }
  const { newUploadToken, UPLOAD_LINK_DAYS } = await import('@/lib/reception/upload-links')
  const { token, hash } = newUploadToken()
  const expiresAt = new Date(Date.now() + UPLOAD_LINK_DAYS * 86_400_000).toISOString()
  const ins = await ctx.supabase.from('upload_requests').insert({ conversation_id: id, customer_id: c.customer_id, service_case_id: c.service_case_id, token_hash: hash, purpose: 'photos', expires_at: expiresAt, max_files: 10 }).select('id').single()
  if (ins.error) return { success: false, error: dbErr(ins.error, 'Upload-linket kunne ikke oprettes.') }
  await audit(ctx.userId, id, 'upload_link_created', 'Upload-link oprettet (ikke sendt)', { upload_request_id: (ins.data as { id: string }).id })
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: { url: `${base}/upload/${token}`, expiresAt } }
}

export async function revokeUploadLink(requestId: string): Promise<R<null>> {
  if (!UUID.test(requestId)) return { success: false, error: 'Ugyldigt link' }
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  const u = await ctx.supabase.from('upload_requests').update({ revoked_at: new Date().toISOString() }).eq('id', requestId).is('revoked_at', null).select('id')
  if (u.error) return { success: false, error: dbErr(u.error, 'Linket kunne ikke lukkes.') }
  if (!(u.data ?? []).length) return { success: false, error: 'Linket er allerede lukket eller skjult for dig.' }
  await insertAuditRow({ user_id: ctx.userId, entity_type: 'upload_request', entity_id: requestId, action: 'upload_link_revoked', action_description: 'Upload-link lukket', metadata: { actor: 'user' } })
  revalidatePath('/dashboard/henvendelser')
  return { success: true, data: null }
}

export async function listAssignableProfiles(): Promise<R<Array<{ id: string; name: string }>>> {
  const m = await requireManageCtx(); if ('error' in m) return { success: false, error: m.error! }
  const { ctx } = m
  const { data, error } = await ctx.supabase.from('profiles').select('id, full_name, is_active').eq('is_active', true).order('full_name').limit(200)
  if (error) return { success: false, error: 'Medarbejdere kunne ikke læses' }
  return { success: true, data: ((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => ({ id: p.id, name: p.full_name ?? 'Medarbejder' })) }
}
