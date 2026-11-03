/**
 * Fælles CRM-spørgsmål. Kanal-uafhængig og uden Telegram-logik.
 * Svarene bygges af data, kalderen har læst. Skrivende ønsker udføres ikke.
 */
import { isFuldmagtDocument } from '@/lib/documents/is-fuldmagt'
import { previewCommunication, type CommCandidate, type CommPreviewItem } from '@/lib/automation/comm-preview'
import type { TimelineEvent } from '@/lib/timeline/compose'
import { copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'

export type CrmQuestionKind =
  | 'help'
  | 'unknown'
  | 'write'
  | 'propose_task'
  | 'propose_move'
  | 'propose_assign'
  | 'propose_note'
  | 'propose_link'
  | 'callbacks'
  | 'missing_poa'
  | 'history'
  | 'followups'
  | 'jobs_tomorrow'
  | 'jobs_today'
  | 'overdue_tasks'
  | 'supplier_invoices'
  | 'cases_without_action'
  | 'unresolved'

export type CrmProposal =
  | { kind: 'create_task'; caseNumber: string; assigneeName: string | null }
  | { kind: 'move_inspection'; caseNumber: string; date: string; time: string }
  | { kind: 'assign_task'; caseNumber: string; assigneeName: string }
  | { kind: 'add_note'; scope: 'case'; caseNumber: string; text: string }
  | { kind: 'add_note'; scope: 'customer'; customerName: string; text: string }
  | { kind: 'link_mail'; subject: string; caseNumber: string }

export type CrmAction =
  | { type: 'move_inspection'; caseNumber: string; when: string; time: string | null }
  | { type: 'assign_task'; caseNumber: string; assigneeName: string }
  | { type: 'add_note'; scope: 'case'; caseNumber: string; text: string }
  | { type: 'add_note'; scope: 'customer'; customerName: string; text: string }
  | { type: 'link_mail'; subject: string; caseNumber: string }

export interface CrmQuestion {
  kind: CrmQuestionKind
  name: string | null
  todayOnly: boolean
  text: string
  /** Kun sat for et opgaveforslag. */
  caseNumber: string | null
  assigneeName: string | null
  action: CrmAction | null
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
  return { kind, name: null, todayOnly: false, text, caseNumber: null, assigneeName: null, action: null, ...extra }
}

const WEEKDAYS: Record<string, number> = {
  søndag: 0, mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lørdag: 6, lordag: 6,
}

/** Dansk dag ud fra i dag (Europe/Copenhagen-datoen YYYY-MM-DD). Ugyldige datoer er null. */
export function resolveDanishDay(phrase: string, today: string): string | null {
  const p = phrase.trim().toLocaleLowerCase('da').replace(/[.!?]+$/, '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) {
    const [y, m, d] = p.split('-').map(Number)
    const check = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
    return check === p ? p : null
  }
  const noon = new Date(`${today}T12:00:00Z`)
  if (p === 'i dag') return today
  if (p === 'i morgen') return copenhagenDatePlusDays(1, noon)
  if (p === 'i overmorgen') return copenhagenDatePlusDays(2, noon)
  const wd = WEEKDAYS[p]
  if (wd == null) return null
  const [y, m, d] = today.split('-').map(Number)
  const todayWd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  let delta = (wd - todayWd + 7) % 7
  if (delta === 0) delta = 7
  return copenhagenDatePlusDays(delta, noon)
}

export function parseInspectionMove(text: string): { caseNumber: string; when: string; time: string | null } | null {
  const match = text.match(/^flyt besigtigelse(?:n)?\s+p[åa]\s+sag\s+([A-Za-z0-9-]+)\s+til\s+(.+)$/i)
  if (!match) return null
  const rest = match[2].trim().replace(/[.!?]+$/, '')
  const timed = rest.match(/^(.*?)(?:\s+kl\.?\s*(\d{1,2})[:.](\d{2}))$/i)
  if (!timed) return { caseNumber: match[1], when: rest, time: null }
  const hour = timed[2].padStart(2, '0')
  const time = `${hour}:${timed[3]}`
  return { caseNumber: match[1], when: timed[1].trim(), time: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null }
}

function parseAssign(text: string): { caseNumber: string; assigneeName: string } | null {
  const match = text.match(/^tildel opgave(?:n)?\s+p[åa]\s+sag\s+([A-Za-z0-9-]+)\s+til\s+(.+)$/i)
  if (!match) return null
  const name = match[2].trim().replace(/[.!?]+$/, '')
  if (name.length < 2) return null
  return { caseNumber: match[1], assigneeName: name }
}

function parseNote(text: string): CrmAction | null {
  const onCase = text.match(/^note(?:r)?\s+p[åa]\s+sag\s+([A-Za-z0-9-]+)\s*:\s*(.+)$/i)
  if (onCase) {
    const body = onCase[2].trim()
    if (!body) return null
    return { type: 'add_note', scope: 'case', caseNumber: onCase[1], text: body }
  }
  const onCustomer = text.match(/^note(?:r)?\s+p[åa]\s+kunde\s+(.+?)\s*:\s*(.+)$/i)
  if (!onCustomer) return null
  const body = onCustomer[2].trim()
  const name = onCustomer[1].trim()
  if (name.length < 2 || !body) return null
  return { type: 'add_note', scope: 'customer', customerName: name, text: body }
}

function parseLink(text: string): { subject: string; caseNumber: string } | null {
  const match = text.match(/^knyt mail(?:en)?\s+(.+?)\s+til\s+sag\s+([A-Za-z0-9-]+)$/i)
  if (!match) return null
  const subject = match[1].trim().replace(/[.!?]+$/, '')
  if (!subject || /^(denne|denne mail|mailen)$/i.test(subject)) return null
  return { subject, caseNumber: match[2] }
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
  const move = parseInspectionMove(text)
  if (move) return blank('propose_move', text, { caseNumber: move.caseNumber, action: { type: 'move_inspection', ...move } })
  const note = parseNote(text)
  if (note?.type === 'add_note') return blank('propose_note', text, { caseNumber: note.scope === 'case' ? note.caseNumber : null, action: note })
  const assign = parseAssign(text)
  if (assign) return blank('propose_assign', text, { caseNumber: assign.caseNumber, assigneeName: assign.assigneeName, action: { type: 'assign_task', ...assign } })
  const link = parseLink(text)
  if (link) return blank('propose_link', text, { caseNumber: link.caseNumber, action: { type: 'link_mail', ...link } })
  if (WRITE.test(text)) return blank('write', text)
  if (/hj[æa]lp|hvad kan du/i.test(text)) return blank('help', text)
  if (/ubesvarede mails|mails uden sag|ubesvarede opkald/i.test(text)) return blank('unresolved', text)
  if (/forfaldne opgaver|overskredne opgaver/i.test(text)) return blank('overdue_tasks', text)
  if (/leverandørfaktura|fakturaer til gennemgang/i.test(text)) return blank('supplier_invoices', text)
  if (/sager uden (næste handling|opgave|naeste handling)/i.test(text)) return blank('cases_without_action', text)
  if (/jobs i dag|arbejdsordrer i dag|hvad skal vi i dag/i.test(text)) return blank('jobs_today', text)
  if (/ringe tilbage|ikke ringet|ubesvaret|hvem ringede/i.test(text)) return blank('callbacks', text, { todayOnly: /\bi dag\b/i.test(text) })
  if (/fuldmagt/i.test(text)) return blank('missing_poa', text)
  if (/f[øo]lg op|p[åa]mindelse/i.test(text)) return blank('followups', text)
  if (/arbejdsordrer i morgen|jobs i morgen|hvad skal vi i morgen/i.test(text)) return blank('jobs_tomorrow', text)
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
      '• Flyt besigtigelse på sag 2309 til fredag kl 10:00 — kun når der er præcis én booket besigtigelse. Kunden får ingen mail.',
      '• Tildel opgaven på sag 2309 til Lars — kun når sagen har præcis én åben opgave.',
      '• Note på sag 2309: teksten, eller note på kunde Jensen: teksten.',
      '• Knyt mail Faktura 123 til sag 2309 — kun når emnet matcher præcis én mail.',
      '• Jobs i dag. Jobs i morgen. Ubesvarede mails og opkald.',
      '• Forfaldne opgaver. Sager uden næste handling. Leverandørfakturaer til gennemgang.',
      'Andre skrivninger (send, godkend, ny sag) udføres ikke her.',
    ].join('\n')
  }
  if (q.kind === 'write') return 'Det kræver en bekræftet handling i den relevante CRM-skærm. Jeg sender, godkender eller opretter ikke andet end det, du bekræfter. En besigtigelse flyttes sådan: “flyt besigtigelse på sag 2309 til 2026-11-06 kl 10:00”.'
  if (q.kind === 'propose_move' && q.action?.type === 'move_inspection' && !q.action.time) return 'Skriv et klokkeslæt, fx kl 10:00. Intet er flyttet.'
  if (q.kind === 'propose_move') return 'Besigtigelsen flyttes først, når du bekræfter. Kunden får ingen ny mail.'
  if (q.kind === 'propose_assign') return 'Opgaven tildeles først, når du bekræfter.'
  if (q.kind === 'propose_note') return 'Noten gemmes først, når du bekræfter.'
  if (q.kind === 'propose_link') return 'Mailen knyttes først, når du bekræfter. Der sendes ikke noget.'
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

