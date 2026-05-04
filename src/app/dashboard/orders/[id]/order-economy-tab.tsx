'use client'

/**
 * Sprint 5D — Økonomi-tab on /dashboard/orders/[id].
 *
 * Reads getServiceCaseEconomy(caseId) and renders:
 *   - Hero: contract / revised / total cost / DB%
 *   - Cost breakdown: labor / materials / other (each card has cost +
 *     sale + counts and a "→ åbn fane" link)
 *   - Invoicing: real numbers if invoices exist, otherwise a
 *     "kommer i Sprint 6" placeholder. NO fake invoice data.
 *   - Quality flags: a list of warnings derived from server flags
 *
 * Color coding:
 *   margin %  ≥ 25  emerald
 *             10-25 yellow
 *             < 10  red (or negative — same shade)
 *   sag.low_profit=true → extra red ribbon in hero
 */

import { useEffect, useState, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, AlertTriangle, Loader2, FileWarning,
  Clock, Package, Receipt, ArrowRight, Info, Banknote, FileText,
} from 'lucide-react'
import {
  getServiceCaseEconomy,
  type ServiceCaseEconomy,
} from '@/lib/actions/service-case-economy'
import { formatCurrency } from '@/lib/utils/format'

type SwitchTabFn = (tab: 'planlaegning' | 'materialer' | 'oevrige') => void

function fmtKr(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—'
  return formatCurrency(Number(n), 'DKK', decimals)
}

function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

function fmtPct(n: number, decimals = 1): string {
  return `${new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)} %`
}

function marginPalette(pct: number): {
  text: string
  bg: string
  border: string
  pill: string
} {
  if (pct >= 25)
    return {
      text: 'text-emerald-700',
      bg: 'bg-emerald-50',
      border: 'ring-emerald-200',
      pill: 'bg-emerald-100 text-emerald-800',
    }
  if (pct >= 10)
    return {
      text: 'text-yellow-700',
      bg: 'bg-yellow-50',
      border: 'ring-yellow-200',
      pill: 'bg-yellow-100 text-yellow-800',
    }
  return {
    text: 'text-red-700',
    bg: 'bg-red-50',
    border: 'ring-red-200',
    pill: 'bg-red-100 text-red-800',
  }
}

