/**
 * Fælles CRM-spørgsmål. Kanal-uafhængig og uden Telegram-logik.
 * Svarene bygges af data, kalderen har læst. Skrivende ønsker udføres ikke.
 */
import { isFuldmagtDocument } from '@/lib/documents/is-fuldmagt'
import { previewCommunication, type CommCandidate, type CommPreviewItem } from '@/lib/automation/comm-preview'
import type { TimelineEvent } from '@/lib/timeline/compose'

export type CrmQuestionKind = 'help' | 'unknown' | 'write' | 'propose_task' | 'callbacks' | 'missing_poa' | 'history' | 'followups'

export interface CrmQuestion {
  kind: CrmQuestionKind
  name: string | null
  todayOnly: boolean
  text: string
  /** Kun sat for et opgaveforslag. */
  caseNumber: string | null
  assigneeName: string | null
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

function blank(kind: CrmQuestionKind, text: string, extra?: Partial<CrmQuestion>): CrmQuestion {
  return { kind, name: null, todayOnly: false, text, caseNumber: null, assigneeName: null, ...extra }
}

/** "Opret opgave for Lars på sag 2309". Andre opret-sætninger er ikke et opgaveforslag. */
export function parseTaskProposal(text: string): { assigneeName: string | null; caseNumber: string | null } | null {
  const match = text.match(/^(?:opret(?: en)? opgave)(?:\s+(?:for|til)\s+(.+?))?(?:\s+p[åa]\s+sag\s+([A-Za-z0-9-]+))?[.!?]*$/i)
  if (!match) return null
  return { assigneeName: match[1]?.trim() || null, caseNumber: match[2]?.trim() || null }
}

export function interpretCrmQuestion(input: string): CrmQuestion {
  const text = input.replace(/\s+/g, ' ').trim()
  if (!text) return blank('unknown', text)
  const task = parseTaskProposal(text)
  if (task) return blank('propose_task', text, { caseNumber: task.caseNumber, assigneeName: task.assigneeName })
  if (WRITE.test(text)) return blank('write', text)
  if (/hj[æa]lp|hvad kan du/i.test(text)) return blank('help', text)
  if (/ringe tilbage|ikke ringet|ubesvaret|hvem ringede/i.test(text)) return blank('callbacks', text, { todayOnly: /\bi dag\b/i.test(text) })
  if (/fuldmagt/i.test(text)) return blank('missing_poa', text)
  if (/f[øo]lg op|p[åa]mindelse/i.test(text)) return blank('followups', text)
  // "med kunde Jensen" skal bruge kundenavnet, ikke ordet "kunde".
  const named = text.match(/\bkunde\s+(.+)$/i) ?? text.match(/\bmed\s+(.+)$/i)
  if (/hvad skete|hvad er der sket|historik/i.test(text) && named?.[1]) {
    return blank('history', text, { name: named[1].replace(/[?.!]+$/, '').trim() })
  }
  return blank('unknown', text)
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
      '• Opret opgave for Lars på sag 2309 — det vises som forslag og oprettes først efter en ekstra bekræftelse.',
      'Andre skrivninger (flyt, send, godkend, ny sag) udføres ikke her.',
    ].join('\n')
  }
  if (q.kind === 'write') return 'Det kræver en bekræftet handling i den relevante CRM-skærm. Jeg flytter, sender, godkender eller opretter ikke andet end en opgave, som du bekræfter.'
  if (q.kind === 'propose_task' && !q.caseNumber) return 'Skriv hvilken sag, fx “opret opgave på sag 2309”. Intet er oprettet.'
  if (q.kind === 'propose_task') return 'Forslaget oprettes først, når du bekræfter det.'
  return 'Jeg forstod ikke spørgsmålet. Skriv “hjælp” for eksempler.'
}

export function planAssistantTask(input: {
  confirmed: boolean
  caseNumber: string | null
  caseMatches: number
  assigneeName: string | null
  assigneeMatches: number
}): { execute: boolean; reason: string } {
  if (!input.caseNumber) return { execute: false, reason: 'Skriv hvilken sag, fx “opret opgave på sag 2309”. Intet er oprettet.' }
  if (input.caseMatches === 0) return { execute: false, reason: 'Ingen sag med det nummer, som du kan se. Intet er oprettet.' }
  if (input.caseMatches !== 1) return { execute: false, reason: 'Flere sager har nummeret. Der er ikke valgt en, og intet er oprettet.' }
  if (input.assigneeName && input.assigneeMatches === 0) return { execute: false, reason: 'Ingen aktiv medarbejder matcher navnet. Intet er oprettet.' }
  if (input.assigneeName && input.assigneeMatches !== 1) return { execute: false, reason: 'Flere medarbejdere matcher navnet. Der er ikke valgt en, og intet er oprettet.' }
  if (!input.confirmed) return { execute: false, reason: 'Bekræft opgaven, før den oprettes.' }
  return { execute: true, reason: 'Opretter opgaven på sagen.' }
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
