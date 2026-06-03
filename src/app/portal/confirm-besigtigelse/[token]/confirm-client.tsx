'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Download,
  ExternalLink,
  Loader2,
  Ban,
  ShieldAlert,
} from 'lucide-react'
import { submitConfirmation } from '@/lib/actions/document-confirmations'
import type { PublicConfirmationContext } from '@/types/document-confirmations.types'

interface Props {
  context: PublicConfirmationContext
  token: string
}

export function ConfirmClient({ context, token }: Props) {
  const [signerName, setSignerName] = useState(context.recipientName || '')
  const [signerEmail, setSignerEmail] = useState(context.recipientEmail || '')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)

  // Lokal succes-tilstand — fortrinsret over server-state 'awaiting' efter
  // klient har faaet bekraeftet via submit. Server returnerer ikke ny
  // context efter submit, vi viser bare kvittering inline.
  const justConfirmed = confirmedAt !== null

  // Render state-baseret. Lokal 'justConfirmed' har forrang over awaiting.
  const effectiveState = justConfirmed ? 'already_confirmed' : context.state

  return (
    <div className="max-w-2xl mx-auto">
      {effectiveState === 'awaiting' && (
        <AwaitingView
          context={context}
          signerName={signerName}
          setSignerName={setSignerName}
          signerEmail={signerEmail}
          setSignerEmail={setSignerEmail}
          note={note}
          setNote={setNote}
          isSubmitting={isSubmitting}
          submitError={submitError}
          onSubmit={async () => {
            setSubmitError(null)
            if (!signerName.trim()) {
              setSubmitError('Indtast dit navn')
              return
            }
            const emailTrimmed = signerEmail.trim()
            if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
              setSubmitError('Indtast en gyldig e-mail')
              return
            }
            setIsSubmitting(true)
            try {
              const result = await submitConfirmation({
                token,
                signerName: signerName.trim(),
                signerEmail: emailTrimmed,
                note: note.trim() || null,
              })
              if (result.success && result.data) {
                setConfirmedAt(result.data.confirmedAt)
              } else {
                setSubmitError(result.error || 'Bekræftelsen kunne ikke registreres')
              }
            } catch {
              setSubmitError('Der opstod en uventet fejl. Prøv igen.')
            } finally {
              setIsSubmitting(false)
            }
          }}
        />
      )}

      {effectiveState === 'already_confirmed' && (
        <AlreadyConfirmedView
          context={context}
          justConfirmedAt={confirmedAt}
          signerNameIfJust={justConfirmed ? signerName.trim() : null}
          signerEmailIfJust={justConfirmed ? signerEmail.trim() : null}
        />
      )}

      {effectiveState === 'expired' && <ExpiredView />}
      {effectiveState === 'revoked' && <RevokedView />}
      {effectiveState === 'invalid' && <InvalidView />}
    </div>
  )
}

