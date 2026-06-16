'use client'

/**
 * Sprint Ø7.1 — Read-only notes-panel på sagsdetaljen.
 *
 * Viser case_notes (fx "Oprettet fra tilbud …") med tidspunkt, tekst, type
 * og forfatter. Intern visning (gated cases.view i action). Håndterer
 * loading / tom / fejl / manglende permission. Ingen note-editor (ingen
 * eksisterende editor-mønster fundet) — kun visning.
 */

import { useEffect, useState } from 'react'
import { StickyNote, FileText } from 'lucide-react'
import { getCaseNotes, type CaseNoteEntry } from '@/lib/actions/service-cases'

const fmtDateTime = (s: string) => {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('da-DK', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const KIND_LABEL: Record<string, string> = {
  system: 'System',
  general: 'Note',
  warning: 'Advarsel',
}

export function OrderNotesTab({ caseId }: { caseId: string }) {
  const [notes, setNotes] = useState<CaseNoteEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCaseNotes(caseId).then((res) => {
      if (cancelled) return
      if (!res.success) {
        setError(res.error || 'Kunne ikke hente noter')
        setNotes([])
        return
      }
      setNotes(res.data ?? [])
    })
    return () => { cancelled = true }
  }, [caseId])

  if (notes === null) {
    return <div className="text-sm text-gray-500 py-6 text-center">Henter noter…</div>
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
        {error}
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-12">
        <StickyNote className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <h3 className="text-base font-medium text-gray-700">Ingen noter endnu</h3>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Noter på sagen — fx når den oprettes fra et tilbud — vises her.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <div key={n.id} className="bg-gray-50 rounded ring-1 ring-gray-200 p-3 flex items-start gap-3">
          <FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {n.kind && (
                <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  {KIND_LABEL[n.kind] ?? n.kind}
                </span>
              )}
              <span className="text-xs text-gray-500 font-mono">{fmtDateTime(n.created_at)}</span>
              {n.author_name && <span className="text-xs text-gray-500">· {n.author_name}</span>}
            </div>
            <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{n.content}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
