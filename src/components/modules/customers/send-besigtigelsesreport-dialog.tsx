'use client'

/**
 * Sprint 9H Phase A — Send-dialog for eksisterende besigtigelsesrapport.
 *
 * Modtagervalg baseret paa sagspartner-roller (orderer/end_customer/
 * payer/site_customer/site_contact) hvis dokumentet er koblet til sag.
 *
 * Fallback hvis ikke sag-koblet:
 *  - Vis advarsel
 *  - Lad bruger vaelge sag fra dropdown (kundens sager)
 *  - Hvis ingen sag valgt: kun document.customer + manuel email
 *
 * Eksisterende PDF bruges fra storage — re-genereres aldrig.
 * Kundebekraeftelse (Phase B) er ikke implementeret her.
 */

import { useState, useEffect } from 'react'
import { Loader2, Send, X, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import {
  getBesigtigelseRecipientOptions,
  listCustomerServiceCasesForBesigtigelse,
  sendExistingBesigtigelsesreport,
  sendBesigtigelseSequential,
  getCaseSignerSummary,
  type BesigtigelseCaseParty,
} from '@/lib/actions/besigtigelse'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSent?: () => void
  documentId: string
  documentTitle: string
  documentFileName: string
  documentCustomerId: string
  documentServiceCaseId: string | null
}

interface CustomerCaseOption {
  id: string
  case_number: string | null
  title: string | null
  status: string | null
}

interface SelectableRecipient extends BesigtigelseCaseParty {
  selected: boolean
}

