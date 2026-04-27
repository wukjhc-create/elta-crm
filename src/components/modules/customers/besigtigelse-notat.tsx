'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ClipboardCheck,
  Save,
  Send,
  RotateCcw,
  Loader2,
  CheckCircle,
  Download,
  Camera,
  X,
} from 'lucide-react'
import { saveBesigtigelsesnotat, sendBesigtigelsePdf } from '@/lib/actions/besigtigelse'
import type { CustomerWithRelations } from '@/types/customers.types'
import { useToast } from '@/components/ui/toast'

interface BesigtigelsesNotatProps {
  customer: CustomerWithRelations
}

export interface BesigtigelseFormData {
  // Tag & Montering
  tagType: string
  tagHaeldning: string
  tagAreal: string
  tagRetning: string
  tagStand: string
  skyggeforhold: string
  // Eltavle & Installation
  eltavleStatus: string
  eltavlePlads: string
  inverterPlacering: string
  internetSignal: string
  malerNr: string
  sikringsstoerrelse: string
  jordingStatus: string
  // Netværk
  netvaerkSSID: string
  netvaerkPassword: string
  // Kabelføring
  acKabelvej: string
  dcKabelvej: string
  kabelvej: string
  // Særlige aftaler
  saerligeAftaler: string
  // Underskrift
  signatureData: string | null
  signerName: string
}

interface ImageUpload {
  file: File
  preview: string
  category: 'eltavle' | 'tag' | 'inverter' | 'ac-foering' | 'dc-foering' | 'andet'
}

const EMPTY_FORM: BesigtigelseFormData = {
  tagType: '', tagHaeldning: '', tagAreal: '', tagRetning: '', tagStand: '',
  skyggeforhold: '', eltavleStatus: '', eltavlePlads: '', inverterPlacering: '',
  internetSignal: '', malerNr: '', sikringsstoerrelse: '',
  jordingStatus: '', netvaerkSSID: '', netvaerkPassword: '',
  acKabelvej: '', dcKabelvej: '', kabelvej: '',
  saerligeAftaler: '', signatureData: null, signerName: '',
}

