/**
 * Én tidslinje over kommunikation og aktivitet. Kilderne ejes af deres egne tabeller.
 * Funktionen kopierer ikke indholdet — den sorterer de rækker, kalderen allerede har læst.
 * En række uden tidspunkt eller kunde udelades. Den bliver ikke til "nu".
 */
import { isMissingTableError } from '@/lib/notes/customer-notes-availability'

export type TimelineKind =
  | 'email'
  | 'call'
  | 'missed_call'
  | 'voicemail'
  | 'sms'
  | 'phone_note'
  | 'note'
  | 'document'
  | 'task'
  | 'status'
  | 'assistant'
  | 'planning'

export interface TimelineEventInput {
  sourceTable: string
  sourceId: string
  kind: TimelineKind
  at: string | null
  title: string
  summary: string | null
  customerId: string | null
  caseId: string | null
}

export interface TimelineEvent {
  key: string
  sourceTable: string
  sourceId: string
  kind: TimelineKind
  at: string
  title: string
  summary: string | null
  customerId: string
  caseId: string | null
}

export function kindForTask(autoRule: string | null | undefined, title: string, description?: string | null): TimelineKind {
  if (autoRule === 'assistant_missed_call' && /Telefonsvarer:/.test(description ?? '')) return 'voicemail'
  if (autoRule === 'assistant_missed_call') return 'missed_call'
  if (autoRule === 'assistant_callback') return 'call'
  if (autoRule?.startsWith('assistant_')) return 'assistant'
  if (/besigtigelse/i.test(title)) return 'planning'
  return 'task'
}

export function kindForNote(content: string): TimelineKind {
  return content.trimStart().startsWith('Opkaldsnote:') ? 'phone_note' : 'note'
}

export function composeTimeline(events: TimelineEventInput[]): TimelineEvent[] {
  const out: TimelineEvent[] = []
  const seen = new Set<string>()
  for (const event of events) {
    if (!event.customerId || !event.at || !event.sourceId || !event.sourceTable) continue
    const time = Date.parse(event.at)
    if (Number.isNaN(time)) continue
    const key = `${event.sourceTable}:${event.sourceId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      key,
      sourceTable: event.sourceTable,
      sourceId: event.sourceId,
      kind: event.kind,
      at: new Date(time).toISOString(),
      title: event.title.trim() || 'Uden titel',
      summary: event.summary?.trim() ? event.summary.trim() : null,
      customerId: event.customerId,
      caseId: event.caseId,
    })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key))
}

/**
 * En kilde der ikke kunne læses: noter er valgfrie (customer_notes findes kun hvor migrationen er anvendt) — mangler
 * tabellen, er kilden 'unavailable' og vises ikke som fejl. Alle andre fejl (også andre fejl på noter) er 'error'.
 */
export function timelineSourceFailureState(source: string, error: { code?: string | null; message?: string | null }): 'error' | 'unavailable' {
  return source === 'notes' && isMissingTableError(error) ? 'unavailable' : 'error'
}