export function OrderEconomyTab({
  caseId,
  onSwitchTab,
}: {
  caseId: string
  onSwitchTab: SwitchTabFn
}) {
  const [data, setData] = useState<ServiceCaseEconomy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getServiceCaseEconomy(caseId)
    setLoading(false)
    if (!res.success) {
      setError(res.error ?? 'Kunne ikke beregne økonomi')
      return
    }
    setData(res.data ?? null)
  }, [caseId])

  useEffect(() => {
    reload()
  }, [reload])

  if (loading && !data) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-12 text-center text-sm text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-400" />
        Beregner økonomi…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 ring-1 ring-red-200 rounded-lg p-4 text-sm text-red-900 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        {error ?? 'Ingen data'}
      </div>
    )
  }

  const palette = marginPalette(data.totals.margin_percentage)
  const hasAnyData =
    data.labor.time_log_count > 0 ||
    data.materials.line_count > 0 ||
    data.other_costs.line_count > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Økonomi på sagen</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Live beregning fra registrerede timer, materialer og øvrige omkostninger.
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-60"
        >
          {loading ? 'Opdaterer…' : 'Opdatér'}
        </button>
      </div>

      {/* Empty / partial banner */}
      {!hasAnyData && (
        <div className="rounded-md bg-blue-50 ring-1 ring-blue-200 px-3 py-2 text-sm text-blue-900 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Ingen timer, materialer eller øvrige omkostninger registreret endnu.
          Tallene nedenfor er 0 indtil du booker noget på sagen.
        </div>
      )}

      {/* Hero row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HeroCard
          label="Tilbudt beløb"
          icon={<FileText className="w-4 h-4" />}
          value={fmtKr(data.contract_sum)}
          sub={data.contract_sum == null ? 'Ikke sat' : undefined}
        />
        <HeroCard
          label="Revideret beløb"
          icon={<FileText className="w-4 h-4" />}
          value={fmtKr(data.revised_sum)}
          sub={data.revised_sum == null ? 'Ingen revision' : undefined}
        />
        <HeroCard
          label="Samlet kost"
          icon={<TrendingDown className="w-4 h-4" />}
          value={fmtKr(data.totals.cost)}
          sub={`Salg ${fmtKr(data.totals.sales_price)}`}
        />
        <div
          className={`rounded-lg ring-1 ${palette.border} ${palette.bg} px-4 py-3`}
        >
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-600">
            <span className="flex items-center gap-1">
              {data.totals.margin_percentage >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              DB
            </span>
            {data.low_profit && (
              <span className="text-[10px] uppercase tracking-wide bg-red-200 text-red-900 px-1.5 py-0.5 rounded">
                LAV DB
              </span>
            )}
          </div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${palette.text}`}>
            {fmtKr(data.totals.contribution_margin)}
          </div>
          <div className="mt-0.5 text-xs">
            <span className={`px-1.5 py-0.5 rounded ${palette.pill}`}>
              {fmtPct(data.totals.margin_percentage)}
            </span>
            <span className="text-gray-500 ml-1.5">af salgspris</span>
          </div>
        </div>
      </div>

      {/* Budget + planned hours line */}
      {(data.budget != null || data.planned_hours != null) && (
        <div className="rounded ring-1 ring-gray-200 bg-white px-3 py-2 text-xs text-gray-700 flex flex-wrap gap-x-6 gap-y-1">
          {data.budget != null && (
            <span>
              <span className="text-gray-500">Internt budget:</span>{' '}
              <span className="tabular-nums font-medium">{fmtKr(data.budget)}</span>
            </span>
          )}
          {data.planned_hours != null && (
            <span>
              <span className="text-gray-500">Planlagte timer:</span>{' '}
              <span className="tabular-nums font-medium">{fmtNum(data.planned_hours, 1)}</span>
              {data.labor.total_hours > 0 && (
                <span className="text-gray-500">
                  {' '}
                  · brugt {fmtNum(data.labor.total_hours, 1)} (
                  {data.planned_hours > 0
                    ? fmtPct((data.labor.total_hours / data.planned_hours) * 100, 0)
                    : '—'}
                  )
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Cost breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <BreakdownCard
          title="Timer"
          icon={<Clock className="w-4 h-4 text-emerald-600" />}
          cost={data.labor.total_cost}
          sale={data.labor.total_sales_price}
          tone="emerald"
          rows={[
            { label: 'Arbejdsordrer', value: data.labor.work_order_count.toString() },
            {
              label: 'Timeregistreringer',
              value: data.labor.time_log_count.toString(),
            },
            { label: 'Timer brugt', value: fmtNum(data.labor.total_hours, 2) },
            data.labor.open_timer_count > 0
              ? {
                  label: 'Åbne timere',
                  value: data.labor.open_timer_count.toString(),
                  warning: true,
                }
              : null,
            data.labor.employees_without_rate_count > 0
              ? {
                  label: 'Mangler timesats',
                  value: `${data.labor.employees_without_rate_count} medarb.`,
                  warning: true,
                }
              : null,
          ].filter((x): x is NonNullable<typeof x> => x !== null)}
          onOpen={() => onSwitchTab('planlaegning')}
        />

        <BreakdownCard
          title="Materialer"
          icon={<Package className="w-4 h-4 text-blue-600" />}
          cost={data.materials.total_cost}
          sale={data.materials.total_sales_price}
          tone="blue"
          rows={[
            { label: 'Linjer', value: data.materials.line_count.toString() },
            data.materials.lines_without_cost > 0
              ? {
                  label: 'Mangler kostpris',
                  value: data.materials.lines_without_cost.toString(),
                  warning: true,
                }
              : null,
            data.materials.lines_without_sale > 0
              ? {
                  label: 'Mangler salgspris',
                  value: data.materials.lines_without_sale.toString(),
                  warning: true,
                }
              : null,
          ].filter((x): x is NonNullable<typeof x> => x !== null)}
          onOpen={() => onSwitchTab('materialer')}
        />

        <BreakdownCard
          title="Øvrige omkostninger"
          icon={<Receipt className="w-4 h-4 text-purple-600" />}
          cost={data.other_costs.total_cost}
          sale={data.other_costs.total_sales_price}
          tone="purple"
          rows={[
            { label: 'Linjer', value: data.other_costs.line_count.toString() },
            data.other_costs.lines_without_sale > 0
              ? {
                  label: 'Ikke viderefaktureret',
                  value: data.other_costs.lines_without_sale.toString(),
                  warning: true,
                }
              : null,
          ].filter((x): x is NonNullable<typeof x> => x !== null)}
          onOpen={() => onSwitchTab('oevrige')}
        />
      </div>

      {/* Invoicing */}
      <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Banknote className="w-4 h-4 text-gray-500" />
            Fakturering
          </h3>
          {!data.invoicing.has_invoice_data && (
            <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              Sprint 6
            </span>
          )}
        </div>

        {data.invoicing.has_invoice_data ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Mini label="Antal fakturaer" value={data.invoicing.invoice_count.toString()} />
            <Mini label="Faktureret" value={fmtKr(data.invoicing.invoiced_total)} />
            <Mini label="Heraf betalt" value={fmtKr(data.invoicing.invoiced_paid)} />
            <Mini
              label="Rest at fakturere"
              value={
                data.invoicing.remaining_to_invoice == null
                  ? '—'
                  : fmtKr(data.invoicing.remaining_to_invoice)
              }
              hint={
                data.invoicing.remaining_to_invoice == null
                  ? 'Mangler tilbudsbeløb'
                  : undefined
              }
            />
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Fakturadata vises her når Sprint 6 (Faktura + e-conomic) lander. Ingen
            fake tal — vi venter med at vise faktureringsstatus indtil rigtig
            fakturadata er tilgængelig.
          </p>
        )}
      </div>

      {/* Quality flags */}
      <QualityFlagsPanel data={data} onSwitchTab={onSwitchTab} />
    </div>
  )
}

// =====================================================
// Hero card
// =====================================================

function HeroCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

// =====================================================
// Breakdown card
// =====================================================

function BreakdownCard({
  title,
  icon,
  cost,
  sale,
  rows,
  onOpen,
  tone,
}: {
  title: string
  icon: React.ReactNode
  cost: number
  sale: number
  rows: Array<{ label: string; value: string; warning?: boolean }>
  onOpen: () => void
  tone: 'emerald' | 'blue' | 'purple'
}) {
  const cm = sale - cost
  const pct = sale > 0 ? (cm / sale) * 100 : 0
  const palette = sale > 0 ? marginPalette(pct) : null

  const ringTone =
    tone === 'emerald'
      ? 'ring-emerald-100'
      : tone === 'blue'
      ? 'ring-blue-100'
      : 'ring-purple-100'

  return (
    <div className={`rounded-lg ring-1 ${ringTone} bg-white p-4 flex flex-col`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <button
          type="button"
          onClick={onOpen}
          className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-0.5"
        >
          Åbn fane
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Kost</div>
          <div className="tabular-nums text-base font-semibold text-gray-900">
            {fmtKr(cost)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Salg</div>
          <div className="tabular-nums text-base font-semibold text-gray-900">
            {fmtKr(sale)}
          </div>
        </div>
      </div>
      {sale > 0 && palette && (
        <div className="rounded ring-1 ring-gray-100 bg-gray-50 px-2 py-1 text-xs flex items-center justify-between mb-2">
          <span className="text-gray-600 uppercase tracking-wide text-[10px]">DB</span>
          <span className="flex items-center gap-1.5">
            <span className={`tabular-nums font-medium ${palette.text}`}>
              {fmtKr(cm)}
            </span>
            <span className={`px-1.5 py-0.5 rounded ${palette.pill}`}>
              {fmtPct(pct)}
            </span>
          </span>
        </div>
      )}
      <div className="border-t border-gray-100 pt-2 mt-auto space-y-0.5">
        {rows.length === 0 ? (
          <div className="text-[11px] text-gray-400 italic">Ingen detaljer</div>
        ) : (
          rows.map((r, i) => (
            <div
              key={i}
              className={`flex items-center justify-between text-xs ${
                r.warning ? 'text-red-700' : 'text-gray-600'
              }`}
            >
              <span>{r.label}</span>
              <span className={`tabular-nums ${r.warning ? 'font-medium' : ''}`}>
                {r.value}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// =====================================================
// Mini stat
// =====================================================

function Mini({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="tabular-nums text-base font-semibold text-gray-900">{value}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  )
}

// =====================================================
// Quality flags
// =====================================================

function QualityFlagsPanel({
  data,
  onSwitchTab,
}: {
  data: ServiceCaseEconomy
  onSwitchTab: SwitchTabFn
}) {
  const items: Array<{
    severity: 'warning' | 'info'
    label: string
    detail: string
    onClick?: () => void
  }> = []

  if (data.quality_flags.no_contract_sum) {
    items.push({
      severity: 'warning',
      label: 'Mangler tilbudsbeløb',
      detail:
        'Sagen har hverken contract_sum eller revised_sum. Rest at fakturere kan ikke beregnes.',
    })
  }
  if (data.quality_flags.open_timer) {
    items.push({
      severity: 'warning',
      label: `${data.labor.open_timer_count} åben${data.labor.open_timer_count === 1 ? '' : 'e'} timer`,
      detail:
        'Åbne timere indgår ikke i kost/salg-summen. Stop dem på Planlægning/Timer-tab for retvisende DB.',
      onClick: () => onSwitchTab('planlaegning'),
    })
  }
  if (data.quality_flags.employees_without_rate) {
    items.push({
      severity: 'warning',
      label: 'Medarbejder mangler timesats',
      detail: `${data.labor.employees_without_rate_count} timeregistrering(er) uden timesats — salgsbeløb undervurderes. Sæt sats på medarbejderen.`,
      onClick: () => onSwitchTab('planlaegning'),
    })
  }
  if (data.quality_flags.materials_without_cost) {
    items.push({
      severity: 'warning',
      label: 'Materiale uden kostpris',
      detail: `${data.materials.lines_without_cost} materialelinje(r) har 0 i kostpris — DB% forskønnes.`,
      onClick: () => onSwitchTab('materialer'),
    })
  }
  if (data.quality_flags.materials_without_sale) {
    items.push({
      severity: 'warning',
      label: 'Materiale uden salgspris',
      detail: `${data.materials.lines_without_sale} materialelinje(r) har 0 i salgspris — DB underregnes.`,
      onClick: () => onSwitchTab('materialer'),
    })
  }
  if (data.quality_flags.low_margin) {
    items.push({
      severity: 'warning',
      label: 'Lav DB',
      detail: `Dækningsgrad er ${fmtPct(data.totals.margin_percentage)} — under tærsklen på 10 %.`,
    })
  }
  if (data.quality_flags.no_labor && data.quality_flags.no_materials && data.quality_flags.no_other_costs) {
    items.push({
      severity: 'info',
      label: 'Ingen registreret økonomi endnu',
      detail:
        'Ingen timer, materialer eller øvrige omkostninger booket. Start med at planlægge en arbejdsordre på Planlægning-fanen.',
      onClick: () => onSwitchTab('planlaegning'),
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-center gap-2">
        <TrendingUp className="w-4 h-4" />
        Ingen kvalitetsadvarsler — sagens økonomi-grundlag ser i orden ud.
      </div>
    )
  }

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
        <FileWarning className="w-4 h-4 text-amber-600" />
        Kvalitetsindikatorer
      </h3>
      <ul className="divide-y divide-gray-100">
        {items.map((it, i) => (
          <li key={i} className="py-2 flex items-start gap-3">
            <span
              className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full ${
                it.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-900">{it.label}</div>
              <div className="text-xs text-gray-600 mt-0.5">{it.detail}</div>
            </div>
            {it.onClick && (
              <button
                type="button"
                onClick={it.onClick}
                className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-0.5 whitespace-nowrap"
              >
                Åbn fane
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