export function BesigtigelsesNotat({ customer }: BesigtigelsesNotatProps) {
  const router = useRouter()
  const toast = useToast()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [images, setImages] = useState<ImageUpload[]>([])

  const [form, setForm] = useState<BesigtigelseFormData>({
    ...EMPTY_FORM,
    signerName: customer.contact_person || '',
  })

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy }
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getCoords(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getCoords(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }
  const stopDraw = () => setIsDrawing(false)
  const clearSig = () => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!ctx || !c) return
    ctx.clearRect(0, 0, c.width, c.height)
    setHasSignature(false)
  }

  const set = (field: keyof BesigtigelseFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const addImage = (category: ImageUpload['category'], files: FileList | null) => {
    if (!files) return
    const newImages: ImageUpload[] = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      category,
    }))
    setImages((prev) => [...prev, ...newImages])
  }

  const removeImage = (idx: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleSave = async (sendToCustomer = false) => {
    if (sendToCustomer) setIsSending(true)
    else setIsSaving(true)

    try {
      let signatureData: string | null = null
      if (hasSignature && canvasRef.current) {
        signatureData = canvasRef.current.toDataURL('image/png')
      }

      // Convert images to base64
      const imageData: { category: string; base64: string; name: string }[] = []
      for (const img of images) {
        const buf = await img.file.arrayBuffer()
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        imageData.push({
          category: img.category,
          base64: `data:${img.file.type};base64,${b64}`,
          name: img.file.name,
        })
      }

      const result = await saveBesigtigelsesnotat({
        customerId: customer.id,
        formData: { ...form, signatureData },
        images: imageData,
        sendToCustomer,
      })

      if (result.success && result.data) {
        setSavedId(result.data.id)
        setPdfUrl(result.data.pdfUrl)
        toast.success(
          sendToCustomer
            ? 'Besigtigelsesrapport gemt og sendt til kunden'
            : 'Besigtigelsesrapport gemt og PDF genereret'
        )
        router.refresh()
      } else {
        toast.error('Kunne ikke gemme', result.error)
      }
    } catch {
      toast.error('Der opstod en fejl')
    } finally {
      setIsSaving(false)
      setIsSending(false)
    }
  }

  const fullAddress = [
    customer.shipping_address || customer.billing_address,
    customer.shipping_postal_code || customer.billing_postal_code,
    customer.shipping_city || customer.billing_city,
  ].filter(Boolean).join(', ')

  // Inline camera button for a section
  const CameraBtn = ({ category, label }: { category: ImageUpload['category']; label: string }) => {
    const count = images.filter((i) => i.category === category).length
    return (
      <button
        type="button"
        onClick={() => fileInputRefs.current[category]?.click()}
        className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[50px] sm:min-h-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm sm:text-xs font-medium bg-gray-100 text-gray-700 rounded-xl sm:rounded-lg hover:bg-green-50 hover:text-green-700 active:scale-95 transition-all touch-manipulation"
      >
        <span className="text-lg sm:text-sm">📷</span>
        {label}
        {count > 0 && <span className="ml-1 px-2 py-0.5 bg-green-600 text-white rounded-full text-xs sm:text-[10px] leading-none font-bold">{count}</span>}
        <input
          ref={(el) => { fileInputRefs.current[category] = el }}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={(e) => addImage(category, e.target.files)}
        />
      </button>
    )
  }

  // Image thumbnails for a category
  const ImageThumbs = ({ category }: { category: ImageUpload['category'] }) => {
    const catImages = images.filter((i) => i.category === category)
    if (catImages.length === 0) return null
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {catImages.map((img) => {
          const globalIdx = images.indexOf(img)
          return (
            <div key={globalIdx} className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border bg-gray-50">
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(globalIdx)}
                className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  const Select = ({ label, value, field, options }: {
    label: string; value: string; field: keyof BesigtigelseFormData; options: string[]
  }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => set(field, e.target.value)}
        className="w-full px-3 py-3 sm:py-2.5 min-h-[50px] sm:min-h-0 border rounded-xl sm:rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white appearance-none"
      >
        <option value="">Vælg...</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  const Input = ({ label, field, placeholder, inputMode, autoComplete }: {
    label: string; field: keyof BesigtigelseFormData; placeholder?: string
    inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url'
    autoComplete?: string
  }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        inputMode={inputMode || 'text'}
        autoComplete={autoComplete || 'off'}
        value={form[field] as string}
        onChange={(e) => set(field, e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-3 sm:py-2.5 min-h-[50px] sm:min-h-0 border rounded-xl sm:rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
      />
    </div>
  )

  return (
    <div className="bg-white rounded-lg border">
      {/* Header — sticky on mobile */}
      <div className="p-3 sm:p-6 border-b sticky top-0 bg-white z-10 rounded-t-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-green-600" />
            <h2 className="text-base sm:text-lg font-semibold">Besigtigelsesrapport</h2>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[50px] sm:min-h-0 sm:py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-xl sm:rounded-lg hover:bg-gray-200 active:scale-95 transition-transform touch-manipulation">
                <Download className="w-4 h-4" /> PDF
              </a>
            )}
            <button onClick={() => handleSave(false)} disabled={isSaving || isSending}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[50px] sm:min-h-0 sm:py-2 text-sm font-bold bg-green-600 text-white rounded-xl sm:rounded-lg hover:bg-green-700 disabled:opacity-50 active:scale-95 transition-transform touch-manipulation">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Gem
            </button>
            <button onClick={() => handleSave(true)} disabled={isSaving || isSending}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[50px] sm:min-h-0 sm:py-2 text-sm font-bold bg-blue-600 text-white rounded-xl sm:rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-transform touch-manipulation">
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-6">
        {/* Success */}
        {savedId && (
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">Rapport gemt og PDF genereret</p>
              <p className="text-xs text-green-600">Arkiveret under kundens dokumenter. Opgaven er markeret som udført.</p>
            </div>
          </div>
        )}

        {/* STAMDATA */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Stamdata</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50 rounded-lg p-3">
            <div><p className="text-xs text-gray-500">Firma</p><p className="font-medium text-sm">{customer.company_name}</p></div>
            <div><p className="text-xs text-gray-500">Kontaktperson</p><p className="font-medium text-sm">{customer.contact_person || '—'}</p></div>
            <div><p className="text-xs text-gray-500">E-mail</p><p className="font-medium text-sm">{customer.email}</p></div>
            <div><p className="text-xs text-gray-500">Telefon</p><p className="font-medium text-sm">{customer.phone || customer.mobile || '—'}</p></div>
            <div className="sm:col-span-2"><p className="text-xs text-gray-500">Adresse</p><p className="font-medium text-sm">{fullAddress || '—'}</p></div>
          </div>
        </section>

        {/* TAG & MONTERING */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tag & Montering</h3>
            <CameraBtn category="tag" label="Tag billede" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Select label="Tagtype" value={form.tagType} field="tagType" options={[
              'Tegl (røde/sorte sten)', 'Betontagsten', 'Eternit/fibercement',
              'Stål/trapezplade', 'Tagpap (fladt tag)', 'Skifer', 'Andet',
            ]} />
            <Select label="Taghældning" value={form.tagHaeldning} field="tagHaeldning" options={[
              'Fladt (0-5°)', 'Lav (5-15°)', 'Medium (15-30°)', 'Stejlt (30-45°)', 'Meget stejlt (45°+)',
            ]} />
            <Input label="Tag-areal (m²)" field="tagAreal" placeholder="f.eks. 120" inputMode="decimal" />
            <Select label="Tag-retning" value={form.tagRetning} field="tagRetning" options={[
              'Syd', 'Sydøst', 'Sydvest', 'Øst', 'Vest', 'Øst/Vest split', 'Nord', 'Fladt tag',
            ]} />
            <Select label="Tag-stand" value={form.tagStand} field="tagStand" options={[
              'God stand', 'Acceptabel', 'Slidte tagsten — udskiftning anbefales', 'Nyt tag nødvendigt',
            ]} />
            <Select label="Skyggeforhold" value={form.skyggeforhold} field="skyggeforhold" options={[
              'Ingen skygge', 'Let skygge (morgen/aften)', 'Delvis skygge (træer/bygninger)',
              'Betydelig skygge — optimering nødvendig',
            ]} />
          </div>
          <ImageThumbs category="tag" />
        </section>

        {/* ELTAVLE & INSTALLATION */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Eltavle & Installation</h3>
            <CameraBtn category="eltavle" label="Tag billede" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Select label="Eltavle status" value={form.eltavleStatus} field="eltavleStatus" options={[
              'God stand — klar til udvidelse', 'Acceptabel — mindre opgradering',
              'Skal udskiftes/opgraderes', 'Ikke besigtiget',
            ]} />
            <Select label="Plads i eltavle" value={form.eltavlePlads} field="eltavlePlads" options={[
              'Tilstrækkelig plads', 'Begrænset — behov for udvidelse', 'Ingen plads — ny tavle nødvendig',
            ]} />
            <Input label="Målernr." field="malerNr" placeholder="Aflæs fra måleren" />
            <Select label="Sikringsstørrelse" value={form.sikringsstoerrelse} field="sikringsstoerrelse" options={[
              '16A', '20A', '25A', '32A', '40A', '50A', '63A', 'Ukendt',
            ]} />
            <Select label="Jording" value={form.jordingStatus} field="jordingStatus" options={[
              'TN-system (god)', 'TT-system', 'Jordspyd påkrævet', 'Mangelfuld — udbedring nødvendig', 'Ukendt',
            ]} />
            <Select label="Internet/signal" value={form.internetSignal} field="internetSignal" options={[
              'Godt WiFi-signal', 'Svagt WiFi — repeater anbefales', 'Intet WiFi — LAN nødvendigt',
              'Mobilt signal OK', 'Intet signal',
            ]} />
          </div>
          <ImageThumbs category="eltavle" />
        </section>

        {/* NETVÆRK */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Netværk (til inverter)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Netværksnavn (SSID)" field="netvaerkSSID" placeholder="WiFi-netværkets navn" />
            <Input label="Netværkskode (password)" field="netvaerkPassword" placeholder="WiFi-adgangskode" />
          </div>
        </section>

        {/* AC KABELFØRING */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AC Kabelføring</h3>
            <CameraBtn category="ac-foering" label="Tag billede af AC-vej" />
          </div>
          <textarea value={form.acKabelvej} onChange={(e) => set('acKabelvej', e.target.value)}
            placeholder="Beskriv AC-kabelvejen fra inverter til eltavle..."
            rows={3} className="w-full px-3 py-3 sm:py-2.5 min-h-[50px] border rounded-xl sm:rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none" />
          <ImageThumbs category="ac-foering" />
        </section>

        {/* DC KABELFØRING */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">DC Kabelføring</h3>
            <CameraBtn category="dc-foering" label="Tag billede af DC-vej" />
          </div>
          <textarea value={form.dcKabelvej} onChange={(e) => set('dcKabelvej', e.target.value)}
            placeholder="Beskriv DC-kabelvejen fra solceller til inverter..."
            rows={3} className="w-full px-3 py-3 sm:py-2.5 min-h-[50px] border rounded-xl sm:rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none" />
          <ImageThumbs category="dc-foering" />
        </section>

        {/* INVERTER PLACERING */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inverter placering</h3>
            <CameraBtn category="inverter" label="Tag billede" />
          </div>
          <Select label="Placering" value={form.inverterPlacering} field="inverterPlacering" options={[
            'Garage/carport', 'Bryggers/teknikrum', 'Kælder', 'Loft/tagrum',
            'Udendørs (nordvendt)', 'Ved eltavle', 'Aftales ved installation',
          ]} />
          <ImageThumbs category="inverter" />
        </section>

        {/* ANDET BILLEDER */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Andre billeder</h3>
            <CameraBtn category="andet" label="Tag billede" />
          </div>
          <ImageThumbs category="andet" />
        </section>

        {/* SÆRLIGE AFTALER */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Særlige aftaler & noter</h3>
          <textarea value={form.saerligeAftaler} onChange={(e) => set('saerligeAftaler', e.target.value)}
            placeholder="Eventuelle aftaler, krav, adgangsforhold, tidsplaner..."
            rows={4} className="w-full px-3 py-3 sm:py-2.5 min-h-[50px] border rounded-xl sm:rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none" />
        </section>

        {/* UNDERSKRIFT */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Kundens underskrift</h3>
          <div className="space-y-3">
            <div className="max-w-sm">
              <label className="block text-xs font-medium text-gray-600 mb-1">Navn</label>
              <input type="text" value={form.signerName} onChange={(e) => set('signerName', e.target.value)}
                className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">Underskrift</label>
                <button type="button" onClick={clearSig} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
                  <RotateCcw className="w-3.5 h-3.5" /> Ryd
                </button>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white" style={{ maxWidth: 500 }}>
                <canvas ref={canvasRef} width={500} height={160}
                  className="w-full touch-none cursor-crosshair"
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
              </div>
              <p className="text-xs text-gray-400 mt-1">Tegn underskrift med mus eller finger</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
