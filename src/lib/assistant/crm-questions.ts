/**
 * Fælles CRM-spørgsmål. Kanal-uafhængig og uden Telegram-logik.
 * Svarene bygges af data, kalderen har læst. Skrivende ønsker udføres ikke.
 */
import { isFuldmagtDocument } from '@/lib/documents/is-fuldmagt'
import { previewCommunication, type CommCandidate, type CommPreviewItem } from '@/lib/automation/comm-preview'
import type { TimelineEvent } from '@/lib/timeline/compose'

export type CrmQuestionKind = 'help' | 'unknown' | 'write' | 'callbacks' | 'missing_poa' | 'history' | 'followups'

export interface CrmQuestion {
  kind: CrmQuestionKind
  name: string | null
  todayOnly: boolean
  text: string
}

export interface CallbackRow {
  id: string
  title: string
  customerId: string
  customerName: string | null
  caseId: string | null
  dueAt: string | null
  createdAt: string
  autoRule: string | null
}

export interface PoaCaseRow {
  id: string
  caseNumber: string | null
  title: string
  customerId: string | null
  status: string
}

export interface PoaDocRow {
  customerId: string | null
  serviceCaseId: string | null
  documentType: string | null
  description: string | null
}

const WRITE = /\b(opret|lav en|slet|flyt|knyt|send |godkend|bogf[øo]r|fakturer|betal)\b/i

export function interpretCrmQuestion(input: string): CrmQuestion {
  const text = input.replace(/\s+/g, ' ').trim()
  if (!text) return { kind: 'unknown', name: null, todayOnly: false, text }
  if (WRITE.test(text)) return { kind: 'write', name: null, todayOnly: false, text }
  if (/hj[æa]lp|hvad kan du/i.test(text)) return { kind: 'help', name: null, todayOnly: false, text }
  if (/ringe tilbage|ikke ringet|ubesvaret|hvem ringede/i.test(text)) return { kind: 'callbacks', name: null, todayOnly: /\bi dag\b/i.test(text), text }
  if (/fuldmagt/i.test(text)) return { kind: 'missing_poa', name: null, todayOnly: false, text }
  if (/f[øo]lg op|p[åa]mindelse/i.test(text)) return { kind: 'followups', name: null, todayOnly: false, text }
  // "med kunde Jensen" skal bruge kundenavnet, ikke ordet "kunde".
  const named = text.match(/\bkunde\s+(.+)$/i) ?? text.match(/\bmed\s+(.+)$/i)
  if (/hvad skete|hvad er der sket|historik/i.test(text) && named?.[1]) {
    return { kind: 'history', name: named[1].replace(/[?.!]+$/, '').trim(), todayOnly: false, text }
  }
  return { kind: 'unknown', name: null, todayOnly: false, text }
}

export function explainCrmQuestion(q: CrmQuestion): string {
  if (q.kind === 'help') {
    return [
      'Jeg kan svare ud fra CRM, uden at sende eller ændre noget:',
      '• Hvem har vi ikke ringet tilbage til?',
      '• Hvem ringede i dag, som vi ikke har ringet tilbage til?',
      '• Hvilke sager mangler en fuldmagt?',
      '• Hvad skete der med kunde Jensen?',
      '• Hvad skal vi følge op på?',
      'Skrivende ønsker (opret, flyt, send, godkend) skal bekræftes i den relevante skærm. Jeg udfører dem ikke her.',
    ].join('\n')
  }
  if (q.kind === 'write') return 'Det kræver en bekræftet handling i CRM. Jeg opretter, flytter, sender eller godkender ikke herfra.'
  return 'Jeg forstod ikke spørgsmålet. Skriv “hjælp” for eksempler.'
}

export function copenhagenDate(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))
}

export function selectOutstandingCallbacks(rows: CallbackRow[], today: string, todayOnly: boolean): CallbackRow[] {
  return rows
    .filter((r) => r.autoRule === 'assistant_missed_call' || r.autoRule === 'assistant_callback')
    .filter((r) => !todayOnly || copenhagenDate(r.createdAt) === today || copenhagenDate(r.dueAt) === today)
    .sort((a, b) => (a.dueAt ?? a.createdAt).localeCompare(b.dueAt ?? b.createdAt))
}

export function casesMissingPowerOfAttorney(cases: PoaCaseRow[], documents: PoaDocRow[]): PoaCaseRow[] {
  const coveredCustomers = new Set(documents.filter((d) => !d.serviceCaseId && isFuldmagtDocument({ document_type: d.documentType, description: d.description })).map((d) => d.customerId).filter(Boolean) as string[])
  const coveredCases = new Set(documents.filter((d) => d.serviceCaseId && isFuldmagtDocument({ document_type: d.documentType, description: d.description })).map((d) => d.serviceCaseId) as string[])
  return cases.filter((c) => !['closed', 'converted', 'cancelled'].includes(c.status) && !coveredCases.has(c.id) && !(c.customerId && coveredCustomers.has(c.customerId)))
}

export function historyLines(events: TimelineEvent[]): string[] {
  return events.slice(0, 12).map((e) => `${e.at.slice(0, 16).replace('T', ' ')} · ${e.title}`)
}

export function followUpPreview(candidates: CommCandidate[]): CommPreviewItem[] {
  return previewCommunication(candidates)
}
