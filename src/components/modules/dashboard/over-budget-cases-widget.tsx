'use client'

/**
 * Fokus D 2026-10-15: åbne sager der løber over estimat (timer >10 % over) eller over tilbudt kost — fanges mens sagen
 * kører, ikke først i efterkalkulationen. Selvhentende, read-only; viser procenter og flag, ingen kostbeløb
 * (shoulder-surfing). Gated economy.view (mount-betinget i dashboardet).
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Gauge, Loader2 } from 'lucide-react'
import { getProjectProfitabilityReport, type ProjectProfitability } from '@/lib/actions/reports'
import { humanizeErrorText } from '@/lib/auth/permission-text'

export function overBudget(p: ProjectProfitability): boolean {
  return (p.hours_deviation_pct ?? 0) > 10 || (p.cost_deviation ?? 0) > 0
}

export function OverBudgetCasesWidget({ initial }: { initial?: Awaited<ReturnType<typeof getProjectProfitabilityReport>> | null } = {}) {
  // PF-1 (performance-review 2026-10-16): forsiden henter data på serveren (parallelt, streamet via Suspense) og giver
  // resultatet som `initial` — browseren kører server actions én ad gangen, så ~12 selvhentende widgets ventede på hinanden
  const initRows = initial?.success && initial.data ? initial.data.rows.filter(overBudget) : null
  const [rows, setRows] = useState<ProjectProfitability[] | null>(initRows)
  const [error, setError] = useState<string | null>(initial && !initRows ? (humanizeErrorText(initial.error) || 'Kunne ikke hente sager') : null)
  // DB-7 (dashboard-review 2026-10-18): rapporten ser kun de nyeste 200 åbne sager — sig det i stedet for "ingen over estimat"
  const [truncated, setTruncated] = useState<boolean>(!!(initial?.success && (initial.data as { truncated?: boolean } | undefined)?.truncated))

  useEffect(() => {
    if (initial) return
    let alive = true
    getProjectProfitabilityReport({ status: 'open', limit: 200 })
      .then((r) => { if (!alive) return; if (r.success && r.data) { setRows(r.data.rows.filter(overBudget)); setTruncated(!!(r.data as { truncated?: boolean }).truncated) } else setError(humanizeErrorText(r.error) || 'Kunne ikke hente sager') })
      .catch(() => { if (alive) setError('Kunne ikke hente sager') })
    return () => { alive = false }
  }, [initial])

  return (
    <div className="bg-white p-6 rounded-lg border" data-testid="over-budget-widget">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Gauge className="w-5 h-5 text-amber-600" />
          Sager over estimat
        </h2>
        <Link href="/dashboard/reports" className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
          Efterkalkulation <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {rows == null && !error ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Henter…</div>
      ) : error ? (
        <p className="text-sm text-gray-400 py-4">{error}</p>
      ) : rows && rows.length === 0 ? (
        <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>{truncated ? 'Ingen over estimat blandt de 200 nyeste åbne sager — se efterkalkulationen for resten.' : 'Ingen åbne sager over estimat.'}</span>
        </div>
      ) : (
        <ul className="divide-y text-sm">
          {[...(rows ?? [])].sort((a, b) => (b.hours_deviation_pct ?? 0) - (a.hours_deviation_pct ?? 0)).slice(0, 6).map((p) => (
            <li key={p.project_id} className="py-2 flex items-center gap-2">
              <Link href={`/dashboard/orders/${p.project_id}`} className="font-medium text-gray-900 hover:underline truncate">{p.project_name || p.project_number}</Link>
              <span className="ml-auto flex items-center gap-2 shrink-0">
                {(p.hours_deviation_pct ?? 0) > 10 && (
                  <span className="text-xs rounded bg-red-50 text-red-700 px-1.5 py-0.5">timer +{String(p.hours_deviation_pct).replace('.', ',')} %</span>
                )}
                {(p.cost_deviation ?? 0) > 0 && <span className="text-xs rounded bg-amber-50 text-amber-800 px-1.5 py-0.5">over tilbudt kost</span>}
              </span>
            </li>
          ))}
          {(rows?.length ?? 0) > 6 && <li className="pt-2 text-xs text-gray-500">+ {(rows?.length ?? 0) - 6} flere i efterkalkulationen</li>}
          {truncated && <li className="pt-1 text-xs text-gray-500">Kun de 200 nyeste åbne sager er vurderet her.</li>}
        </ul>
      )}
    </div>
  )
}
