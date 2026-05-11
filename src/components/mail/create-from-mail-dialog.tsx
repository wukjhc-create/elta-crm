'use client'

/**
 * Sprint 8H polish — "Opret kunde fra mail" med 3 valg.
 *
 * Henrik skal kunne skelne mellem:
 * - Afsenderen (typisk firmaet der skriver, fx Fasetech)
 * - Personen/adressen i mailens brødtekst (typisk slutkunden)
 *
 * Modal viser begge datakilder side om side og lader Henrik vælge:
 *   A. Opret afsender som betalende kunde
 *   B. Opret fundet person/adresse som ny kunde
 *   C. Opret afsender som betaler OG fundet person som site contact
 *      på en ny sag.
 *
 * Smart default:
 * - Hvis afsenderens domæne IKKE er freemail (gmail/hotmail/...) OG
 *   body indeholder en navn/adresse → C
 * - Hvis kun afsender-data findes → A
 * - Hvis kun body-data findes → B
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, X, UserPlus, Building2, MapPin, AlertCircle, Sparkles } from 'lucide-react'
import {
  createCustomerAndCaseFromEmail,
  type CreateFromEmailMode,
} from '@/lib/actions/create-from-email'
import {
  parseCustomerFromEmail,
  type ParsedCustomerData,
} from '@/lib/utils/email-parser'

const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'live.dk', 'msn.com',
  'yahoo.com', 'yahoo.dk',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'mail.dk', 'jubii.dk', 'ofir.dk', 'stofanet.dk',
])

function isFreemail(email: string | null | undefined): boolean {
  if (!email) return true
  const domain = email.toLowerCase().split('@')[1]
  return !domain || FREEMAIL_DOMAINS.has(domain)
}

interface MailLike {
  id: string
  sender_email: string
  sender_name?: string | null
  body_text?: string | null
  body_html?: string | null
}

interface CreateFromMailDialogProps {
  email: MailLike
  onClose: () => void
  onSuccess: (result: {
    customerId: string
    siteContactId?: string
    serviceCaseId?: string
    payerExisted: boolean
  }) => void
}

export function CreateFromMailDialog({ email, onClose, onSuccess }: CreateFromMailDialogProps) {
  const parsed: ParsedCustomerData = useMemo(
    () => parseCustomerFromEmail(email.body_text || null, email.body_html || null, email.sender_email),
    [email.body_text, email.body_html, email.sender_email]
  )

  const senderEmail = email.sender_email || ''
  const senderName = email.sender_name || senderEmail.split('@')[0] || ''
  const senderIsFirm = !isFreemail(senderEmail)
  const hasBodyData = !!(parsed.name || parsed.address || parsed.phone || parsed.email)

  // Smart default
  const defaultMode: CreateFromEmailMode = useMemo(() => {
    if (senderIsFirm && hasBodyData) return 'payer_plus_site'
    if (!hasBodyData) return 'payer_only'
    if (senderIsFirm) return 'payer_plus_site'
    return 'body_only'
  }, [senderIsFirm, hasBodyData])

  const [mode, setMode] = useState<CreateFromEmailMode>(defaultMode)

  // Payer fields (sektion 1)
  const [payerCompany, setPayerCompany] = useState(senderName)
  const [payerContact, setPayerContact] = useState(senderName)
  const [payerEmail, setPayerEmail] = useState(senderEmail)
  const [payerPhone, setPayerPhone] = useState('')

  // Body fields (sektion 2)
  const [bodyName, setBodyName] = useState(parsed.name || parsed.contactPerson || '')
  const [bodyEmail, setBodyEmail] = useState(parsed.email || '')
  const [bodyPhone, setBodyPhone] = useState(parsed.phone || '')
  const [bodyAddress, setBodyAddress] = useState(parsed.address || '')
  const [bodyPostal, setBodyPostal] = useState(parsed.postalCode || '')
  const [bodyCity, setBodyCity] = useState(parsed.city || '')

  // Body-only mode bruger body-felter som kunde
  const [bodyOnlyEmail, setBodyOnlyEmail] = useState(parsed.email || '')

  const [createCase, setCreateCase] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await createCustomerAndCaseFromEmail({
        emailId: email.id,
        mode,
        payer:
          mode === 'payer_only' || mode === 'payer_plus_site'
            ? {
                companyName: payerCompany.trim(),
                contactPerson: payerContact.trim() || null,
                email: payerEmail.trim(),
                phone: payerPhone.trim() || null,
              }
            : undefined,
        bodyCustomer:
          mode === 'body_only'
            ? {
                companyName: bodyName.trim() || senderName,
                contactPerson: bodyName.trim() || null,
                email: bodyOnlyEmail.trim() || null,
                phone: bodyPhone.trim() || null,
                address: bodyAddress.trim() || null,
                postalCode: bodyPostal.trim() || null,
                city: bodyCity.trim() || null,
              }
            : undefined,
        site:
          mode === 'payer_plus_site'
            ? {
                contactName: bodyName.trim(),
                contactEmail: bodyEmail.trim() || null,
                contactPhone: bodyPhone.trim() || null,
                address: bodyAddress.trim() || null,
                postalCode: bodyPostal.trim() || null,
                city: bodyCity.trim() || null,
                role: 'site',
              }
            : undefined,
        createCase,
      })
      if (!res.success || !res.customerId) {
        setError(res.error || 'Kunne ikke oprette kunde')
        setSubmitting(false)
        return
      }
      onSuccess({
        customerId: res.customerId,
        siteContactId: res.siteContactId,
        serviceCaseId: res.serviceCaseId,
        payerExisted: res.payerExisted || false,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uventet fejl')
      setSubmitting(false)
    }
  }

  const modeDescriptions: Record<CreateFromEmailMode, string> = {
    payer_only: 'Afsenderen er kunden. Opret afsender som ny kunde — body ignoreres.',
    body_only: 'Afsenderen er bare en formidler. Opret personen i mailens brødtekst som ny kunde.',
    payer_plus_site:
      'Afsenderen er ordregiver/grossist, og mailen indeholder slutkundens adresse. Opret afsender som betaler + personen som kontakt på stedet + sag med arbejdsadresse.',
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Opret kunde fra mail</h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-5">
          {/* Smart-default hint */}
          {defaultMode === 'payer_plus_site' && senderIsFirm && hasBodyData && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded p-2.5 text-xs text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                Denne mail ligner en opgave fra en samarbejdspartner. Vi anbefaler at oprette
                afsenderen som betaler og personen i mailens brødtekst som kontakt på stedet.
              </div>
            </div>
          )}

          {/* Mode-valg */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-gray-800 mb-1">Vælg fremgangsmåde:</legend>
            {(['payer_plus_site', 'payer_only', 'body_only'] as CreateFromEmailMode[]).map((m) => {
              const labels: Record<CreateFromEmailMode, string> = {
                payer_plus_site: 'C — Opret afsender som betaler + personen som kontakt på stedet (anbefalet ved samarbejdspartner)',
                payer_only: 'A — Opret afsenderen som betalende kunde (afsender ER kunden)',
                body_only: 'B — Opret personen/adressen i mailens brødtekst som ny kunde',
              }
              return (
                <label
                  key={m}
                  className={`flex items-start gap-2 p-2.5 rounded border cursor-pointer transition-colors ${
                    mode === m
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="create-mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    disabled={submitting}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{labels[m]}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{modeDescriptions[m]}</div>
                  </div>
                </label>
              )
            })}
          </fieldset>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sektion 1: Afsender/betaler */}
            <section
              className={`rounded border p-3 space-y-2 ${
                mode === 'payer_only' || mode === 'payer_plus_site'
                  ? 'bg-blue-50/40 border-blue-200'
                  : 'bg-gray-50 border-gray-200 opacity-60'
              }`}
            >
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-600" />
                Betalende kunde / ordregiver
              </h3>
              <p className="text-[11px] text-gray-500">Data fra mailens afsender</p>
              <input
                type="text"
                value={payerCompany}
                onChange={(e) => setPayerCompany(e.target.value)}
                placeholder="Firmanavn *"
                disabled={submitting || (mode !== 'payer_only' && mode !== 'payer_plus_site')}
                className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-100"
              />
              <input
                type="text"
                value={payerContact}
                onChange={(e) => setPayerContact(e.target.value)}
                placeholder="Kontaktperson"
                disabled={submitting || (mode !== 'payer_only' && mode !== 'payer_plus_site')}
                className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-100"
              />
              <input
                type="email"
                value={payerEmail}
                onChange={(e) => setPayerEmail(e.target.value)}
                placeholder="Email *"
                disabled={submitting || (mode !== 'payer_only' && mode !== 'payer_plus_site')}
                className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-100"
              />
              <input
                type="tel"
                value={payerPhone}
                onChange={(e) => setPayerPhone(e.target.value)}
                placeholder="Telefon"
                disabled={submitting || (mode !== 'payer_only' && mode !== 'payer_plus_site')}
                className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-100"
              />
            </section>

            {/* Sektion 2: Body-parsed */}
            <section
              className={`rounded border p-3 space-y-2 ${
                mode === 'body_only' || mode === 'payer_plus_site'
                  ? 'bg-purple-50/40 border-purple-200'
                  : 'bg-gray-50 border-gray-200 opacity-60'
              }`}
            >
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-purple-600" />
                {mode === 'body_only'
                  ? 'Ny kunde (fra brødtekst)'
                  : 'Leveringskontakt / arbejdsadresse'}
              </h3>
              <p className="text-[11px] text-gray-500">
                {hasBodyData
                  ? 'Data udtrukket fra mailens brødtekst'
                  : 'Ingen data fundet i brødteksten — udfyld manuelt hvis du vælger denne mulighed'}
              </p>
              <input
                type="text"
                value={bodyName}
                onChange={(e) => setBodyName(e.target.value)}
                placeholder={mode === 'body_only' ? 'Firmanavn/navn *' : 'Navn på kontaktperson'}
                disabled={submitting || (mode !== 'body_only' && mode !== 'payer_plus_site')}
                className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 disabled:bg-gray-100"
              />
              {mode === 'body_only' ? (
                <input
                  type="email"
                  value={bodyOnlyEmail}
                  onChange={(e) => setBodyOnlyEmail(e.target.value)}
                  placeholder="Email *"
                  disabled={submitting}
                  className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                />
              ) : (
                <input
                  type="email"
                  value={bodyEmail}
                  onChange={(e) => setBodyEmail(e.target.value)}
                  placeholder="Email (valgfri)"
                  disabled={submitting || mode !== 'payer_plus_site'}
                  className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 disabled:bg-gray-100"
                />
              )}
              <input
                type="tel"
                value={bodyPhone}
                onChange={(e) => setBodyPhone(e.target.value)}
                placeholder="Telefon"
                disabled={submitting || (mode !== 'body_only' && mode !== 'payer_plus_site')}
                className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 disabled:bg-gray-100"
              />
              <input
                type="text"
                value={bodyAddress}
                onChange={(e) => setBodyAddress(e.target.value)}
                placeholder="Adresse"
                disabled={submitting || (mode !== 'body_only' && mode !== 'payer_plus_site')}
                className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 disabled:bg-gray-100"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={bodyPostal}
                  onChange={(e) => setBodyPostal(e.target.value)}
                  placeholder="Postnr."
                  disabled={submitting || (mode !== 'body_only' && mode !== 'payer_plus_site')}
                  className="col-span-1 px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 disabled:bg-gray-100"
                />
                <input
                  type="text"
                  value={bodyCity}
                  onChange={(e) => setBodyCity(e.target.value)}
                  placeholder="By"
                  disabled={submitting || (mode !== 'body_only' && mode !== 'payer_plus_site')}
                  className="col-span-2 px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 disabled:bg-gray-100"
                />
              </div>
            </section>
          </div>

          {/* createCase */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createCase}
              onChange={(e) => setCreateCase(e.target.checked)}
              disabled={submitting}
            />
            <span className="text-gray-700">
              Opret også en serviceopgave fra mailen
              {mode === 'payer_plus_site' && bodyAddress && (
                <span className="text-gray-500"> (med arbejdsadressen)</span>
              )}
            </span>
          </label>

          {/* Tvivl-advarsel */}
          {mode === 'payer_only' && hasBodyData && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Kontrollér om det er det rigtige valg — mailens brødtekst ser ud til at indeholde en
                anden person/adresse. Overvej C-valget hvis afsenderen er en samarbejdspartner.
              </span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2 bg-gray-50">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
          >
            Annullér
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Opretter...' : 'Opret'}
          </button>
        </div>
      </div>
    </div>
  )
}
