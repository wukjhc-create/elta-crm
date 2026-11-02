'use server'

/**
 * Kundens kommunikationstidslinje. Læser eksisterende tabeller med brugerens klient (RLS + scope).
 * En kilde der fejler, markeres — den tælles ikke som "ingen hændelser".
 * Dokumentbeskrivelser medtages ikke (fuldmagter kan indeholde CPR).
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { userCanViewCustomer } from '@/lib/auth/customer-scope'
import { permissionDeniedText } from '@/lib/auth/permission-text'
import { composeTimeline, kindForNote, kindForTask, timelineSourceFailureState, type TimelineEvent, type TimelineEventInput } from '@/lib/timeline/compose'

export interface TimelineSourceState {
  source: 'notes' | 'tasks' | 'documents' | 'emails' | 'planning'
  /** unavailable = valgfri kilde findes ikke her (fx customer_notes før migrationen) — ingen advarsel, ikke en fejl */
  state: 'ok' | 'hidden' | 'error' | 'unavailable'
}

export interface CustomerTimelineResult {
  ok: boolean
  error?: string
  events: TimelineEvent[]
  sources: TimelineSourceState[]
}

type Row = Record<string, unknown>

function clip(value: unknown, max = 240): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export async function getCustomerCommunicationTimeline(customerId: string): Promise<CustomerTimelineResult> {
  const empty = (error: string): CustomerTimelineResult => ({ ok: false, error, events: [], sources: [] })
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return empty('Ugyldig kunde')
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('customers.view')) return empty(permissionDeniedText('customers.view'))
  if (!(await userCanViewCustomer(customerId, ctx))) return empty('Du har ikke adgang til kunden.')

  const sources: TimelineSourceState[] = []
  const inputs: TimelineEventInput[] = []

  const read = async (source: TimelineSourceState['source'], hidden: boolean, query: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>) => {
    if (hidden) {
      sources.push({ source, state: 'hidden' })
      return
    }
    try {
      const { data, error } = await query
      if (error) {
        sources.push({ source, state: timelineSourceFailureState(source, error) })
        return
      }
      sources.push({ source, state: 'ok' })
      for (const row of (data ?? []) as Row[]) inputs.push(...mapRow(source, row, customerId))
    } catch {
      sources.push({ source, state: 'error' })
    }
  }

  // Som getCustomerDocuments: mail-vedhæftninger arkiveret på kunden (fx leverandørers ordrebekræftelser) kun for roller
  // der må se kundemails (G9/D28)
  let documents = ctx.supabase.from('customer_documents').select('id, title, document_type, created_at, service_case_id').eq('customer_id', customerId)
  if (!ctx.hasPermission('customers.emails.view')) documents = documents.is('source_email_id', null)

  await Promise.all([
    read('notes', false, ctx.supabase.from('customer_notes').select('id, content, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(40)),
    read('tasks', false, ctx.supabase.from('customer_tasks').select('id, title, description, created_at, service_case_id, auto_rule').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(40)),
    read('documents', false, documents.order('created_at', { ascending: false }).limit(40)),
    read('emails', !ctx.hasPermission('customers.emails.view'), ctx.supabase.from('incoming_emails').select('id, subject, received_at, service_case_id').eq('customer_id', customerId).order('received_at', { ascending: false }).limit(40)),
    read('planning', false, ctx.supabase.from('work_orders').select('id, title, status, scheduled_date, case_id, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(40)),
  ])

  return { ok: true, events: composeTimeline(inputs), sources }
}

function mapRow(source: TimelineSourceState['source'], row: Row, customerId: string): TimelineEventInput[] {
  const id = typeof row.id === 'string' ? row.id : ''
  if (!id) return []
  if (source === 'notes') {
    const content = typeof row.content === 'string' ? row.content : ''
    return [{ sourceTable: 'customer_notes', sourceId: id, kind: kindForNote(content), at: typeof row.created_at === 'string' ? row.created_at : null, title: kindForNote(content) === 'phone_note' ? 'Opkaldsnote' : 'Note', summary: clip(content), customerId, caseId: null }]
  }
  if (source === 'tasks') {
    const title = typeof row.title === 'string' ? row.title : 'Opgave'
    const description = typeof row.description === 'string' ? row.description : null
    const autoRule = typeof row.auto_rule === 'string' ? row.auto_rule : null
    return [{ sourceTable: 'customer_tasks', sourceId: id, kind: kindForTask(autoRule, title, description), at: typeof row.created_at === 'string' ? row.created_at : null, title, summary: clip(description), customerId, caseId: typeof row.service_case_id === 'string' ? row.service_case_id : null }]
  }
  if (source === 'documents') {
    const title = typeof row.title === 'string' && row.title.trim() ? row.title : (typeof row.document_type === 'string' ? row.document_type : 'Dokument')
    return [{ sourceTable: 'customer_documents', sourceId: id, kind: 'document', at: typeof row.created_at === 'string' ? row.created_at : null, title, summary: null, customerId, caseId: typeof row.service_case_id === 'string' ? row.service_case_id : null }]
  }
  if (source === 'emails') {
    return [{ sourceTable: 'incoming_emails', sourceId: id, kind: 'email', at: typeof row.received_at === 'string' ? row.received_at : null, title: typeof row.subject === 'string' && row.subject.trim() ? row.subject : 'Mail uden emne', summary: null, customerId, caseId: typeof row.service_case_id === 'string' ? row.service_case_id : null }]
  }
  const at = typeof row.scheduled_date === 'string' ? row.scheduled_date : typeof row.created_at === 'string' ? row.created_at : null
  return [{ sourceTable: 'work_orders', sourceId: id, kind: 'planning', at, title: typeof row.title === 'string' && row.title.trim() ? row.title : 'Planlagt arbejde', summary: typeof row.status === 'string' ? row.status : null, customerId, caseId: typeof row.case_id === 'string' ? row.case_id : null }]
}
