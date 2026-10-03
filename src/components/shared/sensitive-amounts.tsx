'use client'

/**
 * Privacy / shoulder-surfing (Henrik 2026-10-03): følsomme beløb vises maskeret indtil brugeren aktivt vælger
 * "Vis beløb", og maskeres igen automatisk når fanen/vinduet skjules (browserfane skiftet, skærm låst) eller
 * komponenten forlades. Bruges i faner der først henter følsomme data, når de åbnes.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const RevealContext = createContext(false)

export function SensitiveRevealProvider({ children, label = 'beløb' }: { children: React.ReactNode; label?: string }) {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') setRevealed(false) }
    const blur = () => setRevealed(false)
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('blur', blur)
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('blur', blur) }
  }, [])
  return (
    <RevealContext.Provider value={revealed}>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
          data-testid="sensitive-reveal-toggle"
          aria-pressed={revealed}
        >
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {revealed ? `Skjul ${label}` : `Vis ${label}`}
        </button>
      </div>
      {children}
    </RevealContext.Provider>
  )
}

/** Viser værdien når afsløret, ellers en maske. */
export function Sensitive({ children }: { children: React.ReactNode }) {
  const revealed = useContext(RevealContext)
  return revealed
    ? <span data-testid="sensitive-value">{children}</span>
    : <span className="tracking-widest text-gray-400 select-none" data-testid="sensitive-masked" aria-label="skjult">••••••</span>
}
