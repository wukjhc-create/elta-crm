'use client'

/**
 * Sprint 12A Trin 5B — Edit dialog for offer sagspartner roles.
 *
 * Three party slots (orderer / end_customer / payer) + billing_mode.
 * Reuses searchCustomersForSite (Sprint 9E) for customer search.
 *
 * Behavior:
 *  - When billing_mode='same_as_customer', the three slots are locked
 *    and visually show "Samme som primær kunde". Server normalizes
 *    all three to customer_id on save.
 *  - When billing_mode is any split mode, each slot can be set
 *    independently. null/empty = falls back to primary customer.
 *  - "Nulstil til samme som primær kunde" button sets
 *    billing_mode='same_as_customer' (which locks the slots).
 *
 * No mail-routing side effects — resolveOfferMailRoute already reads
 * these fields (deployed in Trin 4).
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, X, Search, Building, User, Wallet, RotateCcw } from 'lucide-react'
import {
  updateOfferParties,
  type UpdateOfferPartiesInput,
} from '@/lib/actions/offer-parties'
import {
  searchCustomersForSite,
  type CustomerSearchResult,
} from '@/lib/actions/service-case-site'
import {
  OFFER_BILLING_MODE_LABELS,
  OFFER_BILLING_MODES,
  type OfferBillingMode,
} from '@/types/offers.types'

interface PartyRef {
  id: string
  company_name: string
}

export interface EditOfferPartiesDialogProps {
  offerId: string
  /** Primary customer of the offer — fallback display + reset target. */
  primaryCustomer: {
    id: string
    company_name: string | null
  }
  initial: {
    orderer: PartyRef | null
    end_customer: PartyRef | null
    payer: PartyRef | null
    billing_mode: OfferBillingMode | null
  }
  onClose: () => void
  onSaved: () => void
}

type Slot = 'orderer' | 'end' | 'payer'

export function EditOfferPartiesDialog({
  offerId,
  primaryCustomer,
  initial,
  onClose,
  onSaved,
}: EditOfferPartiesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const [orderer, setOrderer] = useState<PartyRef | null>(initial.orderer)
  const [endCustomer, setEndCustomer] = useState<PartyRef | null>(initial.end_customer)
  const [payer, setPayer] = useState<PartyRef | null>(initial.payer)
  const [billingMode, setBillingMode] = useState<OfferBillingMode>(
    initial.billing_mode || 'same_as_customer'
  )

  const [activeSlot, setActiveSlot] = useState<Slot | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSameAsCustomer = billingMode === 'same_as_customer'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

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
    if (isSameAsCustomer) return
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
    }
    closeSlot()
  }

  const clearSlot = (slot: Slot) => {
    switch (slot) {
      case 'orderer': setOrderer(null); break
      case 'end': setEndCustomer(null); break
      case 'payer': setPayer(null); break
    }
  }

  const resetToSameAsCustomer = () => {
    setOrderer(null)
    setEndCustomer(null)
    setPayer(null)
    setBillingMode('same_as_customer')
    closeSlot()
  }

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      const payload: UpdateOfferPartiesInput = {
        orderer_customer_id: isSameAsCustomer ? null : orderer?.id ?? null,
        end_customer_id: isSameAsCustomer ? null : endCustomer?.id ?? null,
        payer_customer_id: isSameAsCustomer ? null : payer?.id ?? null,
        billing_mode: billingMode,
      }
      const res = await updateOfferParties(offerId, payload)
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

  const primaryName = primaryCustomer.company_name || 'primær kunde'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-offer-parties-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 id="edit-offer-parties-title" className="text-lg font-semibold text-gray-900">
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
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            Mail-routing følger billing_mode på tilbuddet. Ved <strong>Samme som primær kunde</strong> sendes alt til den primære kunde.
          </div>

          {/* Reset action */}
          <div>
            <button
              type="button"
              onClick={resetToSameAsCustomer}
              disabled={saving || isSameAsCustomer}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border rounded bg-gray-50 text-gray-700 border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Nulstil til samme som primær kunde
            </button>
          </div>

          {/* Billing mode */}
          <section className="space-y-2">
            <label
              htmlFor="offer-billing-mode"
              className="block text-sm font-semibold text-gray-800"
            >
              Betalingsforhold
            </label>
            <select
              id="offer-billing-mode"
              value={billingMode}
              onChange={(e) => setBillingMode(e.target.value as OfferBillingMode)}
              disabled={saving}
              className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
            >
              {OFFER_BILLING_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'same_as_customer'
                    ? 'Samme som primær kunde'
                    : OFFER_BILLING_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
            {isSameAsCustomer && (
              <p className="text-xs text-gray-500">
                Alle tre roller sættes til primær kunde ({primaryName}).
              </p>
            )}
          </section>

          {/* Party slots — disabled when same_as_customer */}
          <PartySection
            icon={<Building className="w-4 h-4 text-emerald-600" />}
            title="Bestiller / ordregiver"
            description="Den der bestilte tilbuddet."
            party={orderer}
            slot="orderer"
            primaryName={primaryName}
            disabled={isSameAsCustomer}
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
          />

          <PartySection
            icon={<User className="w-4 h-4 text-blue-600" />}
            title="Slutkunde / anlægsejer"
            description="Slutkunden. Kan være = bestiller ved B2C."
            party={endCustomer}
            slot="end"
            primaryName={primaryName}
            disabled={isSameAsCustomer}
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
          />

          <PartySection
            icon={<Wallet className="w-4 h-4 text-purple-600" />}
            title="Betaler"
            description="Hvem får tilbud og faktura."
            party={payer}
            slot="payer"
            primaryName={primaryName}
            disabled={isSameAsCustomer}
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
          />

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
  primaryName: string
  disabled: boolean
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
  primaryName,
  disabled,
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
            disabled={saving || disabled}
            className="text-xs text-emerald-700 hover:underline disabled:opacity-50"
          >
            Ryd
          </button>
        </div>
      ) : (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
          Samme som primær kunde — {primaryName}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => onOpen(slot)}
          disabled={saving || disabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border bg-gray-50 text-gray-700 border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="w-3 h-3" />
          {party ? 'Skift' : 'Vælg kunde'}
        </button>
      ) : (
        <div className="space-y-1.5 border border-emerald-200 rounded p-2 bg-emerald-50/40">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Søg firmanavn, kundenr, email…"
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
              <Loader2 className="w-3 h-3 animate-spin" /> Søger…
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
