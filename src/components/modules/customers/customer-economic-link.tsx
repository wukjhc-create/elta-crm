'use client'

/**
 * N12 — kobling af kunden til en eksisterende e-conomic-debitor (kun
 * regnskabsroller). Uden kobling opretter første fakturaeksport en NY debitor
 * i e-conomic → dublet hvis kunden allerede findes der.
 */

import { useEffect, useState } from 'react'
import { BookCheck, Loader2 } from 'lucide-react'
import {
  getCustomerEconomicLinkAction,
  setCustomerEconomicNumberAction,
} from '@/lib/actions/accounting'

export function CustomerEconomicLink({ customerId }: { customerId: string }) {
  const [loaded, setLoaded] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getCustomerEconomicLinkAction(customerId).then((res) => {
      if (cancelled) return
      setCanEdit(res.ok && res.can_edit)
      setCurrent(res.customer_number)
      setValue(res.customer_number ?? '')
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [customerId])

  if (!loaded || !canEdit) return null

  const save = async () => {
    setSaving(true)
    setMsg(null)
    const res = await setCustomerEconomicNumberAction(customerId, value)
    setSaving(false)
    setMsg({ ok: res.ok, text: res.message })
    if (res.ok) setCurrent(res.customer_number ?? null)
  }

  return (
    <div className="mb-4 rounded-lg ring-1 ring-gray-200 bg-white p-3" data-testid="customer-economic-link">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <BookCheck className="w-4 h-4 text-gray-500" /> e-conomic
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {current
          ? `Koblet til e-conomic-kundenr. ${current} — fakturaer eksporteres til denne debitor.`
          : 'Ikke koblet. Findes kunden allerede i e-conomic, så angiv kundenummeret — ellers oprettes en ny debitor ved første eksport.'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor="economic-customer-number" className="text-xs text-gray-700">e-conomic-kundenr.</label>
        <input
          id="economic-customer-number"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={saving}
          placeholder="fx 1042"
          className="w-28 border rounded px-2 py-1 text-sm tabular-nums"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || value.trim() === (current ?? '')}
          className="inline-flex items-center gap-1 px-3 py-1 text-sm rounded bg-gray-900 text-white disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Gem
        </button>
      </div>
      {msg && (
        <div className={`mt-2 text-xs rounded px-2 py-1 ring-1 ${msg.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-red-50 text-red-900 ring-red-200'}`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
