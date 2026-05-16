'use client'

/**
 * Sprint 9D — Genbrugelig adresse-autocomplete.
 *
 * Kalder /api/address/search (server-route der bruger
 * src/lib/services/address-lookup.ts). UI'en kalder ALDRIG DAWA
 * direkte — det er gemt af wrapper-laget saa vi kan skifte udbyder.
 *
 * Features:
 *  - Debounced soegning (250ms) efter min. 3 tegn
 *  - Keyboard: pil op/ned + Enter + Escape
 *  - Loading spinner
 *  - Diskret tom-state
 *  - Graceful fejlhaandtering: fejl viser tom dropdown, brugeren kan
 *    skrive videre manuelt.
 *
 * Bemaerk: der findes ogsaa en aeldre `DawaAddressInput` i
 * components/shared der kalder DAWA direkte fra browseren. Den
 * beholdes for bagudkompatibilitet — nye forms boer bruge denne
 * komponent.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import type { AddressSuggestion } from '@/lib/services/address-lookup'

const DEBOUNCE_MS = 250
const MIN_QUERY = 3

interface AddressAutocompleteProps {
  /** Aktuel inputtekst — controlled. */
  value: string
  /** Kaldes paa hver tastetryk. */
  onChange: (value: string) => void
  /** Kaldes naar brugeren vaelger et forslag. Caller mapper de
   *  relevante felter til sit form-state (street/postnr/by osv.). */
  onSelect: (suggestion: AddressSuggestion) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  /** Max forslag (default 8). */
  limit?: number
  /** Vis ikon i input venstre side (default true). */
  showIcon?: boolean
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Indtast adresse...',
  disabled,
  id,
  className = '',
  limit = 8,
  showIcon = true,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Luk dropdown ved click udenfor
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < MIN_QUERY) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    // Cancel evt. tidligere igangvaerende request
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    try {
      const res = await fetch(
        `/api/address/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        { signal: controller.signal }
      )
      if (!res.ok) {
        setSuggestions([])
        setShowDropdown(false)
        return
      }
      const json = (await res.json()) as { suggestions?: AddressSuggestion[] }
      const list = json.suggestions ?? []
      setSuggestions(list)
      setShowDropdown(list.length > 0)
      setHighlightedIndex(-1)
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        // Net-fejl — fald gracefully tilbage paa manuel input
        setSuggestions([])
        setShowDropdown(false)
      }
    } finally {
      setIsLoading(false)
    }
  }, [limit])

  const handleInputChange = (next: string) => {
    onChange(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(next), DEBOUNCE_MS)
  }

  const handleSelect = (s: AddressSuggestion) => {
    setSuggestions([])
    setShowDropdown(false)
    setHighlightedIndex(-1)
    onSelect(s)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === 'Escape') setShowDropdown(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault()
        handleSelect(suggestions[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowDropdown(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        {showIcon && (
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        )}
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          className={`w-full ${showIcon ? 'pl-10' : 'pl-3'} pr-8 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 disabled:opacity-50 ${className}`}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin pointer-events-none" />
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto"
        >
          {suggestions.map((s, idx) => {
            const isHighlighted = idx === highlightedIndex
            const key = s.dawaId || s.adgangsadresseId || `${s.label}-${idx}`
            return (
              <li key={key} role="option" aria-selected={isHighlighted}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => handleSelect(s)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                    isHighlighted ? 'bg-emerald-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
