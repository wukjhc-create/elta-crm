'use client'

/**
 * W-15 (pilot-review 2026-10-15): noter af typen "Advarsel" (fx "Hund på adressen", "Ring før ankomst") vises øverst på
 * Overblik — før kun i Noter-fanen, så montøren så dem ikke.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getCaseNotes, type CaseNoteEntry } from '@/lib/actions/service-cases'

export function CaseWarningNotes({ caseId, onOpenNotes }: { caseId: string; onOpenNotes?: () => void }) {
  const [warnings, setWarnings] = useState<CaseNoteEntry[]>([])
  useEffect(() => {
    let alive = true
    getCaseNotes(caseId).then((res) => {
      if (alive && res.success && res.data) setWarnings(res.data.filter((n) => n.kind === 'warning'))
    }).catch(() => {})
    return () => { alive = false }
  }, [caseId])
  if (!warnings.length) return null
  return (
    <div className="rounded-lg ring-1 ring-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" data-testid="case-warning-notes">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="w-4 h-4" /> Advarsel{warnings.length > 1 ? `er (${warnings.length})` : ''}</div>
      <ul className="mt-1 space-y-1">
        {warnings.slice(0, 3).map((w) => <li key={w.id} className="whitespace-pre-wrap">{w.content}</li>)}
      </ul>
      {(warnings.length > 3 || onOpenNotes) && (
        <button type="button" onClick={onOpenNotes} className="mt-1 text-xs font-medium underline">
          {warnings.length > 3 ? `Se alle ${warnings.length} advarsler under Noter` : 'Åbn Noter'}
        </button>
      )}
    </div>
  )
}
