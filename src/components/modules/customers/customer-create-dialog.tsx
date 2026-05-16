'use client'

/**
 * Sprint 9E Phase 5b — Faelles CustomerCreateDialog.
 *
 * EN dialog til kundeoprettelse i hele ELTA Drift. To modes:
 *  - mode="quick" (default): minimum felter, bruges fra opret-sag-flow
 *  - mode="full": alle felter + dublet-check, bruges paa /dashboard/customers
 *    og dashboard quick-action
 *
 * Begge modes bruger:
 *  - Privatkunde / Erhverv-toggle
 *  - Server-side DAWA-wrapper via AddressAutocomplete (Sprint 9D)
 *  - Samme server-action quickCreateCustomer (med valgfri felter)
 *  - Samme createCustomerSchema-validering
 *
 * Edit-flow bruger fortsat eksisterende CustomerForm — denne dialog
 * haandterer KUN CREATE.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, X, User, Building2, Copy } from 'lucide-react'
import { quickCreateCustomer, checkDuplicateCustomer } from '@/lib/actions/customers'
import { AddressAutocomplete } from '@/components/forms/address-autocomplete'
import type { AddressSuggestion } from '@/lib/services/address-lookup'
import type { Customer } from '@/types/customers.types'

export interface CreatedCustomerRef {
  id: string
  company_name: string
  contact_person: string | null
  customer_number: string
  email: string
}

export type CustomerCreateMode = 'quick' | 'full'

export interface CustomerCreateDialogProps {
  /** "quick" = minimum felter (opret-sag-flow), "full" = alle felter (kundeside). */
  mode?: CustomerCreateMode
  onClose: () => void
  onCreated: (customer: CreatedCustomerRef) => void
}

type CustomerType = 'private' | 'business'

