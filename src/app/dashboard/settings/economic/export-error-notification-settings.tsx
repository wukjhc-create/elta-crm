'use client'

/**
 * Sprint Ø6.5 — Indstillinger for e-conomic eksportfejl-notifikation.
 *
 * Selvhentende sektion på e-conomic-opsætningssiden (gated settings.economic
 * af serveren). Aktiv-toggle, modtagere (komma/linje), anti-spam-interval +
 * "Send testnotifikation". Cost-free, ingen secrets.
 */

import { useEffect, useState, useTransition } from 'react'
import { BellRing, Loader2, Send } from 'lucide-react'
import {
  getExportErrorNotificationConfig,
  updateExportErrorNotificationConfig,
  sendExportErrorNotificationTestAction,
} from '@/lib/actions/settings'

export function ExportErrorNotificationSettings() {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [recipientsText, setRecipientsText] = useState('')
  const [minHours, setMinHours] = useState('20')
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    getExportErrorNotificationConfig()
      .then((res) => {
        if (!alive || !res.success || !res.data) return
        setEnabled(res.data.enabled)
        setRecipientsText(res.data.recipients.join('\n'))
        setMinHours(String(res.data.min_hours_between))
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const parseRecipients = (t: string): string[] =>
    Array.from(new Set(t.split(/[\n,;]+/).map((s) => s.trim()).filter((s) => s.includes('@'))))

  const handleSave = () => {
    setFlash(null)
    startSave(async () => {
      const res = await updateExportErrorNotificationConfig({
        enabled,
        recipients: parseRecipients(recipientsText),
        min_hours_between: Number(minHours) || 20,
      })
      setFlash(res.success ? { ok: true, text: 'Notifikationsindstillinger gemt.' } : { ok: false, text: res.error || 'Kunne ikke gemme.' })
      if (res.success && res.data) setRecipientsText(res.data.recipients.join('\n'))
    })
  }

  const handleTest = () => {
    setFlash(null)
    startTest(async () => {
      const res = await sendExportErrorNotificationTestAction()
      setFlash(
        res.success
          ? { ok: true, text: `Testnotifikation sendt (${res.data?.failed_count ?? 0} fejl i opsummeringen).` }
          : { ok: false, text: res.error || 'Kunne ikke sende testnotifikation.' }
      )
    })
  }

  const busy = saving || testing
  const recipientCount = parseRecipients(recipientsText).length

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-800">
          <BellRing className="w-4 h-4 text-gray-500" /> Notifikation om eksportfejl
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Daglig samlet opsummering til bogholderiet, hvis der findes åbne e-conomic eksportfejl. Aldrig én mail pr. fejl.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter…
        </div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={busy} />
            Aktivér daglig eksportfejl-notifikation
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Modtagere (komma- eller linjeadskilt)</span>
            <textarea
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
              rows={3}
              placeholder="bogholderi@eltasolar.dk"
              disabled={busy}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <span className="text-[11px] text-gray-400">{recipientCount} gyldig(e) modtager(e)</span>
          </label>

          <label className="block max-w-xs">
            <span className="text-xs font-medium text-gray-600">Min. timer mellem mails (anti-spam)</span>
            <input
              type="number" min={1} max={168} value={minHours}
              onChange={(e) => setMinHours(e.target.value)} disabled={busy}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <span className="text-[11px] text-gray-400">Sendes oftere kun hvis antallet af fejl ændrer sig.</span>
          </label>

          {flash && (
            <div className={`rounded-md px-3 py-2 text-sm ${flash.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
              {flash.text}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
              Gem
            </button>
            <button
              onClick={handleTest}
              disabled={busy || recipientCount === 0}
              title={recipientCount === 0 ? 'Tilføj en modtager først' : 'Send en testnotifikation nu'}
              className="inline-flex items-center gap-1.5 rounded-md ring-1 ring-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send testnotifikation
            </button>
          </div>
        </>
      )}
    </div>
  )
}
