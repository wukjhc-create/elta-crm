'use client'

/**
 * C1a — diskret klassifikationsboks (kun admin, kun med CLASSIFICATION_FEEDBACK_ENABLED). Lukket som standard; henter
 * først klassifikationen når admin åbner den. Viser den deterministiske C1-klassifikation (afsendertype, henvendelsestype,
 * sagsreference, foreslået handling, begrundelse og regler) og indsamler en vurdering. Påvirker ALDRIG mailflowet.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, FlaskConical } from 'lucide-react'
import {
  getEmailClassificationAction,
  submitClassificationFeedbackAction,
  type EmailClassificationView,
} from '@/lib/actions/classification-feedback'
import {
  CASE_REFERENCES, CASE_REFERENCE_LABELS, INQUIRY_TYPES, INQUIRY_TYPE_LABELS, PROPOSED_ACTIONS, PROPOSED_ACTION_LABELS,
  SENDER_TYPES, SENDER_TYPE_LABELS,
} from '@/lib/classification/inquiry-classifier'
import { FEEDBACK_NOTE_MAX, FEEDBACK_VERDICTS, FEEDBACK_VERDICT_LABELS, type FeedbackVerdict } from '@/lib/classification/feedback'

type Dim = 'senderType' | 'inquiryType' | 'caseReference' | 'proposedAction'
const DIMS: Array<{ key: Dim; label: string; values: readonly string[]; labels: Record<string, string> }> = [
  { key: 'senderType', label: 'Afsendertype', values: SENDER_TYPES, labels: SENDER_TYPE_LABELS },
  { key: 'inquiryType', label: 'Henvendelsestype', values: INQUIRY_TYPES, labels: INQUIRY_TYPE_LABELS },
  { key: 'caseReference', label: 'Sagsreference', values: CASE_REFERENCES, labels: CASE_REFERENCE_LABELS },
  { key: 'proposedAction', label: 'Foreslået handling', values: PROPOSED_ACTIONS, labels: PROPOSED_ACTION_LABELS },
]

export function ClassificationFeedbackPanel({ emailId }: { emailId: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<EmailClassificationView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<FeedbackVerdict | null>(null)
  const [corrected, setCorrected] = useState<Partial<Record<Dim, string>>>({})
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !view) {
      setBusy(true)
      const r = await getEmailClassificationAction(emailId)
      setBusy(false)
      if (r.success) { setView(r.data); setError(null) } else setError(r.error)
    }
  }

  async function save() {
    if (!verdict || !view) return
    setBusy(true)
    const r = await submitClassificationFeedbackAction({ emailId, verdict, corrected: verdict === 'partial' || verdict === 'wrong' ? corrected : {}, note })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setError(null); setSaved(true)
  }

  const c = view?.classification
  const needsCorrection = verdict === 'partial' || verdict === 'wrong'

  return (
    <div className="mb-3 rounded border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-700" data-testid="classification-feedback">
      <button type="button" onClick={() => void toggle()} className="flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-gray-100" data-testid="classification-feedback-toggle">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <FlaskConical className="h-3 w-3" />
        <span>Klassifikation (test — påvirker intet)</span>
        {c && <span className="ml-1 text-gray-500">· {SENDER_TYPE_LABELS[c.senderType]} · {INQUIRY_TYPE_LABELS[c.inquiryType]}</span>}
      </button>
      {open && (
        <div className="space-y-2 border-t border-gray-200 px-2 py-2">
          {busy && !view && <p>Beregner …</p>}
          {error && <p className="text-red-700" data-testid="classification-feedback-error">{error}</p>}
          {c && view && (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-testid="classification-values">
                {DIMS.map((d) => (
                  <div key={d.key} className="contents">
                    <dt className="text-gray-500">{d.label}</dt>
                    <dd data-testid={`classification-${d.key}`} data-value={c[d.key]}>{d.labels[c[d.key]]}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <p className="text-gray-500">Begrundelse</p>
                <ul className="list-disc pl-4">{view.explanation.map((l, i) => <li key={i}>{l}</li>)}</ul>
              </div>
              <p className="text-gray-500">Regler: <span className="font-mono">{c.rules.map((r) => `${r.dimension}:${r.rule}`).join(', ')}</span> · {c.version}</p>
              {view.previous.length > 0 && (
                <p className="text-gray-500" data-testid="classification-previous">Tidligere vurderinger: {view.previous.map((p) => `${FEEDBACK_VERDICT_LABELS[p.verdict] ?? p.verdict}${p.mine ? ' (dig)' : ''}`).join(', ')}</p>
              )}
              {saved ? (
                <p className="text-emerald-700" data-testid="classification-feedback-saved">Tak — vurderingen er gemt (påvirker ikke mailen).</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {FEEDBACK_VERDICTS.map((v) => (
                      <button key={v} type="button" onClick={() => setVerdict(v)} data-testid={`classification-verdict-${v}`}
                        className={`rounded border px-2 py-0.5 ${verdict === v ? 'border-gray-700 bg-white font-medium' : 'border-gray-300 hover:bg-white'}`}>
                        {FEEDBACK_VERDICT_LABELS[v]}
                      </button>
                    ))}
                  </div>
                  {needsCorrection && (
                    <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
                      {DIMS.map((d) => (
                        <label key={d.key} className="contents">
                          <span className="text-gray-500">Korrekt {d.label.toLowerCase()}</span>
                          <select value={corrected[d.key] ?? c[d.key]} data-testid={`classification-correct-${d.key}`}
                            onChange={(e) => setCorrected((x) => ({ ...x, [d.key]: e.target.value }))} className="rounded border px-1 py-0.5">
                            {d.values.map((val) => <option key={val} value={val}>{d.labels[val]}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                  {verdict && (
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={FEEDBACK_NOTE_MAX} placeholder="Kort note (valgfri — ingen persondata)"
                      className="w-full rounded border px-2 py-0.5" data-testid="classification-feedback-note" />
                  )}
                  <button type="button" disabled={!verdict || busy} onClick={() => void save()} data-testid="classification-feedback-save"
                    className="rounded bg-gray-800 px-2 py-0.5 font-medium text-white disabled:opacity-40">Gem vurdering</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
