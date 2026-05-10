'use client'

/**
 * Sprint 8E-3 Phase 1 — AI mail-assistant panel.
 *
 * Bruger AI til at FORESLÅ/RETTE tekst i en kladde. Sender ALDRIG selv —
 * 'Send svar'-knappen kalder onSend(text) og lader parent håndtere det
 * via eksisterende sendQuickReply-flow.
 */

import { useState } from 'react'
import { Sparkles, Pencil, FileText, Scissors, Loader2, Send, AlertCircle } from 'lucide-react'
import {
  suggestReplyToEmail,
  proofreadText,
  makeProfessional,
  makeShorter,
  type AiTextResult,
} from '@/lib/actions/ai-mail-assistant'

type AiAction = 'suggest' | 'proofread' | 'professional' | 'shorter'

interface AIMailAssistantPanelProps {
  emailId: string
  /** Initial draft (kan være tom). Når brugeren har skrevet noget,
   *  bruger AI-knapperne den nuværende textarea-værdi som input. */
  initialDraft?: string
  /** Kaldes når brugeren klikker Send. Returnerer succes/fejl. */
  onSend: (text: string) => Promise<{ success: boolean; error?: string }>
  /** Vises som info-tekst under panelet (fx 'Bekræft modtagelse' o.l.). */
  helperText?: string
}

export function AIMailAssistantPanel({
  emailId,
  initialDraft = '',
  onSend,
  helperText,
}: AIMailAssistantPanelProps) {
  const [draft, setDraft] = useState(initialDraft)
  const [busy, setBusy] = useState<AiAction | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [placeholders, setPlaceholders] = useState<string[]>([])

  const handleAi = async (action: AiAction) => {
    setBusy(action)
    setError(null)
    setSendStatus('idle')
    setPlaceholders([])

    let result: AiTextResult
    try {
      if (action === 'suggest') {
        result = await suggestReplyToEmail(emailId)
      } else {
        if (!draft.trim()) {
          setError('Skriv først noget tekst — så kan AI rette/forbedre den.')
          setBusy(null)
          return
        }
        if (action === 'proofread') result = await proofreadText(draft)
        else if (action === 'professional') result = await makeProfessional(draft)
        else result = await makeShorter(draft)
      }
    } catch {
      setError('Uventet fejl — prøv igen.')
      setBusy(null)
      return
    }

    if (!result.ok || !result.text) {
      setError(result.error || 'AI ikke tilgængelig — skriv selv.')
    } else {
      setDraft(result.text)
      if (result.placeholders && result.placeholders.length > 0) {
        setPlaceholders(result.placeholders)
      }
    }
    setBusy(null)
  }

  const handleSend = async () => {
    if (!draft.trim()) {
      setError('Skriv et svar før du sender.')
      return
    }
    setBusy('send')
    setError(null)
    setSendStatus('idle')

    try {
      const res = await onSend(draft)
      if (res.success) {
        setSendStatus('success')
        setDraft('')
        setPlaceholders([])
      } else {
        setSendStatus('error')
        setError(res.error || 'Kunne ikke sende.')
      }
    } catch (err) {
      setSendStatus('error')
      setError(err instanceof Error ? err.message : 'Kunne ikke sende.')
    } finally {
      setBusy(null)
    }
  }

  const aiButtonClass =
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          AI-assistent
        </p>
        {helperText && <span className="text-[11px] text-gray-400">{helperText}</span>}
      </div>

      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          if (sendStatus !== 'idle') setSendStatus('idle')
          if (error) setError(null)
        }}
        placeholder="Skriv et svar her — eller klik 'Foreslå svar' for at lade AI starte kladden."
        rows={6}
        className="w-full text-sm border rounded-md p-2.5 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 resize-y min-h-[120px]"
        disabled={busy === 'send'}
      />

      {/* AI-knaprække */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleAi('suggest')}
          disabled={busy !== null}
          className={`${aiButtonClass} bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100`}
          title="AI læser indkommende mail + kunde-kontekst og foreslår dansk svarforslag"
        >
          {busy === 'suggest' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Foreslå svar
        </button>
        <button
          type="button"
          onClick={() => handleAi('proofread')}
          disabled={busy !== null || !draft.trim()}
          className={`${aiButtonClass} bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300`}
          title="Ret stavefejl, komma og grammatik"
        >
          {busy === 'proofread' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
          Ret tekst
        </button>
        <button
          type="button"
          onClick={() => handleAi('professional')}
          disabled={busy !== null || !draft.trim()}
          className={`${aiButtonClass} bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300`}
          title="Gør teksten mere formel og professionel"
        >
          {busy === 'professional' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
          Gør professionel
        </button>
        <button
          type="button"
          onClick={() => handleAi('shorter')}
          disabled={busy !== null || !draft.trim()}
          className={`${aiButtonClass} bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300`}
          title="Forkort teksten — bevar alle vigtige fakta"
        >
          {busy === 'shorter' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />}
          Gør kortere
        </button>

        <div className="ml-auto">
          <button
            type="button"
            onClick={handleSend}
            disabled={busy !== null || !draft.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send svar
          </button>
        </div>
      </div>

      {/* Placeholder-warning hvis AI har sat [BRUGER UDFYLDER] markører */}
      {placeholders.length > 0 && (
        <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded p-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-800 font-medium">AI mangler info — udfyld pladsholdere før Send:</p>
            <p className="text-amber-700 mt-0.5 font-mono text-[11px]">{placeholders.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* Fejl */}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}

      {/* Send-status */}
      {sendStatus === 'success' && (
        <p className="text-xs text-green-700 font-medium">Svar sendt ✓</p>
      )}
    </div>
  )
}
