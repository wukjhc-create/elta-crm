'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  ArrowLeft,
  Building,
  MapPin,
  Navigation,
  Phone,
  Save,
  Loader2,
  Hash,
  Wind,
  FileSignature,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  User,
  Clock,
  Send,
  LinkIcon,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { DawaAddressInput, lookupPostalCode, type DawaAddress } from '@/components/shared/dawa-address-input'
import { WeatherWidget } from '@/components/shared/weather-widget'
import { CompletionChecklist } from '@/components/shared/completion-checklist'
import { SignaturePad } from '@/components/shared/signature-pad'
import {
  updateServiceCase,
  updateChecklist,
  initializeChecklist,
  uploadServiceCaseAttachment,
  deleteServiceCaseAttachment,
  signOffServiceCase,
  sendToOrdrestyring,
} from '@/lib/actions/service-cases'
import {
  SERVICE_CASE_STATUSES,
  SERVICE_CASE_STATUS_LABELS,
  SERVICE_CASE_STATUS_COLORS,
  SERVICE_CASE_PRIORITIES,
  SERVICE_CASE_PRIORITY_LABELS,
  SERVICE_CASE_PRIORITY_COLORS,
  DEFAULT_CHECKLIST,
  type ServiceCaseWithRelations,
  type ServiceCaseAttachment,
  type ServiceCaseStatus,
  type ServiceCasePriority,
  type ChecklistItem,
  canCloseCase,
} from '@/types/service-cases.types'

interface Props {
  serviceCase: ServiceCaseWithRelations
  attachments: ServiceCaseAttachment[]
  currentUserId: string
}

function validateKSR(value: string): string | null {
  if (!value) return null
  if (!/^\d{6,10}$/.test(value.replace(/\s/g, ''))) {
    return 'KSR-nummer skal være 6-10 cifre'
  }
  return null
}

function validateEAN(value: string): string | null {
  if (!value) return null
  const clean = value.replace(/\s/g, '')
  if (!/^\d{13}$/.test(clean)) {
    return 'EAN-nummer skal være præcis 13 cifre'
  }
  return null
}

function getGoogleMapsUrl(lat: number, lng: number, address?: string) {
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  }
  return `https://www.google.com/maps?q=${lat},${lng}`
}

function getGoogleMapsNavUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}

