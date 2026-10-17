'use client'

/**
 * ES-3 (e-sign-review 2026-10-17): underskriftsbevis for et accepteret tilbud — hvem, hvornår (dansk tid), fra hvilken
 * IP, og selve underskriften. Vises kun for accepterede tilbud; data hentes bag offers.view.
 */
import { useEffect, useState } from 'react'
import { PenLine } from 'lucide-react'
import { getOfferSignatureAction, type OfferSignatureEvidence } from '@/lib/actions/offer-signature'

export function OfferSignatureCard({ offerId }: { offerId: string }) {
  const [sig, setSig] = useState<OfferSignatureEvidence | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    getOfferSignatureAction(offerId).then((res) => {
      if (!alive) return
      if (!res.success) { setState('error'); return }
      setSig(res.data ?? null)
      setState(res.data ? 'ready' : 'none')
    })
    return () => { alive = false }
  }, [offerId])

  if (state === 'loading') return null
  return (
    <div className="bg-white rounded-lg border p-4" data-testid="offer-signature-card">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <PenLine className="w-4 h-4 text-green-600" />
        Digital underskrift
      </h3>
      {state === 'error' && <p className="text-sm text-red-600">Underskriften kunne ikke hentes.</p>}
      {state === 'none' && (
        <p className="text-sm text-gray-600">Ingen digital underskrift registreret (fx accepteret telefonisk eller manuelt i systemet).</p>
      )}
      {state === 'ready' && sig && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3"><span className="text-gray-500">Underskrevet af</span><span className="text-right">{sig.signer_name}</span></div>
          <div className="flex justify-between gap-3"><span className="text-gray-500">E-mail</span><span className="text-right break-all">{sig.signer_email}</span></div>
          {sig.signed_at && (
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Tidspunkt</span>
              <span className="text-right">{new Date(sig.signed_at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}</span>
            </div>
          )}
          {sig.signer_ip && <div className="flex justify-between gap-3"><span className="text-gray-500">IP-adresse</span><span className="text-right">{sig.signer_ip}</span></div>}
          {sig.signature_data && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sig.signature_data} alt={`Underskrift af ${sig.signer_name}`} className="mt-2 max-h-28 w-auto rounded border bg-white" data-testid="offer-signature-image" />
          )}
        </div>
      )}
    </div>
  )
}