export function CustomerCreateDialog({
  mode = 'quick',
  onClose,
  onCreated,
}: CustomerCreateDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const [type, setType] = useState<CustomerType>('private')

  // Faelles felter
  const [primaryName, setPrimaryName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')

  // Full-mode only
  const [mobile, setMobile] = useState('')
  const [website, setWebsite] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [shippingPostalCode, setShippingPostalCode] = useState('')
  const [shippingCity, setShippingCity] = useState('')
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)

  const isFullMode = mode === 'full'
  const isPrivate = type === 'private'

  // Esc lukker modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const handleAddressSelect = (s: AddressSuggestion) => {
    const street = [s.street, s.houseNumber].filter(Boolean).join(' ')
    setAddress(street)
    setPostalCode(s.postalCode)
    setCity(s.city)
  }

  const handleShippingAddressSelect = (s: AddressSuggestion) => {
    const street = [s.street, s.houseNumber].filter(Boolean).join(' ')
    setShippingAddress(street)
    setShippingPostalCode(s.postalCode)
    setShippingCity(s.city)
  }

  const copyBillingToShipping = () => {
    setShippingAddress(address)
    setShippingPostalCode(postalCode)
    setShippingCity(city)
  }

  const validateBasics = (): string | null => {
    if (!primaryName.trim()) {
      return isPrivate ? 'Navn er paakraevet' : 'Firmanavn er paakraevet'
    }
    if (!isPrivate && !contactPerson.trim()) {
      return 'Kontaktperson er paakraevet'
    }
    if (!email.trim()) {
      return 'Email er paakraevet'
    }
    return null
  }

  // Phase 5b — dublet-check kun i full-mode. Returnerer true hvis save
  // skal fortsaette, false hvis brugeren afviser pga. dublet.
  const checkForDuplicates = async (): Promise<boolean> => {
    if (!isFullMode) return true
    if (!email.trim()) return true
    try {
      const dup = await checkDuplicateCustomer(email, primaryName)
      if (dup.success && dup.data && dup.data.length > 0) {
        const matches = dup.data.map((d) => `${d.company_name} (${d.customer_number})`).join(', ')
        const proceed = window.confirm(
          `Mulig dublet fundet:\n${matches}\n\nOpret alligevel?`
        )
        if (!proceed) {
          setDuplicateWarning(`Annulleret. Eksisterende kunde fundet: ${matches}`)
          return false
        }
      }
    } catch {
      // Net-fejl maa ikke blokere save — fortsaet
    }
    return true
  }

  const handleSave = async () => {
    setError(null)
    setDuplicateWarning(null)

    const basicError = validateBasics()
    if (basicError) {
      setError(basicError)
      return
    }

    setSaving(true)
    try {
      const proceed = await checkForDuplicates()
      if (!proceed) {
        setSaving(false)
        return
      }

      const res = await quickCreateCustomer({
        customer_type: type,
        primary_name: primaryName,
        contact_person: isPrivate ? null : contactPerson,
        email,
        phone: phone || null,
        mobile: isFullMode ? (mobile || null) : null,
        vat_number: isPrivate ? null : (vatNumber || null),
        website: isFullMode && !isPrivate ? (website || null) : null,
        billing_address: address || null,
        billing_postal_code: postalCode || null,
        billing_city: city || null,
        shipping_address: isFullMode ? (shippingAddress || null) : null,
        shipping_postal_code: isFullMode ? (shippingPostalCode || null) : null,
        shipping_city: isFullMode ? (shippingCity || null) : null,
        shipping_country: isFullMode ? 'Danmark' : null,
        notes: isFullMode ? (notes || null) : null,
      })
      if (!res.success || !res.data) {
        setError(res.error || 'Kunne ikke oprette kunde')
        setSaving(false)
        return
      }
      const c = res.data as Customer
      onCreated({
        id: c.id,
        company_name: c.company_name,
        contact_person: c.contact_person,
        customer_number: c.customer_number,
        email: c.email,
      })
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
      aria-labelledby="customer-create-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={`bg-white rounded-lg shadow-xl w-full ${isFullMode ? 'max-w-2xl' : 'max-w-xl'} max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 id="customer-create-title" className="text-lg font-semibold text-gray-900">
            Opret ny kunde
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

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Type-toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('private')}
              disabled={saving}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded border transition ${
                type === 'private'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-1 ring-emerald-200'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              <User className="w-4 h-4" />
              Privatkunde
            </button>
            <button
              type="button"
              onClick={() => setType('business')}
              disabled={saving}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded border transition ${
                type === 'business'
                  ? 'bg-blue-50 border-blue-300 text-blue-800 ring-1 ring-blue-200'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              <Building2 className="w-4 h-4" />
              Erhverv
            </button>
          </div>

          {/* Navn / firmanavn */}
          <Field label={isPrivate ? 'Fulde navn *' : 'Firmanavn *'}>
            <input
              type="text"
              value={primaryName}
              onChange={(e) => setPrimaryName(e.target.value)}
              placeholder={isPrivate ? 'Fx Peter Hansen' : 'Fx Fasetech ApS'}
              maxLength={200}
              disabled={saving}
              className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </Field>

          {/* Kontaktperson (kun erhverv) */}
          {!isPrivate && (
            <Field label="Kontaktperson *">
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Navn paa primaer kontakt"
                maxLength={200}
                disabled={saving}
                className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </Field>
          )}

          {/* CVR (kun erhverv) */}
          {!isPrivate && (
            <Field label="CVR-nummer">
              <input
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="Fx 12345678"
                maxLength={50}
                disabled={saving}
                className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </Field>
          )}

          {/* Email + telefon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email *">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="navn@example.dk"
                disabled={saving}
                className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </Field>
            <Field label="Telefon">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+45 ..."
                maxLength={50}
                disabled={saving}
                className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </Field>
          </div>

          {/* Full-mode: Mobil + Website */}
          {isFullMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Mobil">
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+45 ..."
                  maxLength={50}
                  disabled={saving}
                  className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
              {!isPrivate && (
                <Field label="Hjemmeside">
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://..."
                    maxLength={200}
                    disabled={saving}
                    className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </Field>
              )}
            </div>
          )}

          {/* Adresse */}
          <Field label={isFullMode ? 'Faktureringsadresse' : 'Adresse'}>
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={handleAddressSelect}
              placeholder="Soeg adresse..."
              disabled={saving}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Postnr">
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                maxLength={20}
                disabled={saving}
                className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="By">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={100}
                  disabled={saving}
                  className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
            </div>
          </div>

          {/* Full-mode: Leveringsadresse */}
          {isFullMode && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Leveringsadresse</h3>
                <button
                  type="button"
                  onClick={copyBillingToShipping}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border bg-white text-gray-700 border-gray-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 disabled:opacity-50"
                >
                  <Copy className="w-3 h-3" />
                  Kopiér fra faktureringsadresse
                </button>
              </div>
              <Field label="Adresse">
                <AddressAutocomplete
                  value={shippingAddress}
                  onChange={setShippingAddress}
                  onSelect={handleShippingAddressSelect}
                  placeholder="Soeg adresse..."
                  disabled={saving}
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Postnr">
                  <input
                    type="text"
                    value={shippingPostalCode}
                    onChange={(e) => setShippingPostalCode(e.target.value)}
                    maxLength={20}
                    disabled={saving}
                    className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="By">
                    <input
                      type="text"
                      value={shippingCity}
                      onChange={(e) => setShippingCity(e.target.value)}
                      maxLength={100}
                      disabled={saving}
                      className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* Full-mode: Noter */}
          {isFullMode && (
            <Field label="Interne noter">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={5000}
                disabled={saving}
                className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                placeholder="Synlige kun internt..."
              />
            </Field>
          )}

          {duplicateWarning && (
            <div className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-sm">
              {duplicateWarning}
            </div>
          )}

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
            {saving ? 'Opretter…' : 'Opret kunde'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}
