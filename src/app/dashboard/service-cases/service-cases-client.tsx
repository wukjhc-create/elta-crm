'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  Plus,
  Search,
  X,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building,
  User,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { DawaAddressInput, lookupPostalCode, type DawaAddress } from '@/components/shared/dawa-address-input'
import { createServiceCase, updateServiceCase, deleteServiceCase } from '@/lib/actions/service-cases'
import {
  SERVICE_CASE_STATUSES,
  SERVICE_CASE_STATUS_LABELS,
  SERVICE_CASE_STATUS_COLORS,
  SERVICE_CASE_PRIORITIES,
  SERVICE_CASE_PRIORITY_LABELS,
  SERVICE_CASE_PRIORITY_COLORS,
  type ServiceCaseWithRelations,
  type ServiceCaseStatus,
  type ServiceCasePriority,
} from '@/types/service-cases.types'

interface PaginationData {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}

interface Filters {
  search?: string
  status?: ServiceCaseStatus
  priority?: ServiceCasePriority
}

interface Stats {
  total: number
  new: number
  in_progress: number
  pending: number
  closed: number
  converted: number
}

interface ServiceCasesClientProps {
  cases: ServiceCaseWithRelations[]
  pagination: PaginationData
  filters: Filters
  stats: Stats
}

export function ServiceCasesClient({ cases, pagination, filters, stats }: ServiceCasesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchInput, setSearchInput] = useState(filters.search || '')
  const [editingCase, setEditingCase] = useState<ServiceCaseWithRelations | null>(null)

  const updateURL = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === '') params.delete(key)
        else params.set(key, value)
      })
      if (updates.search !== undefined || updates.status !== undefined || updates.priority !== undefined) {
        params.delete('page')
      }
      router.push(`/dashboard/service-cases?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleSearch = () => updateURL({ search: searchInput || undefined })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Serviceopgaver</h1>
          <p className="text-gray-600 mt-1">
            {stats.total} sager — {stats.new} nye, {stats.in_progress} i gang, {stats.pending} afventer
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 font-medium"
        >
          <Plus className="w-4 h-4" />
          Ny serviceopgave
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => updateURL({ status: undefined })}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            !filters.status ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Alle ({stats.total})
        </button>
        {SERVICE_CASE_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => updateURL({ status: s })}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              filters.status === s ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {SERVICE_CASE_STATUS_LABELS[s]} ({stats[s as keyof Stats] ?? 0})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Søg i sagsnr., titel..."
            className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {filters.search && (
          <button
            onClick={() => { setSearchInput(''); updateURL({ search: undefined }) }}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-600 border rounded-md hover:bg-gray-50"
          >
            <X className="w-3 h-3" /> Ryd søgning
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 text-sm">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Sagsnr.</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Titel</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Kunde</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Prioritet</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Oprettet</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Handlinger</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cases.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Ingen serviceopgaver fundet</p>
                </td>
              </tr>
            ) : (
              cases.map((sc) => (
                <tr key={sc.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/dashboard/service-cases/${sc.id}`)}>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{sc.case_number}</td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900 truncate max-w-xs">{sc.title}</p>
                    {sc.description && <p className="text-xs text-gray-500 truncate max-w-xs mt-0.5">{sc.description}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {sc.customer ? (
                      <span className="flex items-center gap-1 text-gray-700">
                        <Building className="w-3 h-3" />
                        {sc.customer.company_name}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SERVICE_CASE_STATUS_COLORS[sc.status]}`}>
                      {SERVICE_CASE_STATUS_LABELS[sc.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SERVICE_CASE_PRIORITY_COLORS[sc.priority]}`}>
                      {SERVICE_CASE_PRIORITY_LABELS[sc.priority]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {format(new Date(sc.created_at), 'd. MMM yyyy', { locale: da })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <select
                      onClick={(e) => e.stopPropagation()}
                      value={sc.status}
                      onChange={async (e) => {
                        try {
                          const result = await updateServiceCase(sc.id, { status: e.target.value as ServiceCaseStatus })
                          if (result.success) {
                            toast.success('Status opdateret')
                            router.refresh()
                          } else {
                            toast.error('Fejl', result.error || 'Kunne ikke opdatere status')
                          }
                        } catch {
                          toast.error('Fejl', 'Netværksfejl — prøv igen')
                        }
                      }}
                      className="text-xs border rounded px-2 py-1"
                    >
                      {SERVICE_CASE_STATUSES.map((s) => (
                        <option key={s} value={s}>{SERVICE_CASE_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Side {pagination.currentPage} af {pagination.totalPages} ({pagination.totalItems} sager)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => updateURL({ page: String(pagination.currentPage - 1) })}
              disabled={pagination.currentPage <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Forrige
            </button>
            <button
              onClick={() => updateURL({ page: String(pagination.currentPage + 1) })}
              disabled={pagination.currentPage >= pagination.totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md disabled:opacity-50"
            >
              Næste <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateServiceCaseModal onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); router.refresh() }} />
      )}

      {/* Edit is now on detail page /service-cases/[id] */}
    </div>
  )
}

// =====================================================
// Create Modal
// =====================================================

function CreateServiceCaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<ServiceCasePriority>('medium')
  const [source, setSource] = useState<'email' | 'phone' | 'portal' | 'manual'>('manual')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState<Array<{ id: string; company_name: string; email: string }>>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedCustomerName, setSelectedCustomerName] = useState('')
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

