'use client'

/**
 * Sprint 9E Phase 3 — Rediger sagspartnere modal.
 *
 * Fire sektioner:
 *  A. Ordregiver
 *  B. Kunde / anlaegsejer
 *  C. Betaler + billing_mode
 *  D. Koebssted / forhandler (customer-soeg ELLER fritekst)
 *
 * Aendrer KUN sagspartner-felter. Mail-router er uaendret indtil Phase 6.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, X, Search, Building2, Receipt, MapPin, AlertCircle } from 'lucide-react'
import {
  updateServiceCaseParties,
  type UpdateServiceCasePartiesInput,
} from '@/lib/actions/service-case-parties'
import {
  searchCustomersForSite,
  type CustomerSearchResult,
} from '@/lib/actions/service-case-site'
import {
  BILLING_MODE_LABELS,
  type ServiceCaseBillingMode,
} from '@/types/service-cases.types'

interface PartyRef {
  id: string
  company_name: string
}

export interface EditServiceCasePartiesDialogProps {
  caseId: string
  /** Sagens customer_id, vises som fallback-tekst hvis partner-felter er null. */
  payingCustomerName: string | null
  initial: {
    orderer_customer: PartyRef | null
    end_customer: PartyRef | null
    payer_customer: PartyRef | null
    purchased_from_customer: PartyRef | null
    purchase_source: string | null
    billing_mode: ServiceCaseBillingMode | null
  }
  onClose: () => void
  onSaved: () => void
}

type Slot = 'orderer' | 'end' | 'payer' | 'purchased_from'

