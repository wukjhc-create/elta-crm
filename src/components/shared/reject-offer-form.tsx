'use client'

/**
 * Phase 12A — shared reject-form til public tilbudssider.
 *
 * Bruges af:
 *  - portal: src/components/modules/portal/reject-dialog.tsx (modal)
 *  - legacy: src/app/view-offer/[id]/offer-view-client.tsx (inline expand-form)
 *
 * Renderer dropdown med 5 reasons + valgfri textarea/navn/email. Submit
 * gates paa reason-valg (klient-UX). Server action validerer alligevel.
 */

import { useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import {
  REJECTION_REASON_CODES,
  REJECTION_REASON_LABELS,
  REJECTION_NOTE_MAX_LENGTH,
  type OfferRejectionInput,
  type RejectionReasonCode,
} from '@/types/offers.types'

interface Props {
  /** Kaldes med struktureret input naar bruger trykker submit. */
  onSubmit: (input: OfferRejectionInput) => void | Promise<void>
  onCancel: () => void
  isSubmitting?: boolean
  error?: string | null
  /** Pre-fyld signer-felter hvis vi kender kunden (portal-flow). */
  defaultSignerName?: string
  defaultSignerEmail?: string
  /** UI-variant — modal hopper labels ud, inline holder dem korte. */
  variant?: 'modal' | 'inline'
}

export function RejectOfferForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
  error = null,
  defaultSignerName = '',
  defaultSignerEmail = '',
  variant = 'modal',
}: Props) {
  const [reason, setReason] = useState<RejectionReasonCode | ''>('')
  const [note, setNote] = useState('')
  const [signerName, setSignerName] = useState(defaultSignerName)
  const [signerEmail, setSignerEmail] = useState(defaultSignerEmail)

  const canSubmit = reason !== '' && !isSubmitting

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({
      reason: reason as RejectionReasonCode,
      note: note.trim() || null,
      signerName: signerName.trim() || null,
      signerEmail: signerEmail.trim() || null,
    })
  }

  // Inline-varianten skal ikke have eksta intro-tekst (parent har det)
  const showIntro = variant === 'modal'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showIntro && (
        <p className="text-sm text-gray-600">
          Vælg en årsag og bekræft afvisningen. Du kan tilføje en bemærkning hvis du vil.
        </p>
      )}

      <div>
        <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-1">
          Årsag <span className="text-red-500">*</span>
        </label>
        <select
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as RejectionReasonCode | '')}
          disabled={isSubmitting}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-gray-50 text-sm bg-white"
        >
          <option value="" disabled>
            — Vælg årsag —
          </option>
          {REJECTION_REASON_CODES.map((code) => (
            <option key={code} value={code}>
              {REJECTION_REASON_LABELS[code]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="reject-note" className="block text-sm font-medium text-gray-700 mb-1">
          Bemærkning <span className="text-gray-400 font-normal">(valgfri)</span>
        </label>
        <textarea
          id="reject-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, REJECTION_NOTE_MAX_LENGTH))}
          rows={3}
          maxLength={REJECTION_NOTE_MAX_LENGTH}
          disabled={isSubmitting}
          placeholder="Fortæl os gerne hvorfor — hjælper os med at forbedre fremtidige tilbud."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 resize-none disabled:bg-gray-50 text-sm"
        />
        <p className="text-xs text-gray-400 mt-1 text-right">
          {note.length} / {REJECTION_NOTE_MAX_LENGTH}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="reject-name" className="block text-sm font-medium text-gray-700 mb-1">
            Dit navn <span className="text-gray-400 font-normal">(valgfri)</span>
          </label>
          <input
            id="reject-name"
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            disabled={isSubmitting}
            autoComplete="name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-gray-50 text-sm"
          />
        </div>
        <div>
          <label htmlFor="reject-email" className="block text-sm font-medium text-gray-700 mb-1">
            E-mail <span className="text-gray-400 font-normal">(valgfri)</span>
          </label>
          <input
            id="reject-email"
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            disabled={isSubmitting}
            autoComplete="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-gray-50 text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Annullér
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Sender...
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4" /> Afvis tilbud
            </>
          )}
        </button>
      </div>
    </form>
  )
}
