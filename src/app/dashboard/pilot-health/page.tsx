import type { Metadata } from 'next'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { getUserRoleForPage } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { collectPilotHealthSnapshot, type HealthLevel } from '@/lib/ops/pilot-health'

export const metadata: Metadata = {
  title: 'Pilot Health',
  description: 'Samlet read-only driftsbillede for piloten',
}

export const dynamic = 'force-dynamic'

const LEVEL: Record<HealthLevel, { dot: string; text: string; label: string }> = {
  green: { dot: 'bg-green-500', text: 'text-green-700', label: 'OK' },
  yellow: { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Obs' },
  red: { dot: 'bg-red-500', text: 'text-red-700', label: 'Handling' },
  unknown: { dot: 'bg-gray-400', text: 'text-gray-600', label: 'Ukendt' },
}

export default async function PilotHealthPage() {
  // Service-role bruges nedenfor → admin-tjek HER (layout-guarden alene stopper ikke sidens datahentning).
  if ((await getUserRoleForPage()) !== 'admin') return <NoAccess permission="admin" />

  const snap = await collectPilotHealthSnapshot(createAdminClient())
  const overall = LEVEL[snap.overall]

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pilot Health</h1>
          <p className="text-sm text-gray-500">
            Read-only overblik. Intet på siden ændrer data eller starter jobs. Opdateret{' '}
            {new Date(snap.generatedAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${overall.text}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${overall.dot}`} /> Samlet: {overall.label}
          </span>
          <Link href="/dashboard/pilot-health" prefetch={false} className="inline-flex items-center gap-1 rounded border px-3 py-1 text-sm hover:bg-gray-50">
            <RefreshCw className="h-3.5 w-3.5" /> Opdatér
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {snap.sections.map((s) => {
          const lv = LEVEL[s.level]
          return (
            <section key={s.key} className="rounded-lg border bg-white">
              <header className="flex items-center justify-between border-b px-4 py-2">
                <h2 className="font-medium text-gray-900">{s.title}</h2>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${lv.text}`}>
                  <span className={`h-2 w-2 rounded-full ${lv.dot}`} /> {lv.label}
                </span>
              </header>
              {s.error ? (
                <p className="px-4 py-3 text-sm text-gray-600">Kunne ikke hentes: {s.error}</p>
              ) : s.items.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">Intet at vise.</p>
              ) : (
                <ul className="divide-y">
                  {s.items.map((i) => (
                    <li key={i.label} className="flex gap-3 px-4 py-2 text-sm">
                      <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${LEVEL[i.level].dot}`} aria-label={LEVEL[i.level].label} />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-800">{i.label}</div>
                        <div className="break-words text-gray-600">{i.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