// =====================================================
// Edit Modal
// =====================================================

function EditServiceCaseModal({
  serviceCase,
  onClose,
  onUpdated,
  onDeleted,
}: {
  serviceCase: ServiceCaseWithRelations
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
}) {
  const toast = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [title, setTitle] = useState(serviceCase.title)
  const [description, setDescription] = useState(serviceCase.description || '')
  const [status, setStatus] = useState(serviceCase.status)
  const [priority, setPriority] = useState(serviceCase.priority)
  const [statusNote, setStatusNote] = useState(serviceCase.status_note || '')

  const handleSave = async () => {
    setIsSubmitting(true)
    const result = await updateServiceCase(serviceCase.id, {
      title,
      description,
      status,
      priority,
      status_note: statusNote || null,
    })
    setIsSubmitting(false)
    if (result.success) {
      toast.success('Opdateret')
      onUpdated()
    } else {
      toast.error('Fejl', result.error || 'Kunne ikke opdatere')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Er du sikker på, at du vil slette denne serviceopgave?')) return
    try {
      const result = await deleteServiceCase(serviceCase.id)
      if (result.success) {
        toast.success('Slettet')
        onDeleted()
      } else {
        toast.error('Fejl', result.error || 'Kunne ikke slette serviceopgave')
      }
    } catch {
      toast.error('Fejl', 'Netværksfejl — prøv igen')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">{serviceCase.case_number}</h2>
            {serviceCase.customer && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <Building className="w-3 h-3" />
                <Link href={`/dashboard/customers/${serviceCase.customer.id}`} className="hover:underline text-primary" onClick={(e) => e.stopPropagation()}>
                  {serviceCase.customer.company_name}
                </Link>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ServiceCaseStatus)} className="w-full px-3 py-2 border rounded-md">
                {SERVICE_CASE_STATUSES.map((s) => (
                  <option key={s} value={s}>{SERVICE_CASE_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioritet</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ServiceCasePriority)} className="w-full px-3 py-2 border rounded-md">
                {SERVICE_CASE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{SERVICE_CASE_PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statusbesked til kunden</label>
            <input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="F.eks. 'Tekniker på vej' eller 'Afventer reservedele'" />
          </div>
        </div>

        <div className="flex justify-between gap-3 mt-6 pt-4 border-t">
          <button onClick={handleDelete} className="px-4 py-2 text-red-600 border border-red-300 rounded-md hover:bg-red-50 text-sm">Slet</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border rounded-md hover:bg-gray-50">Annuller</button>
            <button onClick={handleSave} disabled={isSubmitting} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gem ændringer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
