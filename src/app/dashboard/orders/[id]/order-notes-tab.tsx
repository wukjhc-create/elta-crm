'use client'

/**
 * Sprint Ø7.1 + Ø7.2 + Ø7.4 — Notes-panel på sagsdetaljen.
 *
 * Ø7.1: visning. Ø7.2: opret. Ø7.4: rediger/slet (gated server-side,
 * cases.edit eller cases.edit.own+egen note). Read-after-write/refresh,
 * dobbeltklik-sikring, pæne states. Intern — ingen portal/kundevendt.
 */

import { useEffect, useState, useTransition } from 'react'
import { StickyNote, FileText, Loader2, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import {
  getCaseNotes,
  createCaseNote,
  updateCaseNote,
  deleteCaseNote,
  type CaseNoteEntry,
} from '@/lib/actions/service-cases'
import { CASE_NOTE_KINDS, type CaseNoteKind } from '@/types/service-cases.types'

const fmtDateTime = (s: string) => {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('da-DK', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const KIND_LABEL: Record<string, string> = {
  system: 'System', general: 'Note', note: 'Note', warning: 'Advarsel',
}

export function OrderNotesTab({
  caseId,
  canAddNote = false,
  canManageAllNotes = false,
}: {
  caseId: string
  canAddNote?: boolean
  canManageAllNotes?: boolean
}) {
  const [notes, setNotes] = useState<CaseNoteEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Add-form
  const [content, setContent] = useState('')
  const [kind, setKind] = useState<CaseNoteKind>('note')
  const [saving, startSave] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  // Edit/delete row state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editKind, setEditKind] = useState<CaseNoteKind>('note')
  const [rowBusy, startRow] = useTransition()
  const [rowError, setRowError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCaseNotes(caseId).then((res) => {
      if (cancelled) return
      if (!res.success) { setError(res.error || 'Kunne ikke hente noter'); setNotes([]); return }
      setNotes(res.data ?? [])
    })
    return () => { cancelled = true }
  }, [caseId])

  const handleAdd = () => {
    const text = content.trim()
    if (!text || saving) return
    setFormError(null)
    startSave(async () => {
      const res = await createCaseNote({ caseId, content: text, kind })
      if (!res.success || !res.data) { setFormError(res.error || 'Kunne ikke gemme noten'); return }
      setNotes((prev) => [res.data!, ...(prev ?? [])])
      setContent(''); setKind('note')
    })
  }

  const startEdit = (n: CaseNoteEntry) => {
    setRowError(null)
    setEditingId(n.id)
    setEditContent(n.content)
    setEditKind(n.kind === 'warning' ? 'warning' : 'note')
  }

  const handleSaveEdit = (noteId: string) => {
    const text = editContent.trim()
    if (!text || rowBusy) return
    setRowError(null)
    startRow(async () => {
      const res = await updateCaseNote({ noteId, content: text, kind: editKind })
      if (!res.success || !res.data) { setRowError(res.error || 'Kunne ikke gemme'); return }
      setNotes((prev) => (prev ?? []).map((n) => (n.id === noteId ? res.data! : n)))
      setEditingId(null)
    })
  }

  const handleDelete = (noteId: string) => {
    if (rowBusy) return
    if (!window.confirm('Slet denne note? Handlingen kan ikke fortrydes.')) return
    setRowError(null)
    startRow(async () => {
      const res = await deleteCaseNote(noteId)
      if (!res.success) { setRowError(res.error || 'Kunne ikke slette'); return }
      setNotes((prev) => (prev ?? []).filter((n) => n.id !== noteId))
    })
  }

  const canManageNote = (n: CaseNoteEntry) => canManageAllNotes || n.is_mine

  return (
    <div className="space-y-4">
      {canAddNote && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 p-3 space-y-2">
          <textarea
            value={content} onChange={(e) => setContent(e.target.value)} rows={3} maxLength={4000}
            placeholder="Skriv en intern note til sagen…" disabled={saving}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          {formError && <div className="text-sm text-red-700">⚠ {formError}</div>}
          <div className="flex items-center justify-between gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as CaseNoteKind)} disabled={saving}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
              {CASE_NOTE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
            </select>
            <button type="button" onClick={handleAdd} disabled={saving || !content.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Tilføj note
            </button>
          </div>
        </div>
      )}

      {rowError && <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">{rowError}</div>}

      {notes === null ? (
        <div className="text-sm text-gray-500 py-6 text-center">Henter noter…</div>
      ) : error ? (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-12">
          <StickyNote className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <h3 className="text-base font-medium text-gray-700">Ingen noter endnu</h3>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Noter på sagen — fx når den oprettes fra et tilbud — vises her.
          </p>
        </div>
      ) : (
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
                  {canManageNote(n) && editingId !== n.id && (
                    <span className="ml-auto flex items-center gap-1">
                      <button onClick={() => startEdit(n)} disabled={rowBusy} title="Rediger"
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-50"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(n.id)} disabled={rowBusy} title="Slet"
                        className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </span>
                  )}
                </div>

                {editingId === n.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} maxLength={4000} disabled={rowBusy}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                    <div className="flex items-center gap-2">
                      <select value={editKind} onChange={(e) => setEditKind(e.target.value as CaseNoteKind)} disabled={rowBusy}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm">
                        {CASE_NOTE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
                      </select>
                      <button onClick={() => handleSaveEdit(n.id)} disabled={rowBusy || !editContent.trim()}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                        {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Gem
                      </button>
                      <button onClick={() => setEditingId(null)} disabled={rowBusy}
                        className="inline-flex items-center gap-1 rounded-md ring-1 ring-gray-300 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100">
                        <X className="w-3.5 h-3.5" /> Annullér
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{n.content}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
