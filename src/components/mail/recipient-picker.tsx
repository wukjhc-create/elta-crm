'use client'

/**
 * Sprint 8G — Recipient Picker.
 *
 * Lader brugeren vælge mellem flere mulige modtagere (betaler, site
 * customer, site contact, kontakter med rolle). Hentes via
 * getRecipientOptionsForCase eller getRecipientOptionsForCustomer.
 *
 * Hvis ingen ekstern modtager findes, vises tydelig fejl-state.
 * Genbrugelig i mail-detail og task-mail-dialog.
 */

import { useEffect, useState } from 'react'
import { ChevronDown, AlertCircle, Loader2, Send } from 'lucide-react'
import {
  getRecipientOptionsForCase,
  getRecipientOptionsForCustomer,
  type RecipientOption,
  type RecipientContext,
} from '@/lib/actions/mail-recipients'

interface RecipientPickerProps {
  /** Hvis sat: hent via case-helper (inkluderer site_customer + site_contact). */
  serviceCaseId?: string | null
  /** Fallback hvis case ikke er sat: hent kun customer-baseret. */
  customerId?: string | null
  /** Aktuel valgt email. Parent ejer state — vi kalder onChange. */
  value: string
  /** Hvis bruger skriver en email manuelt der ikke matcher en option,
   *  passes den videre som type='manual'. */
  onChange: (email: string) => void
  disabled?: boolean
  /** Hvis sat: vis 'Vælg modtager' header-label, ellers vis kun input + dropdown. */
  label?: string
}

export function RecipientPicker({
  serviceCaseId = null,
  customerId = null,
  value,
  onChange,
  disabled = false,
  label = 'Modtager',
}: RecipientPickerProps) {
  const [options, setOptions] = useState<RecipientOption[]>([])
  const [defaultEmail, setDefaultEmail] = useState<string | null>(null)
  const [context, setContext] = useState<RecipientContext>({
    payerName: null,
    siteCustomerName: null,
    siteContactName: null,
    caseNumber: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const load = async () => {
      try {
        let result: { options: RecipientOption[]; defaultEmail: string | null; context: RecipientContext }
        if (serviceCaseId) {
          result = await getRecipientOptionsForCase(serviceCaseId)
        } else if (customerId) {
          result = await getRecipientOptionsForCustomer(customerId)
        } else {
          result = {
            options: [],
            defaultEmail: null,
            context: { payerName: null, siteCustomerName: null, siteContactName: null, caseNumber: null },
          }
        }
        if (cancelled) return
        setOptions(result.options)
        setDefaultEmail(result.defaultEmail)
        setContext(result.context)
        // Sæt default kun hvis value er tom og vi har en default
        if (!value && result.defaultEmail) {
          onChange(result.defaultEmail)
        }
      } catch {
        if (!cancelled) setError('Kunne ikke hente modtagere — skriv manuelt')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceCaseId, customerId])

  // Find aktiv option for label-rendering
  const activeOption = options.find((o) => o.email === value)

  const handleSelect = (opt: RecipientOption) => {
    onChange(opt.email)
    setOpen(false)
  }

  const hasNoOptions = !loading && options.length === 0
  const hasNoDefault = !loading && options.length > 0 && !defaultEmail && !value

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-gray-600">{label}</label>
      )}
      <div className="relative">
        <div className="flex items-center gap-1.5">
          <input
            type="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || loading}
            placeholder={
              hasNoOptions ? 'Skriv modtager-email manuelt' : 'kunde@example.dk'
            }
            className="flex-1 px-2.5 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-100"
          />
          {options.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              disabled={disabled || loading}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 disabled:opacity-50"
              title="Vælg fra liste"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
              Vælg ({options.length})
            </button>
          )}
        </div>

        {/* Dropdown */}
        {open && options.length > 0 && (
          <div className="absolute z-30 mt-1 w-full bg-white border rounded-md shadow-lg max-h-72 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0 ${
                  opt.email === value ? 'bg-blue-50' : ''
                }`}
              >
                <div className="font-medium text-gray-900">{opt.label}</div>
                <div className="text-xs text-gray-500 font-mono">{opt.email}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sprint 8H Phase 1B: context-bar — viser hvem mailen sendes til,
          hvem der betaler, og hvilken sag det handler om. */}
      {value && !open && (() => {
        const isManual = !activeOption && value.trim().length > 0
        const parts: string[] = []
        if (isManual) {
          parts.push(`Manuel modtager — kontrollér email før afsendelse`)
        } else if (activeOption) {
          parts.push(`Sendes til: ${activeOption.label}`)
        }
        if (context.payerName && !isManual && activeOption?.kind !== 'paying_customer') {
          parts.push(`Betaler: ${context.payerName}`)
        }
        if (context.caseNumber) {
          parts.push(`Sag: ${context.caseNumber}`)
        }
        if (parts.length === 0) return null
        return (
          <div
            className={`flex items-start gap-1.5 text-[11px] rounded px-2 py-1 ${
              isManual
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-blue-50/60 text-blue-900 border border-blue-100'
            }`}
          >
            <Send className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{parts.join(' · ')}</span>
          </div>
        )
      })()}

      {/* States */}
      {hasNoOptions && (
        <p className="text-xs text-amber-700 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Ingen kendte modtagere — skriv manuelt
        </p>
      )}
      {hasNoDefault && (
        <p className="text-xs text-gray-500">Vælg en modtager fra listen</p>
      )}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  )
}
