'use client'

/**
 * Sprint 8E-3 Phase 1+2 — AI mail-assistant panel.
 *
 * Phase 1 (godkendt): Foreslå svar, Ret tekst, Gør professionel, Gør kortere.
 * Phase 2: Lav udkast (instruction-baseret), Gør venligere, Oversæt da/en.
 *
 * Bruger AI til at FORESLÅ/RETTE tekst i en kladde. Sender ALDRIG selv —
 * 'Send svar'-knappen kalder onSend(text) og lader parent håndtere det
 * via eksisterende sendQuickReply-flow.
 */

import { useState } from 'react'
import {
  Sparkles,
  Pencil,
  FileText,
  Scissors,
  Loader2,
  Send,
  AlertCircle,
  Heart,
  Languages,
  Wand2,
} from 'lucide-react'
import {
  suggestReplyToEmail,
  proofreadText,
  makeProfessional,
  makeShorter,
  generateDraftFromInstruction,
  translateText,
  makeFriendlier,
  type AiTextResult,
  type SupportedLang,
} from '@/lib/actions/ai-mail-assistant'
import { AttachmentPicker, type PickerAttachment } from '@/components/mail/attachment-picker'

type AiAction =
  | 'suggest'
  | 'proofread'
  | 'professional'
  | 'shorter'
  | 'friendlier'
  | 'translate-da'
  | 'translate-en'
  | 'instruct'

interface AIMailAssistantPanelProps {
  emailId: string
  /** Initial draft (kan være tom). Når brugeren har skrevet noget,
   *  bruger AI-knapperne den nuværende textarea-værdi som input. */
  initialDraft?: string
  /** Sprint 8F: customer_id på mailen — nødvendig for AttachmentPicker. */
  customerId?: string | null
  /** Sprint 8F: service_case_id hvis mailen er knyttet til en sag. */
  serviceCaseId?: string | null
  /** Kaldes når brugeren klikker Send. Returnerer succes/fejl.
   *  attachmentIds er customer_documents-IDs fra AttachmentPicker. */
  onSend: (
    text: string,
    attachmentIds?: string[]
  ) => Promise<{ success: boolean; error?: string }>
  /** Vises som info-tekst under panelet (fx 'Bekræft modtagelse' o.l.). */
  helperText?: string
}

