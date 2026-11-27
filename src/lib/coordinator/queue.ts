/**
 * C7 — samlet arbejdskø. Server-modul (IKKE 'use server').
 *
 * Én række pr. henvendelse: åbne indgående mails (ikke arkiveret, ikke ignoreret, ikke ELTA's egne/sendte) — med deres
 * Stage A-henvendelse når den findes — plus åbne henvendelser fra andre kanaler (web-chat, telefon). Alt læses med
 * brugerens egen klient (RLS/scope); kun identitets-/forslagsberegningen bruger service-role (D5).
 * Status (D2): færdig = mailen arkiveret/ignoreret ELLER henvendelsen behandlet — samme felter som mail-siden og
 * Henvendelser bruger, så en henvendelse aldrig skal afsluttes to steder.
 */
import { loadRegistry } from './load-identity'
import { coordinatorQueueDays } from './feature-flag'
import { buildCoordinatorViews, type CoordinatorView } from './view'
import { QUEUE_CATEGORIES, type QueueCategory, type QueuePriority, type SuggestionKind } from './suggestions'
import type { IdentityLevel, SenderKind } from './identity'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const QUEUE_LIMIT = 80

export interface QueueItem {
  key: string
  emailId: string | null
  conversationId: string | null
  channel: string
  subject: string
  senderLabel: string
  receivedAt: string
  category: QueueCategory
  priority: QueuePriority
  suggestion: { kind: SuggestionKind; level: IdentityLevel; reason: string } | null
  identity: { kind: SenderKind; level: IdentityLevel; label: string | null } | null
  customerName: string | null
  assignedProfileId: string | null
  /** Pålideligt signal for at der er svaret (svar fra ELTA i samme tråd, også fra Outlook) */
  answeredAt: string | null
  needsApproval: boolean
  read: boolean
  /** Lavrisiko: må afsluttes i en batch (automatisk/intern mail uden handling) */
  batchSafe: boolean
}

export interface QueueResult {
  items: QueueItem[]
  counts: { total: number; byCategory: Record<QueueCategory, number>; mine: number; unassigned: number; needsApproval: number; answered: number }
  truncated: boolean
  errors: number
  /** Åbne mails ældre end køens tidsvindue (efterslæb — behandles i mail-modulet eller med søgning) */
  backlog: number
  windowDays: number
}

const PRIO_RANK: Record<QueuePriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

export function itemFromView(v: CoordinatorView, read: boolean): QueueItem {
  const s = v.suggestions
  const cust = v.linked.customerId ? v.customers[v.linked.customerId]?.name ?? null : null
  const batchSafe = s.primary.kind === 'no_action' && (v.identity.kind === 'automated' || v.identity.kind === 'employee')
  return {
    key: `mail:${v.emailId}`, emailId: v.emailId, conversationId: v.conversation?.id ?? null, channel: 'email',
    subject: v.subject ?? '(intet emne)', senderLabel: v.sender.name || v.sender.email || 'Ukendt afsender', receivedAt: v.receivedAt,
    category: s.category, priority: s.priority,
    suggestion: s.alreadyDone ? null : { kind: s.primary.kind, level: s.primary.level, reason: s.primary.reasons[0] ?? '' },
    identity: { kind: v.identity.kind, level: v.identity.level, label: v.identity.primaryLabel },
    customerName: cust, assignedProfileId: v.conversation?.assignedProfileId ?? null, answeredAt: v.status.answeredAt,
    needsApproval: !s.alreadyDone && s.primary.kind !== 'no_action', read, batchSafe,
  }
}

