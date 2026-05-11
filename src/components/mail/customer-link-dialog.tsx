'use client'

/**
 * Sprint 8H Phase 1A polish — Kobl-mail-til-kunde dialog.
 *
 * UX-forbedringer vs. inline-modalen i mail-client.tsx:
 *  - Initial dropdown: viser seneste 12 kunder ved åbning (uden Henrik
 *    skal skrive først).
 *  - Debounced søgning (250 ms) med loading-spinner.
 *  - Tom-state med "Opret som ny kunde"-knap der trigger den
 *    eksisterende createCustomerFromEmail-handler.
 *  - Enter vælger første resultat, Escape lukker.
 *  - Spinner på den valgte row mens linkning udfoeres — modal lukker
 *    først ved success.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search, X, UserPlus, AlertCircle } from 'lucide-react'

interface CustomerRow {
  id: string
  customer_number: string | null
  company_name: string
  contact_person: string | null
  email: string | null
  phone: string | null
}

interface CustomerLinkDialogProps {
  /** Vises i header — fx "Kobl mail til kunde". */
  title?: string
  /** Hint-tekst der vises over input. */
  hint?: string
  /** Senders email (bruges til at fremhæve direct-match). */
  senderEmailHint?: string | null
  /** Klik på kunde → kald denne med customerId. Returnér success/fejl. */
  onLink: (customerId: string) => Promise<{ success: boolean; error?: string }>
  /** Klik på "Opret som ny kunde". Kan være undefined så vises ikke. */
  onCreateNew?: () => Promise<void>
  /** Luk uden valg. */
  onClose: () => void
}

const PAGE_SIZE = 12

export function CustomerLinkDialog({
  title = 'Kobl til kunde',
  hint = 'Søg eller vælg fra listen for at koble mailen.',
  senderEmailHint = null,
  onLink,
  onCreateNew,
  onClose,
}: CustomerLinkDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlightIdx, setHighlightIdx] = useState(0)

  // Initial load + debounced search
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const run = async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()

        const trimmed = query.trim()
        if (trimmed.length === 0) {
          // Initial state: seneste kunder
          const { data, error: e } = await supabase
            .from('customers')
            .select('id, customer_number, company_name, contact_person, email, phone')
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(PAGE_SIZE)
          if (!cancelled) {
            if (e) setError('Kunne ikke hente kunder')
            else setResults((data || []) as CustomerRow[])
          }
        } else {
          // Sanitér så bruger ikke kan injecte ',()' i .or()
          const safe = trimmed.replace(/[,()]/g, ' ').substring(0, 100)
          const { data, error: e } = await supabase
            .from('customers')
            .select('id, customer_number, company_name, contact_person, email, phone')
            .eq('is_active', true)
            .or(
              `company_name.ilike.%${safe}%,customer_number.ilike.%${safe}%,email.ilike.%${safe}%,contact_person.ilike.%${safe}%`
            )
            .limit(PAGE_SIZE)
          if (!cancelled) {
            if (e) setError('Søgning fejlede')
            else setResults((data || []) as CustomerRow[])
          }
        }
      } catch {
        if (!cancelled) setError('Søgning fejlede')
      } finally {
        if (!cancelled) {
          setLoading(false)
          setHighlightIdx(0)
        }
      }
    }

    const handle = setTimeout(run, query.trim().length === 0 ? 0 : 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query])

  // Esc + click outside
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !linkingId && !creatingNew) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, linkingId, creatingNew])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Find sender-match for top-fremhævning
  const senderMatchId = senderEmailHint
    ? results.find(
        (r) =>
          r.email && r.email.toLowerCase() === senderEmailHint.toLowerCase()
      )?.id ?? null
    : null

  const orderedResults = senderMatchId
    ? [
        ...results.filter((r) => r.id === senderMatchId),
        ...results.filter((r) => r.id !== senderMatchId),
      ]
    : results

  const handleSelect = async (c: CustomerRow) => {
    if (linkingId) return
    setLinkingId(c.id)
    setError(null)
    try {
      const r = await onLink(c.id)
      if (!r.success) {
        setError(r.error || 'Kunne ikke koble mailen')
        setLinkingId(null)
        return
      }
      // Success → onLink-handleren (parent) lukker modal via onClose hvis ønsket;
      // vi lukker også her for at undgå race
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uventet fejl')
      setLinkingId(null)
    }
  }

  const handleCreateNew = async () => {
    if (!onCreateNew || creatingNew) return
    setCreatingNew(true)
    setError(null)
    try {
      await onCreateNew()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uventet fejl')
      setCreatingNew(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (orderedResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(orderedResults.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = orderedResults[highlightIdx]
      if (c) void handleSelect(c)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-link-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !linkingId && !creatingNew) onClose()
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 id="customer-link-title" className="text-lg font-semibold">
            {title}
          </h3>
          <button
            onClick={onClose}
            disabled={linkingId !== null || creatingNew}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Luk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b space-y-2">
          <p className="text-xs text-gray-500">{hint}</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Søg firmanavn, kundenr, email, kontakt..."
              disabled={linkingId !== null || creatingNew}
              className="w-full pl-8 pr-8 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-100"
            />
            {loading && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
            )}
          </div>
        </div>

        {/* Resultatliste */}
        <div className="flex-1 overflow-y-auto">
          {orderedResults.length === 0 && !loading ? (
            <div className="p-6 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="text-sm text-gray-500">Ingen kunder fundet.</p>
              {onCreateNew && (
                <button
                  type="button"
                  onClick={handleCreateNew}
                  disabled={creatingNew}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                >
                  {creatingNew ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                  Opret som ny kunde
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {orderedResults.map((c, idx) => {
                const isHighlighted = idx === highlightIdx
                const isLinking = linkingId === c.id
                const isSenderMatch = senderMatchId === c.id
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(c)}
                      disabled={linkingId !== null || creatingNew}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isHighlighted ? 'bg-blue-50' : ''
                      } ${isSenderMatch ? 'border-l-2 border-emerald-500' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                            <span className="truncate">{c.company_name}</span>
                            {isSenderMatch && (
                              <span className="shrink-0 text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                Match på afsender
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {c.customer_number ? `${c.customer_number} · ` : ''}
                            {c.contact_person ? `${c.contact_person} · ` : ''}
                            {c.email || c.phone || '—'}
                          </div>
                        </div>
                        {isLinking && (
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center justify-between gap-3 bg-gray-50">
          <div className="flex-1 min-w-0">
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span className="truncate">{error}</span>
              </p>
            )}
            {!error && orderedResults.length > 0 && (
              <p className="text-[11px] text-gray-400">
                {orderedResults.length} kunde{orderedResults.length === 1 ? '' : 'r'} —
                tryk Enter for at vælge {highlightIdx + 1}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onCreateNew && orderedResults.length > 0 && (
              <button
                type="button"
                onClick={handleCreateNew}
                disabled={linkingId !== null || creatingNew}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 disabled:opacity-50"
              >
                {creatingNew ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <UserPlus className="w-3 h-3" />
                )}
                Opret ny kunde
              </button>
            )}
            <button
              onClick={onClose}
              disabled={linkingId !== null || creatingNew}
              className="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
            >
              Annullér
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
