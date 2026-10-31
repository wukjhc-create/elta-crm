'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCustomerCommunicationTimeline, type CustomerTimelineResult } from '@/lib/actions/communication-timeline'
import type { TimelineKind } from '@/lib/timeline/compose'

const LABEL: Record<TimelineKind, string> = {
  email: 'Mail',
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
}

const SOURCE_LABEL = { notes: 'noter', tasks: 'opgaver', documents: 'dokumenter', emails: 'mails', planning: 'planlægning' } as const

export function CustomerCommunicationTimeline({ customerId }: { customerId: string }) {
  const [res, setRes] = useState<CustomerTimelineResult | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getCustomerCommunicationTimeline(customerId).then((r) => { if (alive) setRes(r) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [customerId])

  return (
    <section className="bg-white rounded-lg border p-6" data-testid="customer-communication-timeline">
      <h2 className="text-lg font-semibold mb-1">Kommunikation</h2>
      <p className="text-sm text-gray-500 mb-4">Mail, opkald, noter, dokumenter, opgaver og planlægning på kunden. Kilderne ligger stadig hver for sig.</p>
      {failed && <p className="text-sm text-red-700">Tidslinjen kunne ikke hentes. Det betyder ikke, at der ingen aktivitet er.</p>}
      {!res && !failed && <p className="text-sm text-gray-400">Henter…</p>}
      {res && !res.ok && <p className="text-sm text-red-700">{res.error ?? 'Tidslinjen kunne ikke hentes.'}</p>}
      {res?.ok && res.sources.some((s) => s.state !== 'ok') && (
        <ul className="mb-3 text-xs text-amber-800">
          {res.sources.filter((s) => s.state === 'error').map((s) => (
            <li key={s.source}>{SOURCE_LABEL[s.source]} kunne ikke læses og tælles ikke som tomme.</li>
          ))}
          {res.sources.filter((s) => s.state === 'hidden').map((s) => (
            <li key={s.source}>{SOURCE_LABEL[s.source]} vises ikke med din adgang.</li>
          ))}
        </ul>
      )}
      {res?.ok && res.events.length === 0 && res.sources.every((s) => s.state !== 'error') && (
        <p className="text-sm text-gray-500">Ingen kommunikation i de kilder, der kunne læses.</p>
      )}
      {res?.ok && res.events.length > 0 && (
        <ol className="space-y-3">
          {res.events.map((event) => (
            <li key={event.key} className="border-l-2 border-gray-200 pl-3">
              <p className="text-xs text-gray-500">
                {LABEL[event.kind]} · {new Date(event.at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}
                {event.caseId && <> · <Link href={`/dashboard/orders/${event.caseId}`} className="text-blue-700 hover:underline">Sag</Link></>}
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
