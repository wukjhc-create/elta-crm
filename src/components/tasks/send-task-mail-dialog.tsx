'use client'

/**
 * Sprint 8C-1 — Send Mail-dialog fra task.
 *
 * Erstatter mailto: fra Sprint 8B-1. Mail sendes via intern server action
 * `sendTaskEmail` (Microsoft Graph). Dialogens send-knap returnerer KUN
 * success når mail er accepteret af Graph; ellers vises Graph-fejlen
 * direkte i dialogen og mailen markeres ikke som sendt.
 *
 * Hvis Graph ikke er konfigureret (graphConfigured=false), vises advarsel
 * + et tydeligt mailto-fallback link så brugeren ikke står helt blank.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, Mail, X, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { sendTaskEmail } from '@/lib/actions/task-mail'
import type { CustomerTaskWithRelations } from '@/types/customer-tasks.types'

interface SendTaskMailDialogProps {
  task: CustomerTaskWithRelations
  graphConfigured: boolean
  onClose: () => void
  onSent?: () => void
}

const MAX_SUBJECT_LEN = 500
const MAX_BODY_LEN = 50_000

export function SendTaskMailDialog({
  task,
  graphConfigured,
  onClose,
  onSent,
}: SendTaskMailDialogProps) {
  const toast = useToast()
  const dialogRef = useRef<HTMLDivElement>(null)

  const initialTo = task.customer?.email?.trim() || ''
  const initialSubject = task.title
    ? `Vedr. opgave: ${task.title}`.substring(0, MAX_SUBJECT_LEN)
    : 'Vedr. opgave'

  const [to, setTo] = useState(initialTo)
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, sending])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  const handleSend = async () => {
    setError(null)

    const trimmedTo = to.trim()
    const trimmedSubject = subject.trim()
    const trimmedBody = body.trim()

    if (!trimmedTo) {
      setError('Indtast modtager-email')
      return
    }
    if (!trimmedSubject) {
      setError('Indtast emne')
      return
    }
    if (!trimmedBody) {
      setError('Skriv brødtekst')
      return
    }

    setSending(true)
    try {
      const result = await sendTaskEmail({
        task_id: task.id,
        to: trimmedTo,
        cc: cc.trim() || undefined,
        subject: trimmedSubject,
        body: trimmedBody,
      })

      if (!result.success) {
        setError(result.error || 'Mail kunne ikke sendes')
        return
      }

      toast.success('Mail sendt', `Sendt til ${trimmedTo}`)
      onSent?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uventet fejl')
    } finally {
      setSending(false)
    }
  }

  const mailtoFallbackHref = (() => {
    const t = encodeURIComponent(to.trim())
    const s = encodeURIComponent(subject.trim())
    const b = encodeURIComponent(body.trim())
    const ccPart = cc.trim() ? `&cc=${encodeURIComponent(cc.trim())}` : ''
    return `mailto:${t}?subject=${s}&body=${b}${ccPart}`
  })()

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-task-mail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose()
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col outline-none"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            <h2 id="send-task-mail-title" className="text-lg font-semibold text-gray-900">
              Send mail om opgave
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Luk dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {!graphConfigured && (
            <div className="flex items-start gap-2 p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Intern mailafsendelse er ikke konfigureret.</p>
                <p className="mt-1">
                  Brug fallback-knappen nederst for at sende via dit lokale mailprogram.
                  Bemærk: mails sendt via fallback gemmes IKKE i CRM.
                </p>
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
            <span className="font-medium">Opgave:</span> {task.title}
            {task.customer && (
              <>
                {' · '}
                <span className="font-medium">Kunde:</span> {task.customer.company_name}
              </>
            )}
          </div>

          <div>
            <label htmlFor="task-mail-to" className="block text-sm font-medium text-gray-700 mb-1">
              Til <span className="text-red-500">*</span>
            </label>
            <input
              id="task-mail-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={sending}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="kunde@example.dk"
              autoComplete="off"
            />
            {initialTo &&
              to.trim().toLowerCase() !== initialTo.trim().toLowerCase() && (
                <p className="mt-1 text-xs text-amber-700">
                  Bemærk: Modtager-adressen er ændret fra kundens registrerede email ({initialTo}).
                </p>
              )}
          </div>

          {showCc ? (
            <div>
              <label htmlFor="task-mail-cc" className="block text-sm font-medium text-gray-700 mb-1">
                Cc
              </label>
              <input
                id="task-mail-cc"
                type="email"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                disabled={sending}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                placeholder="cc@example.dk"
                autoComplete="off"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              disabled={sending}
              className="text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              + Tilføj Cc
            </button>
          )}

          <div>
            <label htmlFor="task-mail-subject" className="block text-sm font-medium text-gray-700 mb-1">
              Emne <span className="text-red-500">*</span>
            </label>
            <input
              id="task-mail-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value.substring(0, MAX_SUBJECT_LEN))}
              disabled={sending}
              maxLength={MAX_SUBJECT_LEN}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label htmlFor="task-mail-body" className="block text-sm font-medium text-gray-700 mb-1">
              Brødtekst <span className="text-red-500">*</span>
            </label>
            <textarea
              id="task-mail-body"
              value={body}
              onChange={(e) => setBody(e.target.value.substring(0, MAX_BODY_LEN))}
              disabled={sending}
              maxLength={MAX_BODY_LEN}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="Skriv din besked her..."
            />
            <p className="mt-1 text-xs text-gray-400">
              Din signatur tilføjes automatisk når mailen sendes.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-between gap-3 bg-gray-50">
          <div>
            {!graphConfigured && (
              <a
                href={mailtoFallbackHref}
                className="text-xs text-amber-700 hover:underline"
                onClick={() => onClose()}
              >
                Åbn i lokalt mailprogram (gemmes ikke i CRM)
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
            >
              Annuller
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !graphConfigured}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sender...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Send mail
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