export function planInspectionMove(input: {
  confirmed: boolean
  caseMatches: number
  inspectionMatches: number
  date: string | null
  time: string | null
  today: string
}): { execute: boolean; reason: string } {
  if (input.caseMatches !== 1) {
    return { execute: false, reason: input.caseMatches === 0
      ? 'Ingen sag med det nummer, som du kan se. Intet er flyttet.'
      : 'Flere sager har nummeret. Der er ikke valgt en, og intet er flyttet.' }
  }
  if (!input.date || input.date < input.today) return { execute: false, reason: 'Datoen mangler eller er før i dag. Intet er flyttet.' }
  if (!input.time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return { execute: false, reason: 'Skriv et klokkeslæt, fx kl 10:00. Intet er flyttet.' }
  if (input.inspectionMatches === 0) return { execute: false, reason: 'Sagen har ingen booket besigtigelse. Intet er flyttet, og der er ikke sendt mail.' }
  if (input.inspectionMatches !== 1) return { execute: false, reason: 'Sagen har flere bookede besigtigelser. Intet er flyttet.' }
  if (!input.confirmed) return { execute: false, reason: 'Bekræft flytningen. Kunden får ingen mail herfra.' }
  return { execute: true, reason: 'Flytter besigtigelsens tid. Kunden får ingen ny mail.' }
}

export function planTaskAssign(input: {
  confirmed: boolean
  caseMatches: number
  openTaskMatches: number
  assigneeMatches: number
}): { execute: boolean; reason: string } {
  if (input.caseMatches !== 1) return { execute: false, reason: input.caseMatches === 0 ? 'Ingen sag med det nummer, som du kan se. Intet er tildelt.' : 'Flere sager har nummeret. Intet er tildelt.' }
  if (input.openTaskMatches === 0) return { execute: false, reason: 'Sagen har ingen åben opgave. Intet er tildelt.' }
  if (input.openTaskMatches !== 1) return { execute: false, reason: 'Sagen har flere åbne opgaver. Vælg opgaven på sagen. Intet er tildelt.' }
  if (input.assigneeMatches !== 1) return { execute: false, reason: input.assigneeMatches === 0 ? 'Ingen aktiv medarbejder matcher navnet. Intet er tildelt.' : 'Flere medarbejdere matcher navnet. Intet er tildelt.' }
  if (!input.confirmed) return { execute: false, reason: 'Bekræft tildelingen, før den gemmes.' }
  return { execute: true, reason: 'Tildeler den åbne opgave.' }
}

export function planAssistantNote(input: { confirmed: boolean; matches: number; text: string }): { execute: boolean; reason: string } {
  const text = input.text.trim()
  if (!text) return { execute: false, reason: 'Noten er tom. Intet er gemt.' }
  if (text.length > 5000) return { execute: false, reason: 'Noten er for lang. Intet er gemt.' }
  if (input.matches !== 1) return { execute: false, reason: input.matches === 0 ? 'Ingen entydig kunde eller sag. Intet er gemt.' : 'Flere matcher. Intet er gemt.' }
  if (!input.confirmed) return { execute: false, reason: 'Bekræft noten, før den gemmes.' }
  return { execute: true, reason: 'Gemmer noten.' }
}

export function planMailLink(input: {
  confirmed: boolean
  caseMatches: number
  mailMatches: number
  sameCustomer: boolean
}): { execute: boolean; reason: string } {
  if (input.caseMatches !== 1) return { execute: false, reason: input.caseMatches === 0 ? 'Ingen sag med det nummer, som du kan se. Intet er knyttet.' : 'Flere sager har nummeret. Intet er knyttet.' }
  if (input.mailMatches !== 1) return { execute: false, reason: input.mailMatches === 0 ? 'Ingen mail med det emne, som du kan se. Intet er knyttet.' : 'Flere mails har emnet. Intet er knyttet.' }
  if (!input.sameCustomer) return { execute: false, reason: 'Mailen og sagen er ikke på samme kunde. Intet er knyttet.' }
  if (!input.confirmed) return { execute: false, reason: 'Bekræft knytningen. Der sendes ikke noget.' }
  return { execute: true, reason: 'Knytter mailen til sagen.' }
}
