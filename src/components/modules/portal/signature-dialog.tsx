'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check, RotateCcw } from 'lucide-react'
import { acceptOffer } from '@/lib/actions/portal'
import type { PortalSession, PortalOffer } from '@/types/portal.types'
import type { CompanySettings } from '@/types/company-settings.types'
import { formatCurrency } from '@/lib/utils/format'

interface SignatureDialogProps {
  token: string
  offer: PortalOffer
  session: PortalSession
  companySettings?: CompanySettings | null
  onClose: () => void
}

export function SignatureDialog({
  token,
  offer,
  session,
  companySettings,
  onClose,
}: SignatureDialogProps) {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(session.customer.contact_person)
  const [email, setEmail] = useState(session.customer.email)
  const [acceptTerms, setAcceptTerms] = useState(false)

  // Escape key handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set up canvas
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      }
    }

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handleSubmit = async () => {
    if (!hasSignature) {
      setError('Du skal underskrive tilbuddet')
      return
    }

    if (!acceptTerms) {
      setError('Du skal acceptere betingelserne')
      return
    }

    if (!name.trim() || !email.trim()) {
      setError('Navn og email er påkrævet')
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    setIsSubmitting(true)
    setError(null)

    try {
      const signatureData = canvas.toDataURL('image/png')

      const result = await acceptOffer(token, {
        offer_id: offer.id,
        signer_name: name,
        signer_email: email,
        signature_data: signatureData,
      })

      if (!result.success) {
        setError(result.error || 'Kunne ikke acceptere tilbud')
        return
      }

      router.refresh()
      onClose()
    } catch (err) {
      setError('Der opstod en fejl')
    } finally {
      setIsSubmitting(false)
    }
  }

  const currency = companySettings?.default_currency || 'DKK'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-dialog-title"
        className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 id="signature-dialog-title" className="text-xl font-bold">Accepter tilbud</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Luk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Du er ved at acceptere:</p>
            <p className="font-semibold text-lg mt-1">
              {offer.offer_number} - {offer.title}
            </p>
            <p className="text-2xl font-bold text-primary mt-2">
              {formatCurrency(offer.final_amount, currency)}
            </p>
          </div>

          {/* Name & Email */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Dit navn
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Din email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Signature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                Din underskrift
              </label>
              <button
                type="button"
                onClick={clearSignature}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
              >
                <RotateCcw className="w-4 h-4" />
                Ryd
              </button>
            </div>

            <div className="border-2 border-dashed rounded-lg overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                className="w-full touch-none cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Tegn din underskrift med musen eller fingeren
            </p>
          </div>

          {/* Terms */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">
              Jeg accepterer tilbuddets betingelser og bekræfter at jeg er
              bemyndiget til at acceptere dette tilbud på vegne af{' '}
              {session.customer.company_name}.
            </span>
          </label>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium"
            disabled={isSubmitting}
          >
            Annuller
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !hasSignature || !acceptTerms}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              'Behandler...'
            ) : (
              <>
                <Check className="w-5 h-5" />
                Accepter tilbud
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