export function EditServiceCasePartiesDialog({
  caseId,
  payingCustomerName,
  initial,
  onClose,
  onSaved,
}: EditServiceCasePartiesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const [orderer, setOrderer] = useState<PartyRef | null>(initial.orderer_customer)
  const [endCustomer, setEndCustomer] = useState<PartyRef | null>(initial.end_customer)
  const [payer, setPayer] = useState<PartyRef | null>(initial.payer_customer)
  const [purchasedFrom, setPurchasedFrom] = useState<PartyRef | null>(initial.purchased_from_customer)
  const [purchaseSource, setPurchaseSource] = useState(initial.purchase_source || '')
  const [billingMode, setBillingMode] = useState<ServiceCaseBillingMode | ''>(
    initial.billing_mode || ''
  )

  const [activeSlot, setActiveSlot] = useState<Slot | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Esc lukker modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  // Debounced soegning naar et slot er aabent
  useEffect(() => {
    if (!activeSlot) return
    const handle = setTimeout(async () => {
      setSearching(true)
      const res = await searchCustomersForSite(query)
      if (res.success) setResults(res.results)
      setSearching(false)
    }, 250)
    return () => clearTimeout(handle)
  }, [query, activeSlot])

  const openSlot = (slot: Slot) => {
    setActiveSlot(slot)
    setQuery('')
    setResults([])
  }
  const closeSlot = () => {
    setActiveSlot(null)
    setQuery('')
    setResults([])
  }

  const selectFromSearch = (c: CustomerSearchResult) => {
    const ref: PartyRef = { id: c.id, company_name: c.company_name }
    switch (activeSlot) {
      case 'orderer': setOrderer(ref); break
      case 'end': setEndCustomer(ref); break
      case 'payer': setPayer(ref); break
      case 'purchased_from':
        setPurchasedFrom(ref)
        // Naar customer-vaelges, ryd fritekst saa data ikke duplikerer
        setPurchaseSource('')
        break
    }
    closeSlot()
  }

  const clearSlot = (slot: Slot) => {
    switch (slot) {
      case 'orderer': setOrderer(null); break
      case 'end': setEndCustomer(null); break
      case 'payer': setPayer(null); break
      case 'purchased_from': setPurchasedFrom(null); break
    }
  }

  // Diskret advarsel: payer adskiller sig fra orderer/end_customer
  const payerDiffers =
    !!payer && ((orderer?.id && payer.id !== orderer.id) || (endCustomer?.id && payer.id !== endCustomer.id))

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      const payload: UpdateServiceCasePartiesInput = {
        orderer_customer_id: orderer?.id ?? null,
        end_customer_id: endCustomer?.id ?? null,
        payer_customer_id: payer?.id ?? null,
        purchased_from_customer_id: purchasedFrom?.id ?? null,
        purchase_source: purchasedFrom ? null : purchaseSource.trim() || null,
        billing_mode: billingMode === '' ? null : billingMode,
      }
      const res = await updateServiceCaseParties(caseId, payload)
      if (!res.success) {
        setError(res.error || 'Kunne ikke gemme')
        setSaving(false)
        return
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uventet fejl')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-parties-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 id="edit-parties-title" className="text-lg font-semibold text-gray-900">
            Rediger sagspartnere
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Luk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Denne redigering gemmer kun sagspartner-data. Tilbud/faktura sendes
            stadig efter eksisterende routing indtil Phase 6.
          </div>

          {/* A — Ordregiver */}
          <PartySection
            icon={<Building2 className="w-4 h-4 text-emerald-600" />}
            title="Ordregiver"
            description="Den der bestilte opgaven. Tom = samme som nuvaerende kunde."
            party={orderer}
            slot="orderer"
            payingCustomerName={payingCustomerName}
            activeSlot={activeSlot}
            query={query}
            setQuery={setQuery}
            results={results}
            searching={searching}
            saving={saving}
            onOpen={openSlot}
            onCancel={closeSlot}
            onClear={() => clearSlot('orderer')}
            onSelect={selectFromSearch}
            fallbackLabel="Samme som nuvaerende kunde"
          />

          {/* B — Kunde / anlaegsejer */}
          <PartySection
            icon={<Building2 className="w-4 h-4 text-blue-600" />}
            title="Kunde / anlaegsejer"
            description="Slutkunden. Kan vaere = ordregiver ved B2C."
            party={endCustomer}
            slot="end"
            payingCustomerName={payingCustomerName}
            activeSlot={activeSlot}
            query={query}
            setQuery={setQuery}
            results={results}
            searching={searching}
            saving={saving}
            onOpen={openSlot}
            onCancel={closeSlot}
            onClear={() => clearSlot('end')}
            onSelect={selectFromSearch}
            fallbackLabel="Samme som leveringskunde/kunde"
          />

          {/* C — Betaler + billing_mode */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-purple-600" />
              Betaler
            </h3>
            <p className="text-xs text-gray-500">Hvem faar tilbud/faktura.</p>
            <PartyChooser
              party={payer}
              slot="payer"
              payingCustomerName={payingCustomerName}
              activeSlot={activeSlot}
              query={query}
              setQuery={setQuery}
              results={results}
              searching={searching}
              saving={saving}
              onOpen={openSlot}
              onCancel={closeSlot}
              onClear={() => clearSlot('payer')}
              onSelect={selectFromSearch}
              fallbackLabel="Samme som betaler/kunde"
            />
            {payerDiffers && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Betaler er valgt separat. Mail-routing aendres foerst i Phase 6.
              </div>
            )}
            <label className="block text-xs font-medium text-gray-600 mt-2" htmlFor="billing-mode">
              Billing mode
            </label>
            <select
              id="billing-mode"
              value={billingMode}
              onChange={(e) => setBillingMode(e.target.value as ServiceCaseBillingMode | '')}
              disabled={saving}
              className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            >
              <option value="">— Ikke valgt —</option>
              {(Object.entries(BILLING_MODE_LABELS) as Array<[ServiceCaseBillingMode, string]>).map(
                ([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                )
              )}
            </select>
          </section>

          {/* D — Koebssted / forhandler */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-orange-600" />
              Koebssted / forhandler
            </h3>
            <p className="text-xs text-gray-500">
              Hvor er anlaegget koebt. Faar ALDRIG mail automatisk — kun reference.
            </p>
            <PartyChooser
              party={purchasedFrom}
              slot="purchased_from"
              payingCustomerName={payingCustomerName}
              activeSlot={activeSlot}
              query={query}
              setQuery={setQuery}
              results={results}
              searching={searching}
              saving={saving}
              onOpen={openSlot}
              onCancel={closeSlot}
              onClear={() => clearSlot('purchased_from')}
              onSelect={selectFromSearch}
              fallbackLabel="Ikke angivet"
            />
            <label className="block text-xs font-medium text-gray-600 mt-2" htmlFor="purchase-source">
              Eller fritekst (hvis ingen kunde passer)
            </label>
            <input
              id="purchase-source"
              type="text"
              value={purchaseSource}
              onChange={(e) => setPurchaseSource(e.target.value)}
              placeholder={`Fx "Direkte", "Bilka"`}
              disabled={saving || !!purchasedFrom}
              maxLength={200}
              className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 disabled:bg-gray-50 disabled:text-gray-400"
            />
            {!!purchasedFrom && (
              <p className="text-[11px] text-gray-500">
                Fritekst nulstilles fordi en kunde er valgt.
              </p>
            )}
          </section>

          {error && (
            <div className="p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
          >
            Annullér
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Gemmer…' : 'Gem'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Sub-components
// =====================================================

interface ChooserProps {
  party: PartyRef | null
  slot: Slot
  payingCustomerName: string | null
  activeSlot: Slot | null
  query: string
  setQuery: (s: string) => void
  results: CustomerSearchResult[]
  searching: boolean
  saving: boolean
  onOpen: (slot: Slot) => void
  onCancel: () => void
  onClear: () => void
  onSelect: (c: CustomerSearchResult) => void
  fallbackLabel: string
}

function PartySection({
  icon,
  title,
  description,
  ...chooser
}: ChooserProps & {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      <p className="text-xs text-gray-500">{description}</p>
      <PartyChooser {...chooser} />
    </section>
  )
}

function PartyChooser({
  party,
  slot,
  payingCustomerName,
  activeSlot,
  query,
  setQuery,
  results,
  searching,
  saving,
  onOpen,
  onCancel,
  onClear,
  onSelect,
  fallbackLabel,
}: ChooserProps) {
  const open = activeSlot === slot
  return (
    <div className="space-y-1.5">
      {party ? (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded p-2">
          <span className="flex-1 text-sm font-medium text-emerald-900">
            {party.company_name}
          </span>
          <button
            type="button"
            onClick={onClear}
            disabled={saving}
            className="text-xs text-emerald-700 hover:underline disabled:opacity-50"
          >
            Ryd
          </button>
        </div>
      ) : (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
          {fallbackLabel}
          {payingCustomerName ? ` — pt. ${payingCustomerName}` : ''}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => onOpen(slot)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border bg-gray-50 text-gray-700 border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-50"
        >
          <Search className="w-3 h-3" />
          {party ? 'Skift' : 'Vaelg kunde'}
        </button>
      ) : (
        <div className="space-y-1.5 border border-emerald-200 rounded p-2 bg-emerald-50/40">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Soeg firmanavn, kundenr, email…"
              disabled={saving}
              className="flex-1 px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
              autoFocus
            />
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="text-xs text-gray-500 hover:underline"
            >
              Annullér
            </button>
          </div>
          {searching ? (
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Soeger…
            </div>
          ) : results.length === 0 ? (
            <div className="text-xs text-gray-500">Ingen resultater</div>
          ) : (
            <ul className="border bg-white rounded divide-y max-h-48 overflow-y-auto">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-emerald-50"
                  >
                    <div className="font-medium text-gray-900">{c.company_name}</div>
                    <div className="text-gray-500">
                      {c.customer_number}
                      {c.contact_person ? ` · ${c.contact_person}` : ''}
                      {c.email ? ` · ${c.email}` : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
