'use client'

/**
 * Sprint Ø9.5 — Indkøbsdrift-widget (porteføljevidt).
 *
 * INTERN indkøbsøkonomi — gated incoming_invoices.view (mount-betinget på
 * dashboardet). Tæller på tværs af sager: sager med handling, ukonverterede
 * linjer, forfaldne + snart-forfaldne leverandørfakturaer. Read-only, ét kald,
 * ingen polling. CTA til den dedikerede indkøbsdrift-side.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ClipboardList, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { getPurchaseOperationsDashboardAction, type PurchaseOperationsDashboard } from '@/lib/actions/purchase-operations'

export function PurchaseOperationsWidget() {
  const [data, setData] = useState<PurchaseOperationsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getPurchaseOperationsDashboardAction()
      .then((r) => { if (!alive) return; if (r.ok) setData(r); else setError(r.message || 'Kunne ikke hente indkøbsdrift') })
      .catch(() => { if (alive) setError('Kunne ikke hente indkøbsdrift') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const nothing = !!data && data.total_cases_with_action === 0

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-600" />
          Indkøbsdrift
        </h2>
        <Link href="/dashboard/purchase-operations?reason=action_required" className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
          Åbn indkøbsdrift <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-gray-400 py-4">{error || 'Ingen data'}</p>
      ) : nothing ? (
        <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>Ingen sager kræver indkøbshandling lige nu.</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat href="/dashboard/purchase-operations?reason=action_required" label="Sager med handling" value={data.total_cases_with_action} tone="blue" icon={<ClipboardList className="w-3.5 h-3.5 text-blue-600" />} />
            <Stat href="/dashboard/purchase-operations?reason=approved_unconverted" label="Ukonverterede linjer" value={data.total_unconverted_lines} tone="amber" icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />} />
            <Stat href="/dashboard/purchase-operations?reason=overdue" label="Forfaldne fakturaer" value={data.overdue_invoice_count} tone="red" icon={<AlertTriangle className="w-3.5 h-3.5 text-red-600" />} />
            <Stat href="/dashboard/purchase-operations?reason=due_soon" label="Inden 7 dage" value={data.due_soon_invoice_count} tone="amber" icon={<Clock className="w-3.5 h-3.5 text-amber-600" />} />
          </div>

          {data.approved_with_unconverted_count > 0 && (
            <Link href="/dashboard/purchase-operations?reason=action_required" className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-1.5 hover:bg-amber-100">
              <AlertTriangle className="w-3.5 h-3.5" />
              {data.approved_with_unconverted_count} godkendt(e)/bogført(e) faktura(er) har linjer der ikke er ført på sagen.
            </Link>
          )}

          <Link href="/dashboard/purchase-operations?reason=action_required" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline pt-1">
            Se hvor der skal handles <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Intern indkøbsøkonomi — ikke kundevendt. Forfald regnes for godkendte/bogførte fakturaer.
      </p>
    </div>
  )
}

function Stat({ href, label, value, tone, icon }: { href: string; label: string; value: number; tone: 'blue' | 'amber' | 'red'; icon: React.ReactNode }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-blue-700'
  return (
    <Link href={href} className="rounded-lg ring-1 ring-gray-200 bg-gray-50 px-3 py-2.5 hover:ring-blue-300 block">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">{icon} {label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</div>
    </Link>
  )
}
