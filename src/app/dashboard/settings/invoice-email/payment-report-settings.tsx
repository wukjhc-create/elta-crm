'use client'

/**
 * Sprint Ø5.0 — Indstillinger for planlagt betalingsrapport-mail.
 *
 * Bogholderiet kan slå den ugentlige rapport til/fra, vælge modtagere +
 * filter, og sende en testrapport. Cost-free: kun modtagere + filtervalg.
 */

import { useEffect, useState, useTransition } from 'react'
import { CalendarClock, Info, Loader2, Save, Send } from 'lucide-react'
import {
  getPaymentReportConfig,
  updatePaymentReportConfig,
  sendPaymentReportTestAction,
} from '@/lib/actions/settings'
import {
  DEFAULT_PAYMENT_REPORT_CONFIG,
  type PaymentReportConfig,
  type PaymentReportFilter,
} from '@/lib/invoices/payment-report-config'

const FILTER_OPTIONS: Array<{ key: PaymentReportFilter; label: string }> = [
  { key: 'overdue', label: 'Kun forfaldne' },
  { key: 'outstanding', label: 'Kun udestående' },
  { key: 'both', label: 'Udestående (inkl. forfaldne)' },
]

export function PaymentReportSettings({ canManage }: { canManage: boolean }) {
  const [cfg, setCfg] = useState<PaymentReportConfig>(DEFAULT_PAYMENT_REPORT_CONFIG)
  const [recipientsText, setRecipientsText] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [testing, startTestTransition] = useTransition()
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    getPaymentReportConfig().then((r) => {
      if (r.success && r.data) {
        setCfg(r.data)
        setRecipientsText(r.data.recipients.join(', '))
      }
      setLoading(false)
    })
  }, [])

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
      setTimeout(() => setFlash(null), 6000)
    })
  }

  const handleTest = () => {
    if (!canManage) return
    startTestTransition(async () => {
      const res = await sendPaymentReportTestAction()
      setFlash({ ok: res.ok, text: res.message })
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
        Aktivér ugentlig betalingsrapport
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        Rapporten sendes hver mandag kl. 07:30. "Send testrapport" sender med det samme til
        modtagerne (markeret [TEST]) uanset om der er kunder på listen.
      </p>

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
    </section>
  )
}
