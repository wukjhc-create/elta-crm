/**
 * Phase C5 — udvidelser til kommunikationsoverblikket (kun med COORDINATOR_ENABLED). Server-modul (IKKE 'use server').
 * Alle læsninger sker med den klient kalderen giver (brugerens egen → RLS/scope).
 */
import type { TimelineEventInput } from './compose'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type Row = Record<string, unknown>

/** ELTA-afsender (ikke videresendt) = udgående mail */
export function isOutgoingEmail(senderEmail: string | null | undefined, isForwarded: boolean | null | undefined): boolean {
  return !isForwarded && /@(?:[a-z0-9-]+\.)*eltasolar\.dk$/i.test(String(senderEmail ?? '').trim())
}

/** Markér mails sendt fra ELTA som udgående */
export async function markOutgoingEmails(db: Db, inputs: TimelineEventInput[]): Promise<void> {
  const ids = inputs.filter((i) => i.sourceTable === 'incoming_emails').map((i) => i.sourceId).slice(0, 200)
  if (!ids.length) return
  const r = await db.from('incoming_emails').select('id, sender_email, is_forwarded').in('id', ids)
  const out = new Set(((r.data ?? []) as Array<{ id: string; sender_email: string | null; is_forwarded: boolean | null }>)
    .filter((e) => isOutgoingEmail(e.sender_email, e.is_forwarded)).map((e) => e.id))
  for (const i of inputs) if (i.sourceTable === 'incoming_emails' && out.has(i.sourceId)) i.kind = 'email_out'
}

/**
 * En henvendelse hvis indhold KUN er mails, der allerede står i tidslinjen, er samme hændelse — den skjules, og mailen
 * markeres "Behandlet som henvendelse". Henvendelser med andre kanaler (telefon, chat) bevares. Ren funktion over items.
 */
export function dedupeInquiryInputs(inputs: TimelineEventInput[], items: Array<{ conversation_id: string; source_table: string; source_id: string }>): TimelineEventInput[] {
  const emailIds = new Set(inputs.filter((i) => i.sourceTable === 'incoming_emails').map((i) => i.sourceId))
  const drop = new Set<string>(), tagged = new Set<string>()
  for (const c of inputs.filter((i) => i.sourceTable === 'conversations')) {
    const mine = items.filter((x) => x.conversation_id === c.sourceId)
    if (mine.length && mine.every((x) => x.source_table === 'incoming_emails' && emailIds.has(x.source_id))) { drop.add(c.sourceId); for (const x of mine) tagged.add(x.source_id) }
  }
  return inputs.filter((i) => !(i.sourceTable === 'conversations' && drop.has(i.sourceId)))
    .map((i) => (i.sourceTable === 'incoming_emails' && tagged.has(i.sourceId) ? { ...i, summary: i.summary ?? 'Behandlet som henvendelse' } : i))
}

export async function dedupeInquiries(db: Db, inputs: TimelineEventInput[]): Promise<TimelineEventInput[]> {
  const inq = inputs.filter((i) => i.sourceTable === 'conversations').map((i) => i.sourceId).slice(0, 200)
  if (!inq.length) return inputs
  const r = await db.from('conversation_items').select('conversation_id, source_table, source_id').in('conversation_id', inq)
  if (r.error) return inputs
  return dedupeInquiryInputs(inputs, (r.data ?? []) as Array<{ conversation_id: string; source_table: string; source_id: string }>)
}

export function offerEvents(r: Row, customerId: string, caseId: string | null): TimelineEventInput[] {
  const nr = typeof r.offer_number === 'string' ? r.offer_number : 'Tilbud'
  const title = typeof r.title === 'string' && r.title.trim() ? `${nr} · ${r.title}` : nr
  const out: TimelineEventInput[] = [{ sourceTable: 'offers', sourceId: String(r.id), kind: 'offer', at: typeof r.created_at === 'string' ? r.created_at : null, title: `Tilbud oprettet: ${title}`, summary: typeof r.status === 'string' ? r.status : null, customerId, caseId }]
  if (typeof r.sent_at === 'string') out.push({ sourceTable: 'offers:sent', sourceId: String(r.id), kind: 'offer', at: r.sent_at, title: `Tilbud sendt: ${title}`, summary: null, customerId, caseId })
  return out
}

export function caseEvents(r: Row, customerId: string): TimelineEventInput[] {
  const nr = typeof r.case_number === 'string' ? r.case_number : 'Sag'
  const title = typeof r.title === 'string' && r.title.trim() ? `${nr} · ${r.title}` : nr
  const out: TimelineEventInput[] = [{ sourceTable: 'service_cases', sourceId: String(r.id), kind: 'case', at: typeof r.created_at === 'string' ? r.created_at : null, title: `Sag oprettet: ${title}`, summary: null, customerId, caseId: String(r.id) }]
  if (typeof r.closed_at === 'string') out.push({ sourceTable: 'service_cases:closed', sourceId: String(r.id), kind: 'status', at: r.closed_at, title: `Sag lukket: ${title}`, summary: null, customerId, caseId: String(r.id) })
  return out
}