export async function buildQueue(userDb: Db, adminDb: Db, userId: string, opts: { search?: string | null } = {}): Promise<QueueResult> {
  // Sendte mails (afsender = ELTA) hører ikke til køen — men videresendte kundemails fra en medarbejder gør
  const windowDays = coordinatorQueueDays()
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const mails = await userDb.from('incoming_emails').select('id, subject, sender_email, sender_name, received_at, is_read')
    .eq('is_archived', false).neq('link_status', 'ignored').or('is_forwarded.eq.true,sender_email.not.ilike.*@eltasolar.dk')
    .gte('received_at', opts.search ? '1970-01-01T00:00:00Z' : since)
    .order('received_at', { ascending: false }).limit(300)
  const older = await userDb.from('incoming_emails').select('id', { count: 'exact', head: true })
    .eq('is_archived', false).neq('link_status', 'ignored').or('is_forwarded.eq.true,sender_email.not.ilike.*@eltasolar.dk').lt('received_at', since)
  const term = (opts.search ?? '').trim().toLowerCase().slice(0, 80)
  const all = ((mails.data ?? []) as Array<{ id: string; is_read: boolean | null; subject: string | null; sender_email: string | null; sender_name: string | null }>)
  const rows = term ? all.filter((r) => [r.subject, r.sender_email, r.sender_name].some((x) => (x ?? '').toLowerCase().includes(term))) : all
  const truncated = rows.length > QUEUE_LIMIT
  const list = rows.slice(0, QUEUE_LIMIT)
  const registry = list.length ? await loadRegistry(adminDb) : undefined
  let errors = 0
  const views = list.length ? await buildCoordinatorViews(userDb, adminDb, list.map((r) => r.id), { technical: false, registry, skipAccessCheck: true }) : new Map()
  const items: QueueItem[] = []
  for (const r of list) {
    const v = views.get(r.id)
    if (!v) { errors++; continue }
    // Behandlet via henvendelsen (men mailen ikke arkiveret) → også færdig her (D2)
    if (v.status.handled) continue
    items.push(itemFromView(v, !!r.is_read))
  }

  // Henvendelser fra andre kanaler (web-chat, telefon, portal) uden mail
  if (!term) {
    const c = await userDb.from('conversations').select('id, channel, title, intent, urgency, status, first_at, last_at, assigned_profile_id, customer_id')
      .neq('channel', 'email').not('status', 'in', '(handled,spam)').order('last_at', { ascending: false }).limit(40)
    for (const x of (c.data ?? []) as Array<Record<string, unknown>>) {
      const urgency = String(x.urgency ?? 'normal')
      const intent = String(x.intent ?? '')
      const category: QueueCategory = /callback|ring/.test(intent) ? 'callback' : /service|fejl|repair/.test(intent) ? 'service' : /sales|tilbud|quote/.test(intent) ? 'sales' : 'other'
      items.push({ key: `conv:${x.id}`, emailId: null, conversationId: String(x.id), channel: String(x.channel), subject: String(x.title ?? 'Henvendelse'),
        senderLabel: String(x.channel), receivedAt: String(x.last_at ?? x.first_at), category,
        priority: urgency === 'emergency' ? 'urgent' : urgency === 'high' ? 'high' : category === 'service' || category === 'callback' ? 'high' : 'normal',
        suggestion: null, identity: null, customerName: null, assignedProfileId: (x.assigned_profile_id as string | null) ?? null, answeredAt: null,
        needsApproval: false, read: true, batchSafe: false })
    }
  }

  items.sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
  const byCategory = Object.fromEntries(QUEUE_CATEGORIES.map((k) => [k, 0])) as Record<QueueCategory, number>
  for (const it of items) byCategory[it.category]++
  return {
    items, truncated, errors, backlog: older.count ?? 0, windowDays,
    counts: { total: items.length, byCategory, mine: items.filter((i) => i.assignedProfileId === userId).length,
      unassigned: items.filter((i) => !i.assignedProfileId).length, needsApproval: items.filter((i) => i.needsApproval).length,
      answered: items.filter((i) => !!i.answeredAt).length },
  }
}

/** Tæller til sidebaren: kun billige HEAD-tællinger (ingen identitetsberegning) */
export async function countOpenQueue(userDb: Db): Promise<number> {
  const since = new Date(Date.now() - coordinatorQueueDays() * 86_400_000).toISOString()
  const m = await userDb.from('incoming_emails').select('id', { count: 'exact', head: true })
    .eq('is_archived', false).neq('link_status', 'ignored').or('is_forwarded.eq.true,sender_email.not.ilike.*@eltasolar.dk').gte('received_at', since)
  const c = await userDb.from('conversations').select('id', { count: 'exact', head: true }).neq('channel', 'email').not('status', 'in', '(handled,spam)')
  return (m.count ?? 0) + (c.count ?? 0)
}