export function AIMailAssistantPanel({
  emailId,
  initialDraft = '',
  customerId = null,
  serviceCaseId = null,
  onSend,
  helperText,
}: AIMailAssistantPanelProps) {
  const [draft, setDraft] = useState(initialDraft)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState<AiAction | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [placeholders, setPlaceholders] = useState<string[]>([])
  const [attachments, setAttachments] = useState<PickerAttachment[]>([])

  const requireDraft = (): boolean => {
    if (!draft.trim()) {
      setError('Skriv først noget tekst — så kan AI rette/forbedre den.')
      setBusy(null)
      return false
    }
    return true
  }

  const handleAi = async (action: AiAction) => {
    setBusy(action)
    setError(null)
    setSendStatus('idle')
    setPlaceholders([])

    let result: AiTextResult
    try {
      switch (action) {
        case 'suggest':
          result = await suggestReplyToEmail(emailId)
          break
        case 'instruct':
          if (!instruction.trim()) {
            setError('Skriv en instruktion først (fx: "Bed kunden sende billeder af tavlen").')
            setBusy(null)
            return
          }
          result = await generateDraftFromInstruction(emailId, instruction.trim())
          break
        case 'proofread':
          if (!requireDraft()) return
          result = await proofreadText(draft)
          break
        case 'professional':
          if (!requireDraft()) return
          result = await makeProfessional(draft)
          break
        case 'shorter':
          if (!requireDraft()) return
          result = await makeShorter(draft)
          break
        case 'friendlier':
          if (!requireDraft()) return
          result = await makeFriendlier(draft)
          break
        case 'translate-da':
          if (!requireDraft()) return
          result = await translateText(draft, 'da' as SupportedLang)
          break
        case 'translate-en':
          if (!requireDraft()) return
          result = await translateText(draft, 'en' as SupportedLang)
          break
        default:
          result = { ok: false, text: null, error: 'Ukendt handling' }
      }
    } catch {
      // Fejl må ikke slette brugerens tekst
      setError('Uventet fejl — prøv igen.')
      setBusy(null)
      return
    }

    if (!result.ok || !result.text) {
      // Bevar eksisterende draft ved fejl
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
      const ids = attachments.map((a) => a.document_id)
      const res = await onSend(draft, ids.length > 0 ? ids : undefined)
      if (res.success) {
        setSendStatus('success')
        setDraft('')
        setInstruction('')
        setPlaceholders([])
        setAttachments([]) // Lokal liste ryddes — filerne ligger nu på customer/sag
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

  const isAnyBusy = busy !== null

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

      {/* Phase 2: Instruction-baseret udkast */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Skriv fx: Bed kunden sende billeder af tavlen"
          maxLength={1000}
          className="flex-1 text-xs border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          disabled={isAnyBusy}
        />
        <button
          type="button"
          onClick={() => handleAi('instruct')}
          disabled={isAnyBusy || !instruction.trim()}
          className={`${aiButtonClass} bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100`}
          title="AI laver et udkast baseret på din instruktion + mail-kontekst"
        >
          {busy === 'instruct' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          Lav udkast
        </button>
      </div>

      {/* Sprint 8F: Vedhæftninger — picker virker kun når mailen er
          koblet til en kunde. Filerne uploades FØR Send. */}
      <AttachmentPicker
        customerId={customerId}
        serviceCaseId={serviceCaseId}
        disabled={busy !== null}
        attachments={attachments}
        onChange={setAttachments}
      />

      {/* AI-knaprække: forslag + tekstværktøjer */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleAi('suggest')}
          disabled={isAnyBusy}
          className={`${aiButtonClass} bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100`}
          title="AI læser indkommende mail + kunde-kontekst og foreslår dansk svarforslag"
        >
          {busy === 'suggest' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Foreslå svar
        </button>
        <button
          type="button"
          onClick={() => handleAi('proofread')}
          disabled={isAnyBusy || !draft.trim()}
          className={`${aiButtonClass} bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300`}
          title="Ret stavefejl, komma og grammatik"
        >
          {busy === 'proofread' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
          Ret tekst
        </button>
        <button
          type="button"
          onClick={() => handleAi('professional')}
          disabled={isAnyBusy || !draft.trim()}
          className={`${aiButtonClass} bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300`}
          title="Gør teksten mere formel og professionel"
        >
          {busy === 'professional' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
          Gør professionel
        </button>
        <button
          type="button"
          onClick={() => handleAi('shorter')}
          disabled={isAnyBusy || !draft.trim()}
          className={`${aiButtonClass} bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300`}
          title="Forkort teksten — bevar alle vigtige fakta"
        >
          {busy === 'shorter' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />}
          Gør kortere
        </button>
        <button
          type="button"
          onClick={() => handleAi('friendlier')}
          disabled={isAnyBusy || !draft.trim()}
          className={`${aiButtonClass} bg-pink-50 text-pink-800 border-pink-200 hover:bg-pink-100`}
          title="Gør teksten venligere og mere kundevenlig"
        >
          {busy === 'friendlier' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Heart className="w-3 h-3" />}
          Gør venligere
        </button>
        <button
          type="button"
          onClick={() => handleAi('translate-da')}
          disabled={isAnyBusy || !draft.trim()}
          className={`${aiButtonClass} bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100`}
          title="Oversæt teksten til dansk"
        >
          {busy === 'translate-da' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
          Oversæt til dansk
        </button>
        <button
          type="button"
          onClick={() => handleAi('translate-en')}
          disabled={isAnyBusy || !draft.trim()}
          className={`${aiButtonClass} bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100`}
          title="Oversæt teksten til engelsk"
        >
          {busy === 'translate-en' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
          Oversæt til engelsk
        </button>

        <div className="ml-auto">
          <button
            type="button"
            onClick={handleSend}
            disabled={isAnyBusy || !draft.trim()}
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
