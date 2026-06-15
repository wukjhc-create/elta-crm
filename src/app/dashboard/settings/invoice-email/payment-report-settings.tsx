'use client'

/**
 * Sprint Ø5.0 — Indstillinger for planlagt betalingsrapport-mail.
 *
 * Bogholderiet kan slå den ugentlige rapport til/fra, vælge modtagere +
 * filter, og sende en testrapport. Cost-free: kun modtagere + filtervalg.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle, BadgeCheck, CalendarClock, History, Info, Loader2, Save, Send, Settings2,
} from 'lucide-react'
import {
  getPaymentReportConfig,
  updatePaymentReportConfig,
  sendPaymentReportTestAction,
  getPaymentReportHistoryAction,
  type PaymentReportHistory,
} from '@/lib/actions/settings'
import {
  DEFAULT_PAYMENT_REPORT_CONFIG,
  FREQUENCY_LABEL,
  WEEKDAY_LABEL,
  nextScheduledRun,
  type PaymentReportConfig,
  type PaymentReportFilter,
  type PaymentReportFrequency,
} from '@/lib/invoices/payment-report-config'

const FILTER_OPTIONS: Array<{ key: PaymentReportFilter; label: string }> = [
  { key: 'overdue', label: 'Kun forfaldne' },
  { key: 'outstanding', label: 'Kun udestående' },
  { key: 'both', label: 'Udestående (inkl. forfaldne)' },
]
const FREQ_OPTIONS: PaymentReportFrequency[] = ['weekly', 'biweekly', 'monthly']

function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(s))
}
function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d)
}

export function PaymentReportSettings({ canManage }: { canManage: boolean }) {
  const [cfg, setCfg] = useState<PaymentReportConfig>(DEFAULT_PAYMENT_REPORT_CONFIG)
  const [recipientsText, setRecipientsText] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [testing, startTestTransition] = useTransition()
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<PaymentReportHistory | null>(null)

  const loadHistory = useCallback(() => {
    getPaymentReportHistoryAction().then((r) => setHistory(r.success && r.data ? r.data : null))
  }, [])

  useEffect(() => {
    getPaymentReportConfig().then((r) => {
      if (r.success && r.data) {
        setCfg(r.data)
        setRecipientsText(r.data.recipients.join(', '))
      }
      setLoading(false)
    })
    loadHistory()
  }, [loadHistory])

  // Næste planlagte kørsel beregnes lokalt af samme regel som cronen.
  const nextRun = useMemo(() => nextScheduledRun(cfg, new Date()), [cfg])

  const parseRecipients = (): string[] =>
    recipientsText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'))

  const handleSave = () => {
    if (!canManage) return
    startTransition(async () => {
      const res = await updatePaymentReportConfig({ ...cfg, recipients: parseRecipients() })
      setFlash(res.success ? { ok: true, text: 'Rapportindstillinger gemt.' } : { ok: false, text: res.error ?? 'Kunne ikke gemme.' })
      if (res.success && res.data) {
        setCfg(res.data)
        setRecipientsText(res.data.recipients.join(', '))
      }
      loadHistory()
      setTimeout(() => setFlash(null), 6000)
    })
  }

  const handleTest = () => {
    if (!canManage) return
    startTestTransition(async () => {
      const res = await sendPaymentReportTestAction()
      setFlash({ ok: res.ok, text: res.message })
      loadHistory()
      setTimeout(() => setFlash(null), 8000)
    })
  }

  if (loading) {
    return (
      <section className="rounded-lg ring-1 ring-gray-200 bg-white p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Henter rapportindstillinger…
      </section>
    )
  }

  return (
    <section className="rounded-lg ring-1 ring-gray-200 bg-white p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-emerald-600" />
        Automatisk betalingsrapport
      </h2>
      <p className="text-xs text-gray-500">
        Send automatisk en betalingsopfølgningsliste (CSV) til bogholderiet hver mandag morgen.
        Cost-free — kun kundekontakt + fakturabeløb, ingen interne tal.
      </p>

      {flash && (
        <div className={`text-sm rounded px-3 py-2 ring-1 ${flash.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-red-50 text-red-900 ring-red-200'}`}>
          {flash.text}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => setCfg((p) => ({ ...p, enabled: e.target.checked }))}
          disabled={!canManage}
        />
        Aktivér automatisk betalingsrapport
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Frekvens</label>
          <select
            value={cfg.frequency}
            onChange={(e) => setCfg((p) => ({ ...p, frequency: e.target.value as PaymentReportFrequency }))}
            disabled={!canManage}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {FREQ_OPTIONS.map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {cfg.frequency === 'monthly' ? 'Første ugedag i måneden' : 'Ugedag'}
          </label>
          <select
            value={cfg.weekday}
            onChange={(e) => setCfg((p) => ({ ...p, weekday: Number(e.target.value) }))}
            disabled={!canManage}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>{WEEKDAY_LABEL[d]}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Modtagere (komma- eller linjeadskilt)</label>
          <textarea
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            disabled={!canManage}
            rows={2}
            placeholder="bogholderi@eltasolar.dk, rikke@eltasolar.dk"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Hvilke kunder</label>
          <select
            value={cfg.filter}
            onChange={(e) => setCfg((p) => ({ ...p, filter: e.target.value as PaymentReportFilter }))}
            disabled={!canManage}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.skip_if_empty}
              onChange={(e) => setCfg((p) => ({ ...p, skip_if_empty: e.target.checked }))}
              disabled={!canManage}
            />
            Spring over hvis ingen kunder (ingen tom mail)
          </label>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        Rapporten sendes kl. 07:30 på den valgte ugedag (cronen kører dagligt og vurderer
        selv ud fra frekvensen). "Send testrapport" sender med det samme (markeret [TEST]).
      </p>

      {/* Sprint Ø5.1 — status + næste kørsel */}
      <div className="rounded-lg ring-1 ring-gray-200 bg-gray-50 px-3 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <StatusItem icon={<CalendarClock className="w-3.5 h-3.5 text-emerald-600" />} label="Næste kørsel" value={cfg.enabled ? fmtDate(nextRun) : 'Slået fra'} />
        <StatusItem icon={<BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />} label="Sidst sendt" value={fmtDateTime(history?.last_sent_at ?? null)} />
        <StatusItem icon={<Send className="w-3.5 h-3.5 text-blue-600" />} label="Sidste test" value={fmtDateTime(history?.last_test_at ?? null)} />
        <StatusItem
          icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
          label="Sidst sprunget over"
          value={history?.last_skip_at ? `${fmtDateTime(history.last_skip_at)} (${history.last_skip_reason ?? '—'})` : '—'}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={!canManage || testing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ring-1 ring-blue-300 text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-60"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send testrapport
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canManage || pending}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Gem
        </button>
      </div>

      {/* Sprint Ø5.1 — rapporthistorik (fra audit_logs, menneskelige labels) */}
      <div className="rounded-lg ring-1 ring-gray-200 overflow-hidden mt-1">
        <div className="px-3 py-2 bg-gray-50 border-b flex items-center gap-1.5">
          <History className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-800">Rapporthistorik</h3>
        </div>
        {!history || history.entries.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gray-500">Der er endnu ingen rapporthændelser.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.entries.map((e) => (
              <li key={e.id} className="px-3 py-2 flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">{eventIcon(e.action)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800">
                    {e.label}
                    {e.row_count != null && (
                      <span className="text-gray-500"> · {e.row_count} kunde{e.row_count === 1 ? '' : 'r'}</span>
                    )}
                    {e.skip_reason_label && <span className="text-amber-700"> · {e.skip_reason_label}</span>}
                  </div>
                  <div className="text-[11px] text-gray-400">{fmtDateTime(e.created_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function StatusItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-gray-800 font-medium truncate" title={value}>{value}</div>
    </div>
  )
}

function eventIcon(action: string): React.ReactNode {
  if (action === 'payment_report_sent') return <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
  if (action === 'payment_report_test_sent') return <Send className="w-3.5 h-3.5 text-blue-600" />
  if (action === 'payment_report_skipped') return <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
  return <Settings2 className="w-3.5 h-3.5 text-gray-500" />
}
