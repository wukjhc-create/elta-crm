'use server'

/**
 * Phase C5 — sagens samlede interne kommunikationsoverblik (kun med COORDINATOR_ENABLED).
 * Samme adgang som sagens øvrige faner: cases.view.all, eller cases.view.assigned + sagen i brugerens scope.
 * Hver kilde læses med brugerens EGEN klient (RLS/scope) — en mail eller et dokument bliver aldrig synligt blot fordi en
 * part deltager i sagen. Intet ændres; intet vises eksternt (ingen portaludvidelse — F-1).
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { userCanViewCase } from '@/lib/auth/case-scope'
import { permissionDeniedText } from '@/lib/auth/permission-text'
import { coordinatorEnabled } from '@/lib/coordinator/feature-flag'
import { partiesUiEnabled } from '@/lib/parties/feature-flag'
import { composeTimeline, kindForNote, kindForTask, timelineSourceFailureState, type TimelineEventInput } from '@/lib/timeline/compose'
import { caseEvents, dedupeInquiries, isOutgoingEmail, offerEvents } from '@/lib/timeline/enhanced'
import type { CustomerTimelineResult, TimelineSourceState } from '@/lib/actions/communication-timeline'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const clip = (v: unknown, max = 240) => { const t = typeof v === 'string' ? v.trim() : ''; return t ? (t.length > max ? `${t.slice(0, max)}…` : t) : null }

export async function getCaseCommunicationTimeline(caseId: string): Promise<CustomerTimelineResult> {
  const empty = (error: string): CustomerTimelineResult => ({ ok: false, error, events: [], sources: [] })
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return empty('Ugyldig sag')
  if (!coordinatorEnabled()) return empty('Kommunikationsoverblikket er ikke slået til i dette miljø')
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('cases.view.all') && !ctx.hasPermission('cases.view.assigned')) return empty(permissionDeniedText('cases.view.all'))
  if (!ctx.hasPermission('cases.view.all') && !(await userCanViewCase(caseId, { role: ctx.role, userId: ctx.userId, supabase: ctx.supabase }))) return empty('Sagen er ikke tildelt dig')
  const c = await ctx.supabase.from('service_cases').select('id, case_number, title, status, created_at, closed_at, customer_id, source_offer_id').eq('id', caseId).maybeSingle()
  if (c.error || !c.data) return empty('Sagen findes ikke eller du har ikke adgang')
  const sag = c.data as Row & { customer_id: string | null; source_offer_id: string | null }
  const owner = sag.customer_id ?? caseId
  const sources: TimelineSourceState[] = []
  const inputs: TimelineEventInput[] = []
  const read = async (source: TimelineSourceState['source'], hidden: boolean, query: () => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>, map: (row: Row) => TimelineEventInput[]) => {
    if (hidden) { sources.push({ source, state: 'hidden' }); return }
    try {
      const { data, error } = await query()
      if (error) { sources.push({ source, state: timelineSourceFailureState(source, error) }); return }
      sources.push({ source, state: 'ok' })
      for (const row of (data ?? []) as Row[]) inputs.push(...map(row))
    } catch { sources.push({ source, state: 'error' }) }
  }
  const db = ctx.supabase
  await Promise.all([
    read('notes', false, () => db.from('case_notes').select('id, content, created_at').eq('case_id', caseId).order('created_at', { ascending: false }).limit(60),
      (r) => [{ sourceTable: 'case_notes', sourceId: String(r.id), kind: kindForNote(String(r.content ?? '')), at: str(r.created_at), title: 'Note', summary: clip(r.content), customerId: owner, caseId }]),
    read('emails', false, () => db.from('incoming_emails').select('id, subject, received_at, sender_email, is_forwarded').eq('service_case_id', caseId).order('received_at', { ascending: false }).limit(60),
      (r) => [{ sourceTable: 'incoming_emails', sourceId: String(r.id), kind: isOutgoingEmail(str(r.sender_email), !!r.is_forwarded) ? 'email_out' : 'email', at: str(r.received_at), title: str(r.subject)?.trim() || 'Mail uden emne', summary: null, customerId: owner, caseId }]),
    read('tasks', false, () => db.from('customer_tasks').select('id, title, description, created_at, auto_rule').eq('service_case_id', caseId).order('created_at', { ascending: false }).limit(60),
      (r) => [{ sourceTable: 'customer_tasks', sourceId: String(r.id), kind: kindForTask(str(r.auto_rule), String(r.title ?? 'Opgave'), str(r.description)), at: str(r.created_at), title: String(r.title ?? 'Opgave'), summary: clip(r.description), customerId: owner, caseId }]),
    read('documents', false, () => {
      let q = db.from('customer_documents').select('id, title, document_type, created_at').eq('service_case_id', caseId)
      if (!ctx.hasPermission('customers.emails.view')) q = q.is('source_email_id', null)
      return q.order('created_at', { ascending: false }).limit(60)
    }, (r) => [{ sourceTable: 'customer_documents', sourceId: String(r.id), kind: 'document', at: str(r.created_at), title: str(r.title)?.trim() || str(r.document_type) || 'Dokument', summary: null, customerId: owner, caseId }]),
    read('planning', false, () => db.from('work_orders').select('id, title, status, scheduled_date, created_at').eq('case_id', caseId).order('created_at', { ascending: false }).limit(60),
      (r) => [{ sourceTable: 'work_orders', sourceId: String(r.id), kind: 'planning', at: str(r.scheduled_date) ?? str(r.created_at), title: str(r.title)?.trim() || 'Planlagt arbejde', summary: str(r.status), customerId: owner, caseId }]),
    read('inquiries', !ctx.hasPermission('conversations.view'), () => db.from('conversations').select('id, title, ai_summary, last_at').eq('service_case_id', caseId).neq('status', 'spam').order('last_at', { ascending: false }).limit(40),
      (r) => [{ sourceTable: 'conversations', sourceId: String(r.id), kind: 'inquiry', at: str(r.last_at), title: str(r.title)?.trim() || 'Henvendelse', summary: clip(r.ai_summary), customerId: owner, caseId }]),
    read('offers', !ctx.hasPermission('offers.view') || !sag.source_offer_id, () => db.from('offers').select('id, offer_number, title, status, created_at, sent_at').eq('id', sag.source_offer_id as string).limit(1),
      (r) => offerEvents(r, owner, caseId)),
    read('participants', !partiesUiEnabled(), () => db.from('case_participants').select('id, role, created_at, ended_at, parties(display_name)').eq('case_id', caseId).order('created_at', { ascending: false }).limit(40),
      (r) => { const p = r.parties as { display_name?: string } | null; return [{ sourceTable: 'case_participants', sourceId: String(r.id), kind: 'participant', at: str(r.created_at), title: `Sagsdeltager: ${p?.display_name ?? 'part'}`, summary: str(r.ended_at) ? 'Afsluttet' : null, customerId: owner, caseId }] }),
  ])
  inputs.push(...caseEvents(sag, owner))
  return { ok: true, events: composeTimeline(await dedupeInquiries(db, inputs)), sources, enhanced: true }
}
