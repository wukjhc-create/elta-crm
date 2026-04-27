'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Loader2 } from 'lucide-react'

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

interface DawaSuggestion {
  tekst: string
  adresse: {
    vejnavn: string
    husnr: string
    etage: string | null
    dør: string | null
    postnr: string
    postnrnavn: string
    x: number // longitude
    y: number // latitude
  }
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
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
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
    if (query.length < 2) { setSuggestions([]); return }
    setIsLoading(true)
    try {
      const res = await fetch(
        `https://api.dataforsyningen.dk/adresser/autocomplete?q=${encodeURIComponent(query)}&per_side=6&fuzzy=`
      )
      if (res.ok) {
        const data: DawaSuggestion[] = await res.json()
        setSuggestions(data)
        setShowDropdown(data.length > 0)
        setHighlightedIndex(-1)
      }
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = (val: string) => {
    setInput(val)
    onChange?.(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250)
  }

  const selectSuggestion = (s: DawaSuggestion) => {
    const addr = s.adresse
    const street = `${addr.vejnavn} ${addr.husnr}`.trim()
    setInput(s.tekst)
    setSuggestions([])
    setShowDropdown(false)
    onSelect({
      address: street,
      postal_code: addr.postnr,
      city: addr.postnrnavn,
      latitude: addr.y,
      longitude: addr.x,
      full_text: s.tekst,
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
              <span>{s.tekst}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================
// Postal code → city lookup
// =====================================================

export async function lookupPostalCode(postalCode: string): Promise<string | null> {
  if (!/^\d{4}$/.test(postalCode)) return null
  try {
    const res = await fetch(`https://api.dataforsyningen.dk/postnumre/${postalCode}`)
    if (res.ok) {
      const data = await res.json()
      return data.navn || null
    }
  } catch {
    // Silent
  }
  return null
}
