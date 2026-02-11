'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, Users, FileText, FolderKanban, X } from 'lucide-react'
import { globalSearch } from '@/lib/actions/search'
import type { SearchResult, SearchResultType } from '@/types/search.types'

const typeConfig: Record<SearchResultType, { icon: typeof User; label: string; color: string }> = {
  lead: { icon: User, label: 'Lead', color: 'text-blue-600 bg-blue-50' },
  customer: { icon: Users, label: 'Kunde', color: 'text-green-600 bg-green-50' },
  offer: { icon: FileText, label: 'Tilbud', color: 'text-purple-600 bg-purple-50' },
  project: { icon: FolderKanban, label: 'Projekt', color: 'text-orange-600 bg-orange-50' },
}

export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsLoading(true)
      const response = await globalSearch(query)
      setIsLoading(false)

      if (response.success && response.results) {
        setResults(response.results)
        setIsOpen(response.results.length > 0)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && results[selectedIndex]) {
          navigateToResult(results[selectedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSelectedIndex(-1)
        inputRef.current?.blur()
        break
    }
  }

  const navigateToResult = (result: SearchResult) => {
    router.push(result.url)
    setQuery('')
    setIsOpen(false)
    setSelectedIndex(-1)
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Søg leads, kunder, tilbud, projekter..."
          className="w-full pl-10 pr-10 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-sm"
        />
        {query ? (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 rounded"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        ) : (
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 border rounded font-mono">
            Ctrl+K
          </kbd>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">Søger...</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              Ingen resultater for &quot;{query}&quot;
            </div>
          ) : (
            <div className="py-1">
              {results.map((result, index) => {
                const config = typeConfig[result.type]
                const Icon = config.icon

                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => navigateToResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                      index === selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`p-1.5 rounded ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{result.title}</div>
                      <div className="text-xs text-gray-500 truncate">{result.subtitle}</div>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{config.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Keyboard hints */}
          <div className="px-3 py-2 border-t bg-gray-50 text-xs text-gray-500 flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">↑↓</kbd> naviger
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">Enter</kbd> vælg
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">Esc</kbd> luk
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
