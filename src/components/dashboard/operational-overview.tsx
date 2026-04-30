'use client'

/**
 * Operational overview (Phase 6.1).
 *
 * - Polls /api/dashboard/stats every 30 s.
 * - Renders 8 stat cards, three list views, and a system health panel.
 * - Never blocks: any fetch failure shows "no data" / "—" rather than
 *   throwing or hiding the page.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Mail,
  Users,
  Wrench,
  FileText,
  Send,
  AlertTriangle,
  CreditCard,
  ShieldCheck,
} from 'lucide-react'

const REFRESH_MS = 30_000

type Status = 'ok' | 'warning' | 'error'

interface DashboardPayload {
  generated_at: string
  counts: {
    new_emails_last_24h: number
    new_customers_last_24h: number
    open_cases: number
    offers_draft: number
    invoices_sent: number
    invoices_overdue: number
    payments_today: number
    system_errors_last_hour: number
  }
  latest_emails: Array<{
    id: string; subject: string | null; sender_name: string | null;
    sender_email: string | null; received_at: string; customer_id: string | null
  }>
  latest_invoices: Array<{
    id: string; invoice_number: string; final_amount: number; currency: string;
    status: string; payment_status: string; created_at: string
  }>
  overdue_invoices: Array<{
    id: string; invoice_number: string; final_amount: number; currency: string;
    due_date: string | null; days_overdue: number; customer_id: string | null
  }>
  system_health: {
    overall: Status
    services: Array<{
      service: string; status: Status;
      errorsLastHour: number; warningsLastHour: number;
      lastErrorMessage: string | null
    }>
  }
}

const fmtAmount = (n: number, currency = 'DKK') =>
  new Intl.NumberFormat('da-DK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const fmtRelative = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'lige nu'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} t`
  const d = Math.floor(h / 24)
  return `${d} d`
}

const SERVICE_LABEL: Record<string, string> = {
  email: 'Email',
  email_intel: 'AI',
  auto_case: 'Cases',
  auto_offer: 'Tilbud',
  invoice: 'Faktura',
  bank: 'Bank',
  economic: 'e-conomic',
  health_check: 'Health',
}

export function OperationalOverview() {
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as DashboardPayload
      setData(json)
      setError(null)
      setLastFetched(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, REFRESH_MS)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Operationelt overblik</h2>
          <p className="text-xs text-gray-500">
            Auto-refresh hvert 30 sek
            {lastFetched && ` · sidst opdateret ${fmtRelative(lastFetched.toISOString())} siden`}
            {error && <span className="text-red-600 ml-2">· kunne ikke hente data</span>}
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs px-3 py-1 border rounded hover:bg-gray-50"
          disabled={loading}
        >
          Opdater
        </button>
      </div>

      <StatGrid data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ListCard
          title="Seneste e-mails"
          empty="Ingen e-mails endnu."
          rows={data?.latest_emails ?? []}
          render={(r) => (
            <div key={r.id} className="py-2 border-b last:border-b-0 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium truncate">{r.subject || '(uden emne)'}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{fmtRelative(r.received_at)}</span>
              </div>
              <div className="text-xs text-gray-500 truncate">
                {r.sender_name || r.sender_email || 'Ukendt afsender'}
              </div>
            </div>
          )}
        />
        <ListCard
          title="Seneste fakturaer"
          empty="Ingen fakturaer endnu."
          rows={data?.latest_invoices ?? []}
          render={(r) => (
            <div key={r.id} className="py-2 border-b last:border-b-0 text-sm flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{r.invoice_number}</div>
                <div className="text-xs text-gray-500">{r.status} / {r.payment_status}</div>
              </div>
              <div className="text-right">
                <div className="font-medium">{fmtAmount(r.final_amount, r.currency)}</div>
                <div className="text-xs text-gray-500">{fmtRelative(r.created_at)}</div>
              </div>
            </div>
          )}
        />
        <ListCard
          title="Forfaldne fakturaer"
          empty="Ingen forfaldne — godt arbejde."
          rows={data?.overdue_invoices ?? []}
          render={(r) => (
            <div key={r.id} className="py-2 border-b last:border-b-0 text-sm flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{r.invoice_number}</div>
                <div className="text-xs text-red-600">{r.days_overdue} dage forfalden</div>
              </div>
              <div className="text-right font-medium">{fmtAmount(r.final_amount, r.currency)}</div>
            </div>
          )}
        />
      </div>

      <SystemHealthPanel health={data?.system_health ?? null} />

      <AiInsightsPanel />
    </div>
  )
}

function AiInsightsPanel() {
  const [insights, setInsights] = useState<Array<{
    id: string; type: string; message: string; detail?: string;
    severity: 'info' | 'warning' | 'critical'
  }>>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/ai-insights', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setInsights(j?.insights ?? []) })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">AI-anbefalinger</h3>
        <span className="text-[11px] text-gray-400">forslag — anvend manuelt</span>
      </div>
      {!loaded && <p className="text-xs text-gray-400">Henter…</p>}
      {loaded && insights.length === 0 && (
        <p className="text-xs text-gray-400">Ingen aktuelle anbefalinger.</p>
      )}
      <div className="space-y-2">
        {insights.map((i) => {
          const tone =
            i.severity === 'critical' ? 'bg-red-50 ring-red-200 text-red-900'
            : i.severity === 'warning' ? 'bg-amber-50 ring-amber-200 text-amber-900'
            : 'bg-emerald-50 ring-emerald-200 text-emerald-900'
          return (
            <div key={i.id} className={`p-3 rounded ring-1 ${tone}`}>
              <div className="text-sm font-medium">{i.message}</div>
              {i.detail && <div className="text-xs opacity-80 mt-1">{i.detail}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =====================================================
// Stat grid
// =====================================================

function StatGrid({ data }: { data: DashboardPayload | null }) {
  const c = data?.counts
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard icon={<Mail className="h-4 w-4" />} label="Nye e-mails (24t)"
        value={c?.new_emails_last_24h} tone="neutral" href="/dashboard/mail" />
      <StatCard icon={<Users className="h-4 w-4" />} label="Nye kunder (24t)"
        value={c?.new_customers_last_24h} tone="neutral" href="/dashboard/customers" />
      <StatCard icon={<Wrench className="h-4 w-4" />} label="Åbne cases"
        value={c?.open_cases} tone="neutral" href="/dashboard/service-cases" />
      <StatCard icon={<FileText className="h-4 w-4" />} label="Tilbud i kladde"
        value={c?.offers_draft} tone="neutral" href="/dashboard/offers" />
      <StatCard icon={<Send className="h-4 w-4" />} label="Sendte fakturaer"
        value={c?.invoices_sent} tone="neutral" />
      <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Forfaldne fakturaer"
        value={c?.invoices_overdue}
        tone={(c?.invoices_overdue ?? 0) > 0 ? 'error' : 'ok'} />
      <StatCard icon={<CreditCard className="h-4 w-4" />} label="Betalinger i dag"
        value={c?.payments_today} tone="ok" href="/dashboard/bank" />
      <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="System-fejl (1t)"
        value={c?.system_errors_last_hour}
        tone={
          (c?.system_errors_last_hour ?? 0) > 5 ? 'error'
          : (c?.system_errors_last_hour ?? 0) > 0 ? 'warning'
          : 'ok'
        } />
    </div>
  )
}

type Tone = 'ok' | 'warning' | 'error' | 'neutral'

function toneClasses(tone: Tone) {
  switch (tone) {
    case 'ok':      return { ring: 'ring-emerald-200',  text: 'text-emerald-700', dot: 'bg-emerald-500'  }
    case 'warning': return { ring: 'ring-amber-200',    text: 'text-amber-700',   dot: 'bg-amber-500'    }
    case 'error':   return { ring: 'ring-red-200',      text: 'text-red-700',     dot: 'bg-red-500'      }
    default:        return { ring: 'ring-gray-200',     text: 'text-gray-700',    dot: 'bg-gray-400'     }
  }
}

function StatCard({ icon, label, value, tone, href }: {
  icon: React.ReactNode; label: string; value: number | undefined; tone: Tone; href?: string
}) {
  const cls = toneClasses(tone)
  const inner = (
    <div className={`p-4 rounded-lg bg-white ring-1 ${cls.ring} hover:shadow-sm transition`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${cls.dot}`} />
          {label}
        </span>
        <span className={cls.text}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold">
        {value === undefined ? <span className="text-gray-300">—</span> : value}
      </div>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

// =====================================================
// List cards
// =====================================================

function ListCard<T>({ title, empty, rows, render }: {
  title: string; empty: string; rows: T[]; render: (r: T) => React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 py-6 text-center">{empty}</p>
      ) : (
        <div className="divide-y">{rows.map(render)}</div>
      )}
    </div>
  )
}

// =====================================================
// System health panel
// =====================================================

function SystemHealthPanel({ health }: { health: DashboardPayload['system_health'] | null }) {
  if (!health) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
        <h3 className="text-sm font-semibold mb-2">System status</h3>
        <p className="text-xs text-gray-400">Ingen data tilgængelig.</p>
      </div>
    )
  }
  const overallTone = toneClasses(health.overall)
  // Show the user-facing services in the requested order.
  const ORDER = ['email', 'email_intel', 'invoice', 'bank', 'economic']
  const visible = ORDER
    .map((s) => health.services.find((x) => x.service === s))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">System status</h3>
        <span className={`text-xs font-medium flex items-center gap-1.5 ${overallTone.text}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${overallTone.dot}`} />
          {health.overall.toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {visible.map((s) => {
          const cls = toneClasses(s.status)
          return (
            <div key={s.service} className={`p-3 rounded ring-1 ${cls.ring}`}>
              <div className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${cls.dot}`} />
                {SERVICE_LABEL[s.service] || s.service}
              </div>
              <div className={`mt-1 text-sm font-medium ${cls.text}`}>{s.status}</div>
              <div className="mt-1 text-[11px] text-gray-500">
                {s.errorsLastHour} fejl · {s.warningsLastHour} warn (1t)
              </div>
              {s.lastErrorMessage && s.status !== 'ok' && (
                <div className="mt-1 text-[11px] text-red-700 truncate" title={s.lastErrorMessage}>
                  {s.lastErrorMessage}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
