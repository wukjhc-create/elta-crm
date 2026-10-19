'use client'

/**
 * Adressefelt med forslag. ADDR-1 (2026-10-19): kalder IKKE længere DAWA direkte fra browseren (DAWA svarer 410 Gone)
 * — forslag og postnummer→by går via serverens udbyder-abstraktion (/api/address/search, /api/address/postcode).
 * Uden konfigureret udbyder er feltet almindelig fritekst med en kort note. Navnet bevares af hensyn til kalderne.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import type { AddressSuggestion } from '@/lib/address/provider'
import { resolveSelectedAddress } from '@/lib/address/client-resolve'

export interface DawaAddress {
  address: string
  postal_code: string
  city: string
  latitude: number
  longitude: number
  full_text: string // "Lyngbyvej 34, 2100 København Ø"
}

interface DawaAddressInputProps {
  value?: string
  postalCode?: string
  city?: string
  onSelect: (addr: DawaAddress) => void
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
}

export function DawaAddressInput({
  value = '',
  onSelect,
  onChange,
  placeholder = 'Indtast adresse...',
  disabled,
  id,
  className = '',
}: DawaAddressInputProps) {
  const [input, setInput] = useState(value)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [lookupOff, setLookupOff] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => { setInput(value) }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchSuggestions = useCallback(async (query: string) => {
    if (lookupOff || query.trim().length < 3) { setSuggestions([]); return }
    setIsLoading(true)
    try {
      const res = await fetch(`/api/address/search?q=${encodeURIComponent(query)}&limit=6`)
      if (res.ok) {
        const data = (await res.json()) as { suggestions?: AddressSuggestion[]; enabled?: boolean }
        if (data.enabled === false) { setLookupOff(true); setSuggestions([]); setShowDropdown(false); return }
        const list = data.suggestions ?? []
        setSuggestions(list)
        setShowDropdown(list.length > 0)
        setHighlightedIndex(-1)
      }
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setIsLoading(false)
    }
  }, [lookupOff])

  const handleInputChange = (val: string) => {
    setInput(val)
    onChange?.(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250)
  }

  const selectSuggestion = async (picked: AddressSuggestion) => {
    setSuggestions([])
    setShowDropdown(false)
    setInput(picked.label)
    // ADDR-1: forslaget slås op via id (præcise felter); fejl → forslagets egne felter
    setIsLoading(true)
    const s = await resolveSelectedAddress(picked).finally(() => setIsLoading(false))
    const street = `${s.street} ${s.houseNumber ?? ''}`.trim()
    setInput(s.label)
    onSelect({
      address: street,
      postal_code: s.postalCode,
      city: s.city,
      latitude: s.latitude ?? 0,
      longitude: s.longitude ?? 0,
      full_text: s.label,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[highlightedIndex])
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          id={id}
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full pl-10 pr-8 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
      </div>
      {lookupOff && (
        <p className="mt-1 text-xs text-gray-500" data-testid="address-lookup-off">Adresseforslag er ikke tilgængelige — skriv adressen manuelt.</p>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => selectSuggestion(s)}
              className={`w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 flex items-center gap-2 ${
                idx === highlightedIndex ? 'bg-blue-50' : ''
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================
// Postal code → city lookup (via serveren; null når opslag er slået fra — intet gæt)
// =====================================================

export async function lookupPostalCode(postalCode: string): Promise<string | null> {
  if (!/^\d{4}$/.test(postalCode)) return null
  try {
    const res = await fetch(`/api/address/postcode?nr=${encodeURIComponent(postalCode)}`)
    if (res.ok) {
      const data = (await res.json()) as { city?: string | null }
      return data.city || null
    }
  } catch {
    // Silent
  }
  return null
}
