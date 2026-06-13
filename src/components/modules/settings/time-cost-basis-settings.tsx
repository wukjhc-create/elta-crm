'use client'

/**
 * Sprint Ø2.12B — Timeøkonomi/kostbasis flyttet til Kalkulations-indstillinger
 * (hører hjemme sammen med timepriser/avancer, ikke under "Virksomhed").
 *
 * Styrer company_settings.time_cost_basis + time_cost_rate. Gemmes via
 * updateCompanySettings (gated settings.manage). Pragmatisk validering.
 */

import { useState, useEffect } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { updateCompanySettings, getCompanySettings } from '@/lib/actions/settings'
import { TIME_COST_BASIS_OPTIONS, type TimeCostBasis } from '@/types/company-settings.types'
import { useToast } from '@/components/ui/toast'

const HIGH_RATE_WARN = 5000 // kr/t — over dette spørges der bekræftelse

export function TimeCostBasisSettings() {
  const { success, error: showError } = useToast()
  const [basis, setBasis] = useState<TimeCostBasis>('real_hourly_cost')
  const [rate, setRate] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCompanySettings().then((r) => {
      if (r.success && r.data) {
        setBasis((r.data.time_cost_basis as TimeCostBasis) ?? 'real_hourly_cost')
        setRate(r.data.time_cost_rate == null ? '' : String(r.data.time_cost_rate))
      }
    })
  }, [])

  const help = TIME_COST_BASIS_OPTIONS.find((o) => o.value === basis)?.help

  const onSave = async () => {
    let rateNum: number | null = null
    if (basis === 'fixed_standard_rate') {
      if (rate.trim() === '') {
        showError('Angiv en standard intern timekost')
        return
      }
      rateNum = Number(rate.replace(',', '.'))
      if (!Number.isFinite(rateNum) || rateNum < 0) {
        showError('Standardkost skal være et positivt tal')
        return
      }
      if (rateNum > HIGH_RATE_WARN && !window.confirm(`${rateNum} kr/t er usædvanligt højt. Gem alligevel?`)) {
        return
      }
    }
    setSaving(true)
    const res = await updateCompanySettings({ time_cost_basis: basis, time_cost_rate: rateNum })
    setSaving(false)
    if (res.success) success('Timeøkonomi gemt')
    else showError('Kunne ikke gemme', res.error)
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-5 h-5 text-orange-600" />
        <h2 className="text-lg font-semibold">Timeøkonomi — intern kostbasis</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Hvilken kostbasis bruges når en timeregistrering oprettes eller ændres.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="time_cost_basis" className="block text-sm font-medium text-gray-700 mb-1">Kostbasis</label>
          <select
            id="time_cost_basis"
            value={basis}
            onChange={(e) => setBasis(e.target.value as TimeCostBasis)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            {TIME_COST_BASIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{help}</p>
        </div>

        {basis === 'fixed_standard_rate' && (
          <div>
            <label htmlFor="time_cost_rate" className="block text-sm font-medium text-gray-700 mb-1">
              Standard intern timekost (kr/t)
            </label>
            <input
              id="time_cost_rate"
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="fx 400"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-500 mt-1">Bruges for alle medarbejdere.</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 bg-amber-50 ring-1 ring-amber-200 rounded-md p-3 text-sm text-amber-900">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
        <span>
          Ændring påvirker kun <strong>nye og redigerede</strong> timeregistreringer. Historiske
          timer beholder deres frosne kost-snapshots og ændres ikke.
        </span>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
        >
          {saving ? 'Gemmer…' : 'Gem timeøkonomi'}
        </button>
      </div>
    </div>
  )
}