// =====================================================
// Awaiting (formular)
// =====================================================
function AwaitingView({
  context,
  signerName,
  setSignerName,
  signerEmail,
  setSignerEmail,
  note,
  setNote,
  isSubmitting,
  submitError,
  onSubmit,
}: {
  context: PublicConfirmationContext
  signerName: string
  setSignerName: (v: string) => void
  signerEmail: string
  setSignerEmail: (v: string) => void
  note: string
  setNote: (v: string) => void
  isSubmitting: boolean
  submitError: string | null
  onSubmit: () => void
}) {
  const expiresLabel = formatDateLong(context.expiresAt)
  return (
    <div className="space-y-4">
      {/* Dokumentkort */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 shrink-0 bg-green-100 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-green-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-gray-900">{context.documentTitle}</h1>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{context.documentFileName}</p>
          </div>
        </div>

        <dl className="space-y-2 text-sm border-t pt-4">
          <RowKV label="Rolle" value={context.recipientRoleLabel} />
          {context.serviceCase?.caseNumber && (
            <RowKV
              label="Sag"
              value={`${context.serviceCase.caseNumber}${
                context.serviceCase.title ? ` — ${context.serviceCase.title}` : ''
              }`}
            />
          )}
          <RowKV label="Sendt til" value={context.recipientEmail} />
          {expiresLabel && (
            <RowKV
              label="Linket udløber"
              value={expiresLabel}
              valueClass="text-amber-700"
            />
          )}
        </dl>

        {context.pdfUrl && (
          <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t">
            <a
              href={context.pdfUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 text-sm font-medium active:scale-95 transition-transform"
            >
              <ExternalLink className="w-4 h-4" /> Åbn PDF
            </a>
            <a
              href={context.pdfUrl}
              download={context.documentFileName}
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 text-sm font-medium active:scale-95 transition-transform"
            >
              <Download className="w-4 h-4" /> Download PDF
            </a>
          </div>
        )}
      </div>

      {/* Formular */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Bekræft rapport</h2>
        <p className="text-sm text-gray-500 mb-5">
          Ved at bekræfte godkender du, at du har gennemgået ovenstående besigtigelsesrapport.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="space-y-4"
        >
          <Field label="Dit navn" required>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              required
              disabled={isSubmitting}
              autoComplete="name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none text-sm disabled:bg-gray-50"
            />
          </Field>

          <Field label="Din e-mail" required>
            <input
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              required
              disabled={isSubmitting}
              autoComplete="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none text-sm disabled:bg-gray-50"
            />
          </Field>

          <Field label="Bemærkning (valgfri)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={isSubmitting}
              placeholder="Evt. note til Elta Solar"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none text-sm disabled:bg-gray-50 resize-none"
            />
          </Field>

          {submitError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 active:scale-[0.98] transition-transform font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Sender...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> Bekræft rapport
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Vi logger tidspunkt og IP-adresse som bekræftelses-dokumentation.
          </p>
        </form>
      </div>
    </div>
  )
}

// =====================================================
// Already confirmed (kvittering / read-only)
// =====================================================
function AlreadyConfirmedView({
  context,
  justConfirmedAt,
  signerNameIfJust,
  signerEmailIfJust,
}: {
  context: PublicConfirmationContext
  justConfirmedAt: string | null
  signerNameIfJust: string | null
  signerEmailIfJust: string | null
}) {
  const confirmedAt = justConfirmedAt ?? context.confirmedAt ?? null
  const name = signerNameIfJust ?? context.confirmedByName ?? null
  const email = signerEmailIfJust ?? context.confirmedByEmail ?? null

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 bg-green-100 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-gray-900">Rapporten er bekræftet</h1>
            {confirmedAt && (
              <p className="text-sm text-gray-600 mt-1">
                Bekræftet {formatDateTimeLong(confirmedAt)}
              </p>
            )}
            {name && (
              <p className="text-sm text-gray-600 mt-0.5">
                af <span className="font-medium">{name}</span>
                {email && <span className="text-gray-400"> ({email})</span>}
              </p>
            )}
          </div>
        </div>

        {context.documentTitle && (
          <div className="mt-5 pt-4 border-t">
            <dl className="space-y-2 text-sm">
              <RowKV label="Dokument" value={context.documentTitle} />
              {context.serviceCase?.caseNumber && (
                <RowKV
                  label="Sag"
                  value={`${context.serviceCase.caseNumber}${
                    context.serviceCase.title ? ` — ${context.serviceCase.title}` : ''
                  }`}
                />
              )}
              {context.recipientRoleLabel && (
                <RowKV label="Rolle" value={context.recipientRoleLabel} />
              )}
              {context.confirmationNote && (
                <div>
                  <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-3 mb-1">
                    Bemærkning
                  </dt>
                  <dd className="text-sm text-gray-700 whitespace-pre-wrap">
                    {context.confirmationNote}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {context.pdfUrl && (
          <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t">
            <a
              href={context.pdfUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              <ExternalLink className="w-4 h-4" /> Åbn PDF
            </a>
            <a
              href={context.pdfUrl}
              download={context.documentFileName}
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              <Download className="w-4 h-4" /> Download PDF
            </a>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-6 text-center">
          Du kan lukke denne side. Bekræftelsen er registreret hos Elta Solar.
        </p>
      </div>
    </div>
  )
}

// =====================================================
// Expired
// =====================================================
function ExpiredView() {
  return (
    <StatusCard
      icon={<Clock className="w-6 h-6 text-amber-600" />}
      iconBg="bg-amber-100"
      title="Linket er udløbet"
      message="Bekræftelseslinket er ikke længere gyldigt. Kontakt Elta Solar, hvis du har brug for at få sendt en ny rapport."
    />
  )
}

// =====================================================
// Revoked
// =====================================================
function RevokedView() {
  return (
    <StatusCard
      icon={<Ban className="w-6 h-6 text-gray-600" />}
      iconBg="bg-gray-100"
      title="Bekræftelsen er trukket tilbage"
      message="Denne bekræftelses-anmodning er annulleret. Kontakt Elta Solar for at få nærmere oplysninger."
    />
  )
}

// =====================================================
// Invalid
// =====================================================
function InvalidView() {
  return (
    <StatusCard
      icon={<ShieldAlert className="w-6 h-6 text-red-600" />}
      iconBg="bg-red-100"
      title="Linket er ugyldigt"
      message="Linket er ugyldigt eller ikke længere aktivt. Kontakt Elta Solar, hvis du har modtaget linket og forventede at kunne bruge det."
    />
  )
}

// =====================================================
// Smaa byggeklodser
// =====================================================
function StatusCard({
  icon,
  iconBg,
  title,
  message,
}: {
  icon: React.ReactNode
  iconBg: string
  title: string
  message: string
}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-6">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-600 mt-1">{message}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-6 text-center">
        Du kan kontakte Elta Solar på{' '}
        <a href="mailto:info@eltasolar.dk" className="text-green-700 hover:underline">
          info@eltasolar.dk
        </a>
        .
      </p>
    </div>
  )
}

function RowKV({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0 w-28">
        {label}
      </dt>
      <dd className={`text-sm text-gray-800 ${valueClass ?? ''}`}>{value}</dd>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
    </label>
  )
}

// =====================================================
// Date formatters (samme stil som resten af appen)
// =====================================================
function formatDateLong(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('da-DK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatDateTimeLong(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('da-DK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
