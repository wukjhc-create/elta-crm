'use client'

/**
 * Sprint 8G+1 — Edit-modal for leveringskontakt / arbejdssted.
 *
 * 4 sektioner:
 *  A. Arbejdsadresse (address, postal_code, city, floor_door, access_notes)
 *  B. Leveringskunde (søg/vælg fra customers; null = samme som betaler)
 *  C. Kontaktperson på stedet (vælg fra customer_contacts under betaler+site)
 *  D. Opret ny kontakt (navn, email, telefon, rolle — gemmes på relevant kunde)
 *
 * Brugeren skal manuelt klikke "Gem".
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, X, Search, UserPlus, MapPin, Building2, Phone, Mail as MailIcon } from 'lucide-react'
import {
  updateServiceCaseSiteInfo,
  createSiteContactForCase,
  getContactsForCase,
  searchCustomersForSite,
  type CustomerSearchResult,
} from '@/lib/actions/service-case-site'
import { AddressAutocomplete } from '@/components/forms/address-autocomplete'
import type { AddressSuggestion } from '@/lib/services/address-lookup'
import {
  CUSTOMER_CONTACT_ROLES,
  CUSTOMER_CONTACT_ROLE_LABELS,
  type CustomerContactRole,
} from '@/types/customers.types'

interface ContactOption {
  id: string
  customer_id: string
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  role: CustomerContactRole | null
  is_primary?: boolean
  parent_label?: 'paying' | 'site'
}

interface EditSiteInfoDialogProps {
  caseId: string
  payingCustomerId: string | null
  initial: {
    address: string | null
    postal_code: string | null
    city: string | null
    floor_door: string | null
    access_notes: string | null
    site_customer: {
      id: string
      company_name: string
    } | null
    site_contact: {
      id: string
      name: string
    } | null
  }
  onClose: () => void
  onSaved: () => void
}

export function EditSiteInfoDialog({
  caseId,
  payingCustomerId,
  initial,
  onClose,
  onSaved,
}: EditSiteInfoDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Section A — adresse
  const [address, setAddress] = useState(initial.address || '')
  const [postalCode, setPostalCode] = useState(initial.postal_code || '')
  const [city, setCity] = useState(initial.city || '')
  const [floorDoor, setFloorDoor] = useState(initial.floor_door || '')
  const [accessNotes, setAccessNotes] = useState(initial.access_notes || '')

  // Section B — site_customer
  const [siteCustomerId, setSiteCustomerId] = useState<string | null>(
    initial.site_customer?.id || null
  )
  const [siteCustomerLabel, setSiteCustomerLabel] = useState<string>(
    initial.site_customer?.company_name || ''
  )
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([])
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false)
  const [searchingCustomers, setSearchingCustomers] = useState(false)

  // Section C — site_contact
  const [siteContactId, setSiteContactId] = useState<string | null>(
    initial.site_contact?.id || null
  )
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)

  // Section D — opret ny kontakt
  const [showCreateContact, setShowCreateContact] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newMobile, setNewMobile] = useState('')
  const [newRole, setNewRole] = useState<CustomerContactRole>('site')
  const [newParent, setNewParent] = useState<'paying' | 'site'>('site')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Esc + click-outside
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, saving])

  // Hent eksisterende kontakter
  useEffect(() => {
    let cancelled = false
    setContactsLoading(true)
    void getContactsForCase(caseId).then((res) => {
      if (cancelled) return
      if (res.success && res.contacts) {
        setContacts(res.contacts as ContactOption[])
      }
      setContactsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [caseId, siteCustomerId])

  // Customer search debounce
  useEffect(() => {
    if (!customerSearchOpen) return
    const handle = setTimeout(async () => {
      setSearchingCustomers(true)
      const res = await searchCustomersForSite(customerQuery)
      if (res.success) setCustomerResults(res.results)
      setSearchingCustomers(false)
    }, 250)
    return () => clearTimeout(handle)
  }, [customerQuery, customerSearchOpen])

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      // 1. Hvis brugeren har en ny kontakt åben, opret den først
      let resolvedSiteContactId = siteContactId
      if (showCreateContact && newName.trim().length > 0) {
        const createRes = await createSiteContactForCase(caseId, {
          name: newName.trim(),
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
          mobile: newMobile.trim() || null,
          role: newRole,
          parentCustomerId:
            newParent === 'site' && siteCustomerId
              ? siteCustomerId
              : payingCustomerId || null,
        })
        if (!createRes.success || !createRes.contact) {
          setError(createRes.error || 'Kunne ikke oprette kontaktperson')
          setSaving(false)
          return
        }
        resolvedSiteContactId = createRes.contact.id
      }

      // 2. Opdatér sagens site-info
      const updateRes = await updateServiceCaseSiteInfo(caseId, {
        address: address.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim() || null,
        floor_door: floorDoor.trim() || null,
        access_notes: accessNotes.trim() || null,
        site_customer_id: siteCustomerId,
        site_contact_id: resolvedSiteContactId,
      })

      if (!updateRes.success) {
        setError(updateRes.error || 'Kunne ikke gemme')
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

  const handleSelectCustomer = (c: CustomerSearchResult) => {
    setSiteCustomerId(c.id)
    setSiteCustomerLabel(c.company_name)
    setCustomerSearchOpen(false)
    setCustomerQuery('')
    // Hvis kontakt nu peger på en kunde der ikke er valgt site_customer eller betaler:
    // ryd valg (brugeren skal vælge igen)
    if (siteContactId) {
      const contact = contacts.find((co) => co.id === siteContactId)
      if (contact && contact.customer_id !== c.id && contact.customer_id !== payingCustomerId) {
        setSiteContactId(null)
      }
    }
  }

  const handleClearCustomer = () => {
    setSiteCustomerId(null)
    setSiteCustomerLabel('')
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-site-info-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 id="edit-site-info-title" className="text-lg font-semibold text-gray-900">
            Rediger leveringskontakt / arbejdssted
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
          {/* A — Arbejdsadresse */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-600" />
              Arbejdsadresse
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  onSelect={(s: AddressSuggestion) => {
                    // Saml gade + husnr til ét adressefelt, og udfyld
                    // postnr/by + etage/doer automatisk. floor/door overskrives
                    // KUN hvis DAWA returnerer en vaerdi, saa eksisterende
                    // manuelt indtastet etage bevares ved postnr-skift.
                    const street = [s.street, s.houseNumber].filter(Boolean).join(' ')
                    setAddress(street)
                    setPostalCode(s.postalCode)
                    setCity(s.city)
                    const fd = [s.floor, s.door].filter(Boolean).join('. ')
                    if (fd) setFloorDoor(fd)
                  }}
                  placeholder="Adresse"
                  disabled={saving}
                  className="px-2.5 py-1.5 text-sm"
                  showIcon={false}
                />
              </div>
              <input
                type="text"
                value={floorDoor}
                onChange={(e) => setFloorDoor(e.target.value)}
                placeholder="Etage/dør"
                disabled={saving}
                className="px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
              />
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="Postnr"
                disabled={saving}
                className="px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
              />
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="By"
                disabled={saving}
                className="sm:col-span-2 px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
              />
            </div>
            <textarea
              value={accessNotes}
              onChange={(e) => setAccessNotes(e.target.value)}
              placeholder="Adgangsnoter (parkering, dørkode, hund, kontaktinfo til portner, …)"
              rows={3}
              disabled={saving}
              className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 resize-y"
            />
          </section>

          {/* B — Leveringskunde */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-blue-600" />
              Leveringskunde
            </h3>
            {siteCustomerId ? (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded p-2">
                <span className="flex-1 text-sm font-medium text-blue-900">{siteCustomerLabel}</span>
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  disabled={saving}
                  className="text-xs text-blue-700 hover:underline disabled:opacity-50"
                >
                  Fjern (= samme som betaler)
                </button>
              </div>
            ) : (
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
                Samme som betaler — ingen separat leveringskunde
              </div>
            )}

            {!customerSearchOpen ? (
              <button
                type="button"
                onClick={() => setCustomerSearchOpen(true)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
              >
                <Search className="w-3 h-3" />
                {siteCustomerId ? 'Skift leveringskunde' : 'Søg leveringskunde'}
              </button>
            ) : (
              <div className="space-y-1.5 border border-blue-200 rounded p-2 bg-blue-50/40">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Søg firmanavn, kundenr, email..."
                    disabled={saving}
                    className="flex-1 px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerSearchOpen(false)
                      setCustomerQuery('')
                      setCustomerResults([])
                    }}
                    disabled={saving}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Annullér
                  </button>
                </div>
                {searchingCustomers ? (
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Søger...
                  </div>
                ) : customerResults.length === 0 ? (
                  <div className="text-xs text-gray-500">Ingen resultater</div>
                ) : (
                  <ul className="border bg-white rounded divide-y max-h-48 overflow-y-auto">
                    {customerResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50"
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
          </section>

          {/* C — Kontaktperson på stedet */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-purple-600" />
              Kontaktperson på stedet
            </h3>

            {contactsLoading ? (
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Henter kontakter...
              </div>
            ) : (
              <select
                value={siteContactId || ''}
                onChange={(e) => setSiteContactId(e.target.value || null)}
                disabled={saving}
                className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
              >
                <option value="">— Ingen kontaktperson valgt —</option>
                {contacts.map((c) => {
                  const roleLabel = c.role ? CUSTOMER_CONTACT_ROLE_LABELS[c.role] : null
                  const parentTag = c.parent_label === 'site' ? ' [Leveringskunde]' : ' [Betaler]'
                  const label = `${c.name}${roleLabel ? ` · ${roleLabel}` : ''}${parentTag}`
                  return (
                    <option key={c.id} value={c.id}>
                      {label}
                    </option>
                  )
                })}
              </select>
            )}

            {/* D — Opret ny kontakt */}
            {!showCreateContact ? (
              <button
                type="button"
                onClick={() => setShowCreateContact(true)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border bg-gray-50 text-gray-700 border-gray-200 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 disabled:opacity-50"
              >
                <UserPlus className="w-3 h-3" />
                Opret ny kontakt
              </button>
            ) : (
              <div className="border border-purple-200 rounded p-3 bg-purple-50/40 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-purple-900">Ny kontaktperson</p>
                  <button
                    type="button"
                    onClick={() => setShowCreateContact(false)}
                    disabled={saving}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Annullér
                  </button>
                </div>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Navn *"
                  maxLength={200}
                  disabled={saving}
                  className="w-full px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Email"
                    disabled={saving}
                    className="sm:col-span-2 px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                  />
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Telefon"
                    disabled={saving}
                    className="px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                  />
                  <input
                    type="tel"
                    value={newMobile}
                    onChange={(e) => setNewMobile(e.target.value)}
                    placeholder="Mobil"
                    disabled={saving}
                    className="px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                  />
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as CustomerContactRole)}
                    disabled={saving}
                    className="px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                  >
                    {CUSTOMER_CONTACT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {CUSTOMER_CONTACT_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newParent}
                    onChange={(e) => setNewParent(e.target.value as 'paying' | 'site')}
                    disabled={saving || !siteCustomerId}
                    className="px-2.5 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 disabled:opacity-50"
                    title={
                      !siteCustomerId
                        ? 'Vælg leveringskunde først for at koble kontakt dér'
                        : 'Hvem ejer denne kontakt?'
                    }
                  >
                    <option value="site" disabled={!siteCustomerId}>
                      Tilknyt leveringskunde
                    </option>
                    <option value="paying">Tilknyt betaler</option>
                  </select>
                </div>
                <p className="text-[11px] text-gray-500 flex items-start gap-1">
                  <MailIcon className="w-3 h-3 mt-0.5" />
                  Kontakten gemmes ved klik på <strong className="ml-0.5">Gem</strong> nedenfor og kobles automatisk til sagen.
                </p>
              </div>
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
            {saving ? 'Gemmer...' : 'Gem'}
          </button>
        </div>
      </div>
    </div>
  )
}