export function ServiceCaseDetailClient({ serviceCase: sc, attachments: initialAttachments, currentUserId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  // Form state
  const [title, setTitle] = useState(sc.title)
  const [description, setDescription] = useState(sc.description || '')
  const [status, setStatus] = useState(sc.status)
  const [priority, setPriority] = useState(sc.priority)
  const [statusNote, setStatusNote] = useState(sc.status_note || '')
  const [address, setAddress] = useState(sc.address || '')
  const [postalCode, setPostalCode] = useState(sc.postal_code || '')
  const [city, setCity] = useState(sc.city || '')
  const [floorDoor, setFloorDoor] = useState(sc.floor_door || '')
  const [latitude, setLatitude] = useState(sc.latitude)
  const [longitude, setLongitude] = useState(sc.longitude)
  const [contactPhone, setContactPhone] = useState(sc.contact_phone || '')
  const [ksrNumber, setKsrNumber] = useState(sc.ksr_number || '')
  const [eanNumber, setEanNumber] = useState(sc.ean_number || '')
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    sc.checklist && sc.checklist.length > 0 ? sc.checklist : []
  )
  const [attachments, setAttachments] = useState(initialAttachments)
  const [signatureName, setSignatureName] = useState(sc.customer_signature_name || '')
  const [showSignature, setShowSignature] = useState(false)
  const [osCaseId, setOsCaseId] = useState(sc.os_case_id)
  const [isSendingToOS, setIsSendingToOS] = useState(false)

  // Validation
  const ksrError = validateKSR(ksrNumber)
  const eanError = validateEAN(eanNumber)
  const checklistCanClose = canCloseCase(checklist)

  const handleAddressSelect = (addr: DawaAddress) => {
    setAddress(addr.address)
    setPostalCode(addr.postal_code)
    setCity(addr.city)
    setLatitude(addr.latitude)
    setLongitude(addr.longitude)
  }

  const handlePostalCodeChange = async (value: string) => {
    setPostalCode(value)
    if (/^\d{4}$/.test(value)) {
      const cityName = await lookupPostalCode(value)
      if (cityName) setCity(cityName)
    }
  }

  const handleSave = () => {
    if (ksrError || eanError) {
      toast.error('Valideringsfejl', ksrError || eanError || '')
      return
    }

    // Block closing if checklist not complete
    if (status === 'closed' && !checklistCanClose) {
      toast.error('Kan ikke lukke', 'Alle påkrævede checkliste-punkter skal udfyldes')
      return
    }

    startTransition(async () => {
      const result = await updateServiceCase(sc.id, {
        title,
        description,
        status,
        priority,
        status_note: statusNote || null,
        address: address || null,
        postal_code: postalCode || null,
        city: city || null,
        floor_door: floorDoor || null,
        latitude: latitude || null,
        longitude: longitude || null,
        contact_phone: contactPhone || null,
        ksr_number: ksrNumber || null,
        ean_number: eanNumber || null,
      })

      if (result.success) {
        toast.success('Sag opdateret')
        router.refresh()
      } else {
        toast.error('Fejl', result.error || 'Kunne ikke opdatere')
      }
    })
  }

  const handleChecklistToggle = (key: string, completed: boolean) => {
    const updated = checklist.map((item) =>
      item.key === key
        ? { ...item, completed, completed_at: completed ? new Date().toISOString() : null }
        : item
    )
    setChecklist(updated)
    // Persist immediately
    startTransition(async () => {
      await updateChecklist(sc.id, updated)
    })
  }

  const handleChecklistUpload = async (category: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('category', category)

    const result = await uploadServiceCaseAttachment(sc.id, fd)
    if (result.success && result.data) {
      setAttachments((prev) => [result.data!, ...prev])
      // Auto-check the item
      handleChecklistToggle(category, true)
      toast.success('Foto uploadet')
    } else {
      toast.error('Upload fejlede', result.error || '')
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    const result = await deleteServiceCaseAttachment(attachmentId, sc.id)
    if (result.success) {
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
      toast.success('Slettet')
    } else {
      toast.error('Fejl', result.error || '')
    }
  }

  const handleSign = async (dataUrl: string) => {
    startTransition(async () => {
      const result = await signOffServiceCase(sc.id, dataUrl, signatureName)
      if (result.success) {
        toast.success('Underskrift gemt')
        setShowSignature(false)
        router.refresh()
      } else {
        toast.error('Fejl', result.error || '')
      }
    })
  }

  const handleInitChecklist = () => {
    const items = DEFAULT_CHECKLIST.map((i) => ({ ...i }))
    setChecklist(items)
    startTransition(async () => {
      await updateChecklist(sc.id, items)
      toast.success('Checkliste oprettet')
    })
  }

  const handleSendToOrdrestyring = async () => {
    if (osCaseId) {
      toast.error('Allerede sendt', `Sagsnr. i Ordrestyring: ${osCaseId}`)
      return
    }
    if (!confirm('Er du sikker på, at du vil oprette denne sag i Ordrestyring?')) return

    setIsSendingToOS(true)
    try {
      const result = await sendToOrdrestyring(sc.id)
      if (result.success && result.data) {
        setOsCaseId(result.data.os_case_number)
        setStatus('converted')
        toast.success('Oprettet i Ordrestyring', `Sagsnr.: ${result.data.os_case_number}`)
        router.refresh()
      } else {
        toast.error('Fejl', result.error || 'Kunne ikke oprette i Ordrestyring')
      }
    } catch {
      toast.error('Fejl', 'Netværksfejl — prøv igen')
    } finally {
      setIsSendingToOS(false)
    }
  }

  const hasLocation = latitude != null && longitude != null
  const fullAddress = [address, floorDoor, `${postalCode} ${city}`.trim()].filter(Boolean).join(', ')

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/dashboard/service-cases"
          className="p-2 hover:bg-gray-100 rounded-full transition-colors mt-1"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{sc.case_number}</h1>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${SERVICE_CASE_STATUS_COLORS[sc.status]}`}>
              {SERVICE_CASE_STATUS_LABELS[sc.status]}
            </span>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${SERVICE_CASE_PRIORITY_COLORS[sc.priority]}`}>
              {SERVICE_CASE_PRIORITY_LABELS[sc.priority]}
            </span>
            {sc.signed_at && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <FileSignature className="w-3 h-3" /> Signeret
              </span>
            )}
            {osCaseId && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                <LinkIcon className="w-3 h-3" /> OS: {osCaseId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
            {sc.customer && (
              <Link href={`/dashboard/customers/${sc.customer.id}`} className="flex items-center gap-1 hover:text-primary">
                <Building className="w-3.5 h-3.5" /> {sc.customer.company_name}
              </Link>
            )}
            {sc.assignee && (
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> {sc.assignee.full_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {format(new Date(sc.created_at), 'd. MMM yyyy HH:mm', { locale: da })}
            </span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 font-medium"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Gem
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic info */}
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Sagsoplysninger</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ServiceCaseStatus)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {SERVICE_CASE_STATUSES.map((s) => (
                    <option key={s} value={s}>{SERVICE_CASE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                {status === 'closed' && !checklistCanClose && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Checkliste ufuldstændig
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioritet</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ServiceCasePriority)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {SERVICE_CASE_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{SERVICE_CASE_PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statusbesked til kunden</label>
              <input
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="F.eks. 'Tekniker på vej'"
              />
            </div>
          </div>

          {/* Address with DAWA */}
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Adresse & Lokation
              </h2>
              {hasLocation && (
                <div className="flex gap-2">
                  <a
                    href={getGoogleMapsUrl(latitude!, longitude!, fullAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md hover:bg-gray-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Kort
                  </a>
                  <a
                    href={getGoogleMapsNavUrl(latitude!, longitude!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Naviger
                  </a>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse (DAWA-opslag)</label>
              <DawaAddressInput
                value={address}
                onSelect={handleAddressSelect}
                onChange={setAddress}
                placeholder="Begynd at skrive adresse..."
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postnr.</label>
                <input
                  value={postalCode}
                  onChange={(e) => handlePostalCodeChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="2100"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">By</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-gray-50"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etage/dør/portkode</label>
                <input
                  value={floorDoor}
                  onChange={(e) => setFloorDoor(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="2. th, kode: 1234"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Kontakttelefon på stedet
              </label>
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                type="tel"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="+45 12 34 56 78"
              />
            </div>
          </div>

          {/* KSR/EAN admin fields */}
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Administrativt</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" /> KSR-nummer
                </label>
                <input
                  value={ksrNumber}
                  onChange={(e) => setKsrNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
                    ksrError ? 'border-red-300 focus:ring-red-500' : ''
                  }`}
                  placeholder="6-10 cifre"
                />
                {ksrError && <p className="text-xs text-red-500 mt-1">{ksrError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" /> EAN-nummer
                </label>
                <input
                  value={eanNumber}
                  onChange={(e) => setEanNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
                    eanError ? 'border-red-300 focus:ring-red-500' : ''
                  }`}
                  placeholder="13 cifre"
                  maxLength={16}
                />
                {eanError && <p className="text-xs text-red-500 mt-1">{eanError}</p>}
              </div>
            </div>
          </div>

          {/* Customer signature */}
          <div className="bg-white rounded-lg border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <FileSignature className="w-4 h-4" /> Kundens underskrift ved aflevering
            </h2>

            {sc.customer_signature ? (
              <div className="space-y-2">
                <div className="border rounded-lg p-4 bg-gray-50">
                  <img src={sc.customer_signature} alt="Underskrift" className="max-h-32" />
                </div>
                <div className="text-sm text-gray-600">
                  <p>Underskrevet af: <strong>{sc.customer_signature_name}</strong></p>
                  {sc.signed_at && (
                    <p>Dato: {format(new Date(sc.signed_at), 'd. MMMM yyyy HH:mm', { locale: da })}</p>
                  )}
                </div>
              </div>
            ) : showSignature ? (
              <SignaturePad
                onSign={handleSign}
                onClear={() => {}}
                signerName={signatureName}
                onNameChange={setSignatureName}
                disabled={isPending}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowSignature(true)}
                className="inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 w-full justify-center"
              >
                <FileSignature className="w-4 h-4" />
                Åbn signaturfelt
              </button>
            )}
          </div>
        </div>

        {/* Right column — weather, checklist, meta */}
        <div className="space-y-6">
          {/* Weather widget */}
          {hasLocation && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Wind className="w-4 h-4" /> Vejr på lokation
              </h2>
              <WeatherWidget latitude={latitude!} longitude={longitude!} />
            </div>
          )}

          {/* Completion checklist */}
          <div>
            {checklist.length > 0 ? (
              <CompletionChecklist
                items={checklist}
                attachments={attachments}
                onToggle={handleChecklistToggle}
                onUpload={handleChecklistUpload}
                onDeleteAttachment={handleDeleteAttachment}
                canClose={checklistCanClose}
              />
            ) : (
              <div className="bg-white rounded-lg border p-5 text-center">
                <CheckCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-3">Ingen checkliste oprettet endnu</p>
                <button
                  type="button"
                  onClick={handleInitChecklist}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90"
                >
                  Opret standard-checkliste
                </button>
              </div>
            )}
          </div>

          {/* Ordrestyring integration */}
          <div className="bg-white rounded-lg border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <Send className="w-4 h-4" /> Ordrestyring
            </h2>

            {osCaseId ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-purple-50 rounded-lg border border-purple-200">
                  <LinkIcon className="w-4 h-4 text-purple-600" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-purple-900">Sagsnr.: {osCaseId}</p>
                    {sc.os_synced_at && (
                      <p className="text-xs text-purple-600">
                        Sendt {format(new Date(sc.os_synced_at), 'd. MMM yyyy HH:mm', { locale: da })}
                      </p>
                    )}
                  </div>
                  <CheckCircle className="w-5 h-5 text-purple-500" />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Send sagen til Ordrestyring med kundedata, adresse og sagsoplysninger.
                </p>
                <button
                  type="button"
                  onClick={handleSendToOrdrestyring}
                  disabled={isSendingToOS || isPending || !sc.customer_id}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 font-medium text-sm"
                >
                  {isSendingToOS ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isSendingToOS ? 'Opretter i Ordrestyring...' : 'Opret i Ordrestyring'}
                </button>
                {!sc.customer_id && (
                  <p className="text-xs text-amber-600">Tilknyt en kunde før du kan sende til Ordrestyring</p>
                )}
              </div>
            )}
          </div>

          {/* Case meta info */}
          <div className="bg-white rounded-lg border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Info</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Sagsnr.</span>
                <span className="font-mono font-medium">{sc.case_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Kilde</span>
                <span className="capitalize">{sc.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Oprettet</span>
                <span>{format(new Date(sc.created_at), 'd. MMM yyyy', { locale: da })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Opdateret</span>
                <span>{format(new Date(sc.updated_at), 'd. MMM yyyy', { locale: da })}</span>
              </div>
              {sc.closed_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Lukket</span>
                  <span>{format(new Date(sc.closed_at), 'd. MMM yyyy', { locale: da })}</span>
                </div>
              )}
              {osCaseId && (
                <div className="flex justify-between">
                  <span className="text-gray-500">OS-sag</span>
                  <span className="font-mono font-medium text-purple-700">{osCaseId}</span>
                </div>
              )}
              {sc.customer && (
                <div className="pt-2 border-t">
                  <Link
                    href={`/dashboard/customers/${sc.customer.id}`}
                    className="text-primary hover:underline flex items-center gap-1.5"
                  >
                    <Building className="w-3.5 h-3.5" />
                    {sc.customer.company_name}
                  </Link>
                  {sc.customer.phone && (
                    <a href={`tel:${sc.customer.phone}`} className="flex items-center gap-1.5 text-gray-600 mt-1">
                      <Phone className="w-3.5 h-3.5" /> {sc.customer.phone}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
