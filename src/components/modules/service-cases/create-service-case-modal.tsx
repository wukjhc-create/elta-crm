'use client'

import { useState } from 'react'
import { X, Building, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { DawaAddressInput, lookupPostalCode } from '@/components/shared/dawa-address-input'
import { createServiceCase } from '@/lib/actions/service-cases'
import {
  SERVICE_CASE_PRIORITIES,
  SERVICE_CASE_PRIORITY_LABELS,
  type ServiceCasePriority,
} from '@/types/service-cases.types'

interface CreateServiceCaseModalProps {
  onClose: () => void
  onCreated: () => void
  /** Forudvælg kunde (fx ved oprettelse fra kundekortet). Kan stadig ryddes i modalen. */
  defaultCustomer?: { id: string; company_name: string }
}

export function CreateServiceCaseModal({ onClose, onCreated, defaultCustomer }: CreateServiceCaseModalProps) {
  const toast = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<ServiceCasePriority>('medium')
  const [source, setSource] = useState<'email' | 'phone' | 'portal' | 'manual'>('manual')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState<Array<{ id: string; company_name: string; email: string }>>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(defaultCustomer?.id ?? null)
  const [selectedCustomerName, setSelectedCustomerName] = useState(defaultCustomer?.company_name ?? '')
  // Address fields
  const [address, setAddress] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [floorDoor, setFloorDoor] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [ksrNumber, setKsrNumber] = useState('')
  const [eanNumber, setEanNumber] = useState('')

  const searchCustomers = async (term: string) => {
    setCustomerSearch(term)
    if (term.length < 2) { setCustomers([]); return }
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase
      .from('customers')
      .select('id, company_name, email')
      .or(`company_name.ilike.%${term}%,email.ilike.%${term}%,contact_person.ilike.%${term}%`)
      .limit(8)
    setCustomers(data || [])
  }

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Fejl', 'Titel er påkrævet'); return }
    setIsSubmitting(true)
    const result = await createServiceCase({
      title: title.trim(),
      description: description.trim() || undefined,
      customer_id: selectedCustomerId,
      priority,
      source,
      address: address || undefined,
      postal_code: postalCode || undefined,
      city: city || undefined,
      floor_door: floorDoor || undefined,
      latitude: lat,
      longitude: lng,
      ksr_number: ksrNumber || undefined,
      ean_number: eanNumber || undefined,
    })
    setIsSubmitting(false)
    if (result.success) {
      toast.success('Serviceopgave oprettet', `${result.data?.case_number}`)
      onCreated()
    } else {
      toast.error('Fejl', result.error || 'Kunne ikke oprette')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Ny serviceopgave</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Beskriv kort problemet..." />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Uddybende beskrivelse..." />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kunde</label>
            {selectedCustomerId ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded-md">
                <Building className="w-4 h-4 text-gray-400" />
                <span className="flex-1">{selectedCustomerName}</span>
                <button onClick={() => { setSelectedCustomerId(null); setSelectedCustomerName(''); setCustomerSearch('') }} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <input value={customerSearch} onChange={(e) => searchCustomers(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Søg kunde..." />
                {customers.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCustomerId(c.id); setSelectedCustomerName(c.company_name); setCustomers([]) }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        <span className="font-medium">{c.company_name}</span>
                        {c.email && <span className="text-gray-500 ml-2">{c.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioritet</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ServiceCasePriority)} className="w-full px-3 py-2 border rounded-md">
                {SERVICE_CASE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{SERVICE_CASE_PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kilde</label>
              <select value={source} onChange={(e) => setSource(e.target.value as 'email' | 'phone' | 'portal' | 'manual')} className="w-full px-3 py-2 border rounded-md">
                <option value="manual">Manuel</option>
                <option value="phone">Telefon</option>
                <option value="email">Email</option>
                <option value="portal">Kundeportal</option>
              </select>
            </div>
          </div>

          {/* Address (DAWA) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <DawaAddressInput
              value={address}
              onSelect={(addr) => {
                setAddress(addr.address)
                setPostalCode(addr.postal_code)
                setCity(addr.city)
                setLat(addr.latitude)
                setLng(addr.longitude)
              }}
              onChange={setAddress}
              placeholder="Søg adresse..."
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postnr.</label>
              <input
                value={postalCode}
                onChange={async (e) => {
                  setPostalCode(e.target.value)
                  if (/^\d{4}$/.test(e.target.value)) {
                    const c = await lookupPostalCode(e.target.value)
                    if (c) setCity(c)
                  }
                }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                maxLength={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">By</label>
              <input value={city} readOnly className="w-full px-3 py-2 border rounded-md bg-gray-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Etage/dør</label>
              <input
                value={floorDoor}
                onChange={(e) => setFloorDoor(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="2. th"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">KSR-nr.</label>
              <input
                value={ksrNumber}
                onChange={(e) => setKsrNumber(e.target.value.replace(/[^\d]/g, ''))}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="6-10 cifre"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">EAN-nr.</label>
              <input
                value={eanNumber}
                onChange={(e) => setEanNumber(e.target.value.replace(/[^\d]/g, ''))}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="13 cifre"
                maxLength={13}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button onClick={onClose} className="px-4 py-2 border rounded-md hover:bg-gray-50">Annuller</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Opret sag'}
          </button>
        </div>
      </div>
    </div>
  )
}
