'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileSignature, RotateCcw, Loader2, CheckCircle } from 'lucide-react'
import { submitSignedFuldmagt } from '@/lib/actions/fuldmagt'
import type { FuldmagtData } from '@/lib/actions/fuldmagt'
import { BRAND_COMPANY_NAME, BRAND_CVR } from '@/lib/brand'

interface PortalFuldmagtProps {
  token: string
  fuldmagter: FuldmagtData[]
}

export function PortalFuldmagtSection({ token, fuldmagter }: PortalFuldmagtProps) {
  const pending = fuldmagter.filter((f) => f.status === 'pending')
  const signed = fuldmagter.filter((f) => f.status === 'signed')

  if (fuldmagter.length === 0) return null

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold">Dokumenter til underskrift</h2>
          {pending.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
              {pending.length} afventer
            </span>
          )}
        </div>
      </div>

      <div className="divide-y">
        {pending.map((f) => (
          <FuldmagtForm key={f.id} token={token} fuldmagt={f} />
        ))}
        {signed.map((f) => (
          <div key={f.id} className="p-6 bg-green-50">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Fuldmagt underskrevet</p>
                <p className="text-sm text-green-600">
                  Ordrenr. {f.order_number} — underskrevet {f.signed_at ? new Date(f.signed_at).toLocaleDateString('da-DK') : ''}
                </p>
              </div>
              {f.pdf_url && (
                <a href={f.pdf_url} target="_blank" rel="noopener noreferrer"
                  className="ml-auto px-3 py-1.5 text-sm font-medium bg-white text-green-700 rounded-lg border border-green-300 hover:bg-green-100">
                  Se PDF
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FuldmagtForm({ token, fuldmagt }: { token: string; fuldmagt: FuldmagtData }) {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [foedselsdatoCvr, setFoedselsdatoCvr] = useState('')
  const [marketingSamtykke, setMarketingSamtykke] = useState<boolean | null>(null)
  const [signerName, setSignerName] = useState(fuldmagt.customer_name)

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

  const handleSubmit = async () => {
    if (!foedselsdatoCvr.trim()) {
      setError('Fødselsdato eller CVR nr. er påkrævet')
      return
    }
    if (marketingSamtykke === null) {
      setError('Vælg venligst ja eller nej til billedbrug')
      return
    }
    if (!hasSignature) {
      setError('Underskrift er påkrævet')
      return
    }
    if (!signerName.trim()) {
      setError('Navn er påkrævet')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const signatureData = canvasRef.current!.toDataURL('image/png')

      const result = await submitSignedFuldmagt(token, fuldmagt.id, {
        foedselsdato_cvr: foedselsdatoCvr,
        marketing_samtykke: marketingSamtykke,
        signature_data: signatureData,
        signer_name: signerName,
      })

      if (result.success) {
        setIsDone(true)
        router.refresh()
      } else {
        setError(result.error || 'Der opstod en fejl')
      }
    } catch {
      setError('Der opstod en fejl')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isDone) {
    return (
      <div className="p-6 bg-green-50">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <div>
            <p className="font-semibold text-green-800">Tak! Fuldmagten er underskrevet og gemt.</p>
            <p className="text-sm text-green-600">Du modtager en kopi på e-mail.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Pre-filled info */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">
          Fuldmagt — Ordrenr. {fuldmagt.order_number}
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
          <p><span className="text-gray-500 w-24 inline-block">Navn:</span> {fuldmagt.customer_name}</p>
          <p><span className="text-gray-500 w-24 inline-block">Adresse:</span> {fuldmagt.customer_address}</p>
          <p><span className="text-gray-500 w-24 inline-block">Postnr./by:</span> {fuldmagt.customer_postal_city}</p>
        </div>
      </div>

      {/* Fuldmagtstekst */}
      <div className="mb-6 bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed">
        <p className="font-medium text-gray-900 mb-2">Fuldmagtstekst:</p>
        <p>
          Undertegnede giver hermed {BRAND_COMPANY_NAME} (CVR: {BRAND_CVR}) fuldmagt
          til at handle på mine vegne i forbindelse med tilslutning af solcelleanlæg
          til elnettet, herunder:
        </p>
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>Anmeldelse og tilmelding af solcelleanlæg hos netselskabet</li>
          <li>Kommunikation med netselskab og Energinet om nettilslutning</li>
          <li>Oprettelse og administration af afregningsaftale</li>
          <li>Indsendelse af nødvendig dokumentation</li>
        </ul>
      </div>

      {/* Editable fields */}
      <div className="space-y-5">
        {/* Fødselsdato / CVR */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fødselsdato eller CVR nr. <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={foedselsdatoCvr}
            onChange={(e) => setFoedselsdatoCvr(e.target.value)}
            placeholder="f.eks. 010185-1234 eller 12345678"
            className="w-full px-4 py-3 border rounded-xl text-base focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>

        {/* Marketing samtykke */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Må {BRAND_COMPANY_NAME} bruge billeder fra dit anlæg til markedsføring? <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMarketingSamtykke(true)}
              className={`p-4 rounded-xl border-2 text-center font-semibold transition-all active:scale-95 ${
                marketingSamtykke === true
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              Ja
            </button>
            <button
              type="button"
              onClick={() => setMarketingSamtykke(false)}
              className={`p-4 rounded-xl border-2 text-center font-semibold transition-all active:scale-95 ${
                marketingSamtykke === false
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              Nej
            </button>
          </div>
        </div>

        {/* Signer name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dit fulde navn <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="w-full px-4 py-3 border rounded-xl text-base focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>

        {/* Signature */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Underskrift <span className="text-red-500">*</span>
            </label>
            <button type="button" onClick={clearSig}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
              <RotateCcw className="w-4 h-4" /> Ryd
            </button>
          </div>
          <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-white">
            <canvas ref={canvasRef} width={500} height={180}
              className="w-full touch-none cursor-crosshair"
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
          </div>
          <p className="text-xs text-gray-400 mt-1">Tegn din underskrift med fingeren eller musen</p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-4 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-700 disabled:opacity-50 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Behandler...</>
          ) : (
            <><FileSignature className="w-5 h-5" /> Underskriv fuldmagt</>
          )}
        </button>
      </div>
    </div>
  )
}
