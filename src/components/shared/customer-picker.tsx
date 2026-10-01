'use client'

/**
 * Søgbar kundevælger (N14): serversøgning med debounce på navn, kontakt, e-mail og kundenummer.
 * Erstatter <select> med ALLE kunder (tung at bruge og begrænset til 1.000 rækker af Supabase).
 */
import { useEffect, useRef, useState } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { searchCustomersForPickerAction, getCustomerPickerItemAction, type CustomerPickerItem } from '@/lib/actions/customers'

const label = (c: CustomerPickerItem) => `${c.company_name}${c.customer_number ? ` (${c.customer_number})` : ''}`

export function CustomerPicker({ value, onChange, disabled, id = 'customer_picker', placeholder = 'Søg kunde (navn, mail, kundenr.)…' }: {
  value: string | null | undefined
  onChange: (customerId: string | null) => void
  disabled?: boolean
  id?: string
  placeholder?: string
}) {
  const [selected, setSelected] = useState<CustomerPickerItem | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerPickerItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Vis navnet på en forvalgt kunde (redigering / "nyt tilbud fra kundekortet")
  useEffect(() => {
    if (!value) { setSelected(null); return }
    if (selected?.id === value) return
    let alive = true
    getCustomerPickerItemAction(value).then((r) => { if (alive && r.success) setSelected(r.data ?? null) })
    return () => { alive = false }
  }, [value, selected?.id])

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    const t = setTimeout(async () => {
      const r = await searchCustomersForPickerAction(query)
      if (!alive) return
      setResults(r.success && r.data ? r.data : [])
      setLoading(false)
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [query, open])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (c: CustomerPickerItem) => { setSelected(c); onChange(c.id); setOpen(false); setQuery('') }

  return (
    <div ref={boxRef} className="relative" data-testid="customer-picker">
      {selected && !open ? (
        <div className="flex items-center gap-2 w-full px-3 py-2 border rounded-md bg-white">
          <button type="button" className="flex-1 text-left truncate" onClick={() => !disabled && setOpen(true)} disabled={disabled}>
            {label(selected)}
          </button>
          {!disabled && (
            <button type="button" aria-label="Fjern kunde" onClick={() => { setSelected(null); onChange(null) }} className="text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id={id}
            type="text"
            autoComplete="off"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full pl-9 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto bg-white border rounded-md shadow-lg" role="listbox">
          {loading && <li className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Søger…</li>}
          {!loading && results.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Ingen kunder fundet</li>}
          {!loading && results.map((c) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={c.id === value} onClick={() => pick(c)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50" data-testid="customer-picker-option">
                <span className="block text-sm font-medium">{label(c)}</span>
                {(c.contact_person || c.email) && <span className="block text-xs text-gray-500">{[c.contact_person, c.email].filter(Boolean).join(' · ')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
