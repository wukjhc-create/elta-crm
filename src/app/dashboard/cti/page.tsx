import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { lookupCaller } from '@/lib/integrations/relatel/lookup'
import { formatPhoneForDisplay } from '@/lib/integrations/relatel/phone'

export const metadata: Metadata = { title: 'Opkald', description: 'Hvem ringer? Opslag på telefonnummer' }
export const dynamic = 'force-dynamic'

const KIND_LABEL = { customer: 'Kunde', contact: 'Kontaktperson', lead: 'Lead' } as const

/**
 * P3 #15 — CTI-foundation: /dashboard/cti?number=4571999999 viser hvem nummeret tilhører + åbne sager/tilbud.
 * Målet for "Åbn i ELTA CRM" fra Relatel (se docs/integrations/RELATEL_CONTRACT.md). Kræver login; RLS gælder.
 */
export default async function CtiPage({ searchParams }: { searchParams: Promise<{ number?: string }> }) {
  // Egen permission-check før datahentning (layout og side renderes parallelt).
  if (!(await pageHasPermission('customers.view'))) return <NoAccess permission="customers.view" />
  const { number: raw } = await searchParams
  const res = await lookupCaller(await createClient(), raw)

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Phone className="h-5 w-5 text-gray-500" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Opkald</h1>
          <p className="text-sm text-gray-500">
            {res.number ? formatPhoneForDisplay(res.number) : raw ? `Ugyldigt nummer: ${raw}` : 'Angiv et nummer, fx ?number=4571999999'}
          </p>
        </div>
      </div>

      {res.number && res.matches.length === 0 && (
        <div className="rounded-lg border bg-white p-4 text-sm text-gray-700">
          Ukendt nummer — ingen kunde, kontaktperson eller lead har det.{' '}
          <Link href="/dashboard/leads" className="text-blue-600 hover:underline">Opret lead</Link>
          {' · '}
          <Link href="/dashboard/customers" className="text-blue-600 hover:underline">Søg kunde</Link>
        </div>
      )}

      {res.matches.length > 0 && (
        <section className="rounded-lg border bg-white">
          <h2 className="border-b px-4 py-2 font-medium text-gray-900">Match ({res.matches.length})</h2>
          <ul className="divide-y">
            {res.matches.map((m) => (
              <li key={`${m.kind}-${m.id}`} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  <span className="font-medium text-gray-900">{m.label}</span>
                  <span className="text-gray-500"> · {KIND_LABEL[m.kind]}{m.detail && m.kind === 'customer' ? ` ${m.detail}` : ''}</span>
                </span>
                <Link href={m.kind === 'lead' ? `/dashboard/leads/${m.id}` : `/dashboard/customers/${m.customer_id}`} className="text-blue-600 hover:underline">
                  Åbn
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(res.openCases.length > 0 || res.openOffers.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border bg-white">
            <h2 className="border-b px-4 py-2 font-medium text-gray-900">Åbne sager</h2>
            {res.openCases.length === 0 ? <p className="px-4 py-2 text-sm text-gray-500">Ingen</p> : (
              <ul className="divide-y">
                {res.openCases.map((c) => (
                  <li key={c.id} className="px-4 py-2 text-sm">
                    <Link href={`/dashboard/service-cases/${c.id}`} className="text-blue-600 hover:underline">{c.case_number ?? 'Sag'}</Link> {c.title} <span className="text-gray-400">· {c.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-lg border bg-white">
            <h2 className="border-b px-4 py-2 font-medium text-gray-900">Åbne tilbud</h2>
            {res.openOffers.length === 0 ? <p className="px-4 py-2 text-sm text-gray-500">Ingen</p> : (
              <ul className="divide-y">
                {res.openOffers.map((o) => (
                  <li key={o.id} className="px-4 py-2 text-sm">
                    <Link href={`/dashboard/offers/${o.id}`} className="text-blue-600 hover:underline">{o.offer_number ?? 'Tilbud'}</Link> {o.title} <span className="text-gray-400">· {o.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