export function SendBesigtigelsesreportDialog({
  isOpen,
  onClose,
  onSent,
  documentId,
  documentTitle,
  documentFileName,
  documentCustomerId,
  documentServiceCaseId,
}: Props) {
  const toast = useToast()

  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [recipients, setRecipients] = useState<SelectableRecipient[]>([])
  const [warning, setWarning] = useState<string | undefined>(undefined)
  const [serviceCaseLabel, setServiceCaseLabel] = useState<string | null>(null)

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(documentServiceCaseId)
  const [availableCases, setAvailableCases] = useState<CustomerCaseOption[]>([])

  const [customEmail, setCustomEmail] = useState('')
  const [customEmailSelected, setCustomEmailSelected] = useState(false)
  const [message, setMessage] = useState('')
  // Phase B1: gated bekraeftelses-flow. Default false = uaendret Phase A.
  const [requireConfirmation, setRequireConfirmation] = useState(false)
  // Fase 2a: sekventiel godkendelse (kunde → partner) med manuelt kontrolpunkt.
  // Default false = uændret parallel-flow.
  const [sequential, setSequential] = useState(false)
  const [seqSummary, setSeqSummary] = useState<{
    signerName: string | null
    signerCompany: string | null
    payerName: string | null
    siteAddress: string
  } | null>(null)

  // Hent sagens parter til sekvens-info-boksen når sekventiel slås til.
  useEffect(() => {
    if (!isOpen || !sequential || !documentServiceCaseId) {
      setSeqSummary(null)
      return
    }
    let cancelled = false
    getCaseSignerSummary(documentServiceCaseId).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        setSeqSummary({
          signerName: res.data.signerName,
          signerCompany: res.data.signerCompany,
          payerName: res.data.payerName,
          siteAddress: res.data.siteAddress,
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, sequential, documentServiceCaseId])

  // Load recipient options when dialog opens or scope-case changes.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      const result = await getBesigtigelseRecipientOptions(documentId, selectedCaseId)
      if (cancelled) return
      if (result.success && result.data) {
        setRecipients(result.data.parties.map((p) => ({ ...p, selected: false })))
        setWarning(result.data.warning)
        setServiceCaseLabel(
          result.data.serviceCase
            ? `Sag ${result.data.serviceCase.case_number || ''} — ${result.data.serviceCase.title || ''}`.trim()
            : null
        )
      } else {
        toast.error('Kunne ikke hente modtagere', result.error)
        setRecipients([])
        setWarning(result.error)
      }
      setIsLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
    // Sprint 11B hotfix — `toast` er bevidst udeladt fra deps. useToast()
    // returnerer hele context-value som ikke er useMemo'iseret i
    // ToastProvider, saa ny identity hver render trigger en refetch-loop.
    // toast.error() inde i load() bruger den aktuelle context-vaerdi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documentId, selectedCaseId])

  // Load customer's cases for dropdown when no scope-case is set.
  useEffect(() => {
    if (!isOpen) return
    if (selectedCaseId) return
    let cancelled = false
    const loadCases = async () => {
      const result = await listCustomerServiceCasesForBesigtigelse(documentCustomerId)
      if (cancelled) return
      if (result.success && result.data) {
        setAvailableCases(result.data)
      }
    }
    loadCases()
    return () => {
      cancelled = true
    }
  }, [isOpen, documentCustomerId, selectedCaseId])

  const toggleRecipient = (index: number) => {
    setRecipients((prev) =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    )
  }

  const handleSend = async () => {
    // Fase 2a — sekventiel godkendelse: sender kun til anlægsejer; partner-
    // trinnet frigives til manuelt videresend efter kundens godkendelse.
    if (sequential) {
      if (!documentServiceCaseId) {
        toast.error('Rapporten skal være koblet til en sag for sekventiel godkendelse')
        return
      }
      setIsSending(true)
      try {
        const result = await sendBesigtigelseSequential({
          documentId,
          message: message.trim() || null,
        })
        if (result.success && result.data) {
          toast.success(
            `Sendt til anlægsejer (${result.data.sentTo})`,
            result.data.sequential
              ? 'Partner-trinnet frigives til manuelt videresend, når kunden har godkendt.'
              : 'Ingen separat betaler på sagen — kun anlægsejeren skal godkende.'
          )
          onSent?.()
          onClose()
        } else {
          toast.error('Kunne ikke starte sekventiel godkendelse', result.error)
        }
      } catch (err) {
        console.error('[BESIGTIGELSE-SEQ] unexpected error', err)
        toast.error('Kunne ikke starte sekventiel godkendelse')
      } finally {
        setIsSending(false)
      }
      return
    }

    const chosenParties = recipients.filter((r) => r.selected && r.email)
    const manualValid = customEmailSelected && customEmail.trim().length > 0

    if (chosenParties.length === 0 && !manualValid) {
      toast.error('Vælg mindst én modtager')
      return
    }

    setIsSending(true)
    try {
      const result = await sendExistingBesigtigelsesreport({
        documentId,
        serviceCaseIdOverride: selectedCaseId,
        message: message.trim() || null,
        requireConfirmation,
        recipients: [
          ...chosenParties.map((p) => ({
            type: p.contactId ? ('contact' as const) : ('customer' as const),
            customerId: p.contactId ? null : p.customerId,
            contactId: p.contactId || null,
            roleLabel: p.role,
          })),
          ...(manualValid
            ? [
                {
                  type: 'manual' as const,
                  email: customEmail.trim(),
                  roleLabel: 'manual' as const,
                },
              ]
            : []),
        ],
      })

      if (result.success && result.data) {
        const { sent, failed } = result.data
        if (failed === 0) {
          toast.success(`Besigtigelsesrapport sendt til ${sent} modtager${sent === 1 ? '' : 'e'}`)
        } else {
          toast.success(
            `Sendt til ${sent} af ${sent + failed}`,
            'Nogle modtagere fejlede — se browser console for detaljer.'
          )
          console.error('[BESIGTIGELSE-SEND] partial failure', result.data.errors)
        }
        onSent?.()
        onClose()
      } else {
        toast.error('Kunne ikke sende besigtigelsesrapport', result.error)
      }
    } catch (err) {
      console.error('[BESIGTIGELSE-SEND] unexpected error', err)
      toast.error('Kunne ikke sende besigtigelsesrapport')
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Send besigtigelsesrapport</h2>
          <button
            onClick={onClose}
            disabled={isSending}
            className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Document info */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-900 truncate">{documentTitle}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{documentFileName}</p>
          </div>

          {/* Sag-context */}
          {serviceCaseLabel ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Sag</p>
              <p className="text-sm text-gray-900">{serviceCaseLabel}</p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-900">
                  Rapporten er ikke koblet til en sag, så systemet kan ikke automatisk skelne
                  mellem betaler og leveringskunde.
                </p>
              </div>
              {availableCases.length > 0 ? (
                <div>
                  <label className="block text-xs font-medium text-amber-900 mb-1">
                    Vælg sag for at hente sagspartnere:
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setSelectedCaseId(e.target.value)
                    }}
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">— Vælg sag —</option>
                    {availableCases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {(c.case_number || c.id.slice(0, 8)) + ' — ' + (c.title || 'uden titel')}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-amber-800">
                  Kunden har ingen sager — du kan kun sende til kunden på dokumentet eller en
                  manuel email.
                </p>
              )}
            </div>
          )}

          {/* Fase 2a — Sekventiel godkendelse (kunde → partner) */}
          <label
            className={`flex items-start gap-3 p-3 border rounded-lg transition-colors ${
              !documentServiceCaseId
                ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                : sequential
                ? 'border-green-500 bg-green-50 cursor-pointer'
                : 'border-gray-200 hover:bg-gray-50 cursor-pointer'
            }`}
          >
            <input
              type="checkbox"
              checked={sequential}
              onChange={(e) => setSequential(e.target.checked)}
              disabled={isSending || !documentServiceCaseId}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">
                Sekventiel godkendelse (kunde → partner)
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {documentServiceCaseId
                  ? 'Sendes først til anlægsejeren. Når kunden har godkendt, kan du sende videre til betaleren med ét klik — intet sendes automatisk til partneren.'
                  : 'Kobl rapporten til en sag for at bruge sekventiel godkendelse.'}
              </p>
            </div>
          </label>

          {sequential && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-1">
              <p className="text-green-900 font-medium">Sådan kører flowet</p>
              <p className="text-green-800 text-xs">
                1. Anlægsejer{seqSummary?.signerName ? ` (${seqSummary.signerName})` : ''} får rapporten og godkender.
              </p>
              <p className="text-green-800 text-xs">
                2. Du får et “send videre”-klik til betaler{seqSummary?.payerName ? ` (${seqSummary.payerName})` : ''} — kontrolpunkt før noget går til partneren.
              </p>
              {seqSummary && !seqSummary.payerName && (
                <p className="text-green-800 text-xs italic">
                  Ingen separat betaler på sagen — kun anlægsejeren skal godkende.
                </p>
              )}
            </div>
          )}

          {!sequential && (
          <>
          {/* Recipients */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Modtagere
            </p>
            {isLoading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-2">
                {recipients.map((r, idx) => {
                  const disabled = !r.email
                  return (
                    <label
                      key={`${r.customerId}-${r.contactId || ''}-${r.role}`}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        disabled
                          ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                          : r.selected
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={() => !disabled && toggleRecipient(idx)}
                        disabled={disabled || isSending}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{r.roleLabel}</p>
                        <p className="text-xs text-gray-600 truncate">{r.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {r.email || 'mangler email'}
                        </p>
                      </div>
                    </label>
                  )
                })}
                {recipients.length === 0 && !isLoading && (
                  <p className="text-sm text-gray-500 italic">Ingen kandidat-modtagere fundet.</p>
                )}

                {/* Manual email */}
                <label
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    customEmailSelected
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={customEmailSelected}
                    onChange={(e) => setCustomEmailSelected(e.target.checked)}
                    disabled={isSending}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">Anden e-mail</p>
                    <input
                      type="email"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="navn@firma.dk"
                      disabled={isSending}
                      className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Besked (valgfri)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Tilføj en kort besked til modtageren..."
              disabled={isSending}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {/* Phase B1 — Kraev bekraeftelse */}
          <label
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              requireConfirmation
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={requireConfirmation}
              onChange={(e) => setRequireConfirmation(e.target.checked)}
              disabled={isSending}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">Kræv bekræftelse fra modtagerne</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Modtagerne får et personligt link til at bekræfte, at rapporten er gennemgået og godkendt.
              </p>
            </div>
          </label>
          </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Annullér
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sender...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
