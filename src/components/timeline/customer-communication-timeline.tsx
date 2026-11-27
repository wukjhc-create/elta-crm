'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getCustomerCommunicationTimeline, type CustomerTimelineResult } from '@/lib/actions/communication-timeline'
import { getCaseCommunicationTimeline } from '@/lib/actions/case-communication-timeline'
import { TIMELINE_FILTERS, type TimelineFilter, type TimelineKind } from '@/lib/timeline/compose'

const LABEL: Record<TimelineKind, string> = {
  email: 'Mail',
  email_out: 'Udgående mail',
  call: 'Opkald',
  missed_call: 'Ubesvaret',
  voicemail: 'Telefonsvarer',
  sms: 'SMS',
  phone_note: 'Opkaldsnote',
  note: 'Note',
  document: 'Dokument',
  task: 'Opgave',
  status: 'Status',
  assistant: 'Assistent',
  planning: 'Planlægning',
  inquiry: 'Henvendelse',
  offer: 'Tilbud',
  case: 'Sag',
  participant: 'Sagsdeltager',
}

const SOURCE_LABEL: Record<string, string> = { notes: 'noter', tasks: 'opgaver', documents: 'dokumenter', emails: 'mails', planning: 'planlægning', calls: 'opkald', inquiries: 'henvendelser', offers: 'tilbud', cases: 'sager', participants: 'sagsdeltagere' }
const FILTER_LABEL: Record<TimelineFilter, string> = { mail: 'Mails', calls: 'Opkald', notes: 'Noter', tasks: 'Opgaver', documents: 'Dokumenter', offers: 'Tilbud', cases: 'Sager', inquiries: 'Henvendelser' }

function TimelineView({ res, failed, title, intro }: { res: CustomerTimelineResult | null; failed: boolean; title: string; intro: string }) {
  const [filter, setFilter] = useState<TimelineFilter | null>(null)
  const events = useMemo(() => (res?.events ?? []).filter((e) => !filter || (TIMELINE_FILTERS[filter] as readonly string[]).includes(e.kind)), [res, filter])
  const counts = useMemo(() => {
    const m: Partial<Record<TimelineFilter, number>> = {}
    for (const e of res?.events ?? []) for (const [f, kinds] of Object.entries(TIMELINE_FILTERS)) if ((kinds as readonly string[]).includes(e.kind)) m[f as TimelineFilter] = (m[f as TimelineFilter] ?? 0) + 1
    return m
  }, [res])
  return (
    <section className="bg-white rounded-lg border p-6" data-testid="customer-communication-timeline">
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-sm text-gray-500 mb-4">{intro}</p>
      {failed && <p className="text-sm text-red-700">Tidslinjen kunne ikke hentes. Det betyder ikke, at der ingen aktivitet er.</p>}
      {!res && !failed && <p className="text-sm text-gray-400">Henter…</p>}
      {res && !res.ok && <p className="text-sm text-red-700">{res.error ?? 'Tidslinjen kunne ikke hentes.'}</p>}
      {res?.ok && res.enhanced && (res.events.length > 0) && (
        <nav className="mb-3 flex flex-wrap gap-1.5" aria-label="Filtrér kommunikation" data-testid="timeline-filters">
          <button onClick={() => setFilter(null)} className={`rounded-full border px-2.5 py-0.5 text-xs ${!filter ? 'border-blue-600 bg-blue-600 text-white' : 'hover:bg-gray-50'}`} data-testid="timeline-filter-all">Alle ({res.events.length})</button>
          {(Object.keys(TIMELINE_FILTERS) as TimelineFilter[]).filter((f) => counts[f]).map((f) => (
            <button key={f} onClick={() => setFilter(filter === f ? null : f)} data-testid={`timeline-filter-${f}`}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === f ? 'border-blue-600 bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>{FILTER_LABEL[f]} ({counts[f]})</button>
          ))}
        </nav>
      )}
      {res?.ok && res.sources.some((s) => s.state === 'error' || s.state === 'hidden') && (
        <ul className="mb-3 text-xs text-amber-800">
          {res.sources.filter((s) => s.state === 'error').map((s) => (
            <li key={s.source}>{SOURCE_LABEL[s.source] ?? s.source} kunne ikke læses og tælles ikke som tomme.</li>
          ))}
          {res.sources.filter((s) => s.state === 'hidden').map((s) => (
            <li key={s.source}>{SOURCE_LABEL[s.source] ?? s.source} vises ikke med din adgang.</li>
          ))}
        </ul>
      )}
      {res?.ok && res.events.length === 0 && res.sources.every((s) => s.state !== 'error') && (
        <p className="text-sm text-gray-500">Ingen kommunikation i de kilder, der kunne læses.</p>
      )}
      {res?.ok && events.length > 0 && (
        <ol className="space-y-3" data-testid="timeline-events">
          {events.map((event) => (
            <li key={event.key} className="border-l-2 border-gray-200 pl-3" data-testid="timeline-event" data-kind={event.kind}>
              <p className="text-xs text-gray-500">
                {LABEL[event.kind]} · {new Date(event.at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}
                {event.caseId && event.kind !== 'case' && <> · <Link href={`/dashboard/orders/${event.caseId}`} className="text-blue-700 hover:underline">Sag</Link></>}
              </p>
              <p className="text-sm font-medium text-gray-900">{event.title}</p>
              {event.summary && <p className="text-sm text-gray-600 whitespace-pre-wrap">{event.summary}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function CustomerCommunicationTimeline({ customerId }: { customerId: string }) {
  const [res, setRes] = useState<CustomerTimelineResult | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getCustomerCommunicationTimeline(customerId).then((r) => { if (alive) setRes(r) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [customerId])

  return <TimelineView res={res} failed={failed} title="Kommunikation"
    intro={res?.enhanced ? 'Al intern kommunikation og aktivitet på kunden i én tidslinje — filtrér efter type.' : 'Mail, opkald, noter, dokumenter, opgaver og planlægning på kunden. Kilderne ligger stadig hver for sig.'} />
}

/** C5: sagens kommunikationsoverblik (kun når COORDINATOR_ENABLED — ellers returnerer handlingen en fejltekst) */
export function CaseCommunicationTimeline({ caseId }: { caseId: string }) {
  const [res, setRes] = useState<CustomerTimelineResult | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    getCaseCommunicationTimeline(caseId).then((r) => { if (alive) setRes(r) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [caseId])
  return <TimelineView res={res} failed={failed} title="Kommunikation på sagen" intro="Mails, noter, opgaver, dokumenter, planlægning, henvendelser, tilbud og sagsdeltagere — kun det du har adgang til." />
}
