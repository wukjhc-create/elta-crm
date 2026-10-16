'use client'

/**
 * O-1 (review 2026-10-16): "Hvad ville blive sendt?" — forhåndsvisning af tilbudsrykkere. Sender intet.
 * Automatisk afsendelse er slået fra, indtil Henrik godkender aktivering (OFFER_REMINDERS_LIVE).
 */
import { useState, useTransition } from 'react'
import { Eye, Loader2, AlertCircle } from 'lucide-react'
import { previewOfferRemindersAction, type OfferReminderPreview } from '@/lib/actions/offer-reminder-preview'

export function OfferReminderPreviewCard() {
  const [preview, setPreview] = useState<OfferReminderPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showExcluded, setShowExcluded] = useState(false)
  const [pending, startTransition] = useTransition()

  const run = () => {
    setError(null)
    startTransition(async () => {
      const r = await previewOfferRemindersAction().catch(() => ({ ok: false as const, error: 'Forhåndsvisningen fejlede' }))
      if (!r.ok || !('data' in r) || !r.data) { setError(r.error ?? 'Forhåndsvisningen fejlede'); return }
      setPreview(r.data)
    })
  }

  return (
    <div className="bg-white rounded-lg border p-6 space-y-4" data-testid="offer-reminder-preview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Forhåndsvisning af tilbudsrykkere</h2>
          <p className="text-sm text-gray-600 mt-1">
            Viser hvilke tilbud den daglige kørsel <strong>ville</strong> rykke — der sendes intet herfra.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg ring-1 ring-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 text-sm font-medium"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Vis hvad der ville blive sendt
        </button>
      </div>

      {preview && !preview.live && (
        <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-sm text-amber-900 flex items-start gap-2" data-testid="offer-reminder-not-live">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          Automatisk afsendelse af tilbudsrykkere er slået fra (kræver særskilt godkendelse). Kørslen registrerer kun,
          hvad den ville have sendt.
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {preview && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700" data-testid="offer-reminder-summary">
            {preview.wouldSend.length} {preview.wouldSend.length === 1 ? 'tilbud' : 'tilbud'} ville blive rykket ·
            {' '}{preview.scanned} åbne tilbud gennemgået · interval {preview.intervalDays} dage · maks. {preview.maxCount} rykkere
            · højst {preview.maxPerRun} pr. kørsel{preview.enabledInSettings ? '' : ' · rykkere slået fra i indstillingerne'}
          </p>
          {preview.wouldSend.length > 0 ? (
            <ul className="divide-y rounded-md ring-1 ring-gray-200" data-testid="offer-reminder-would-send">
              {preview.wouldSend.map((i) => (
                <li key={i.offerId} className="px-3 py-2 text-sm">
                  <p className="font-medium text-gray-900 break-words">
                    {i.offerNumber ?? '—'} · {i.title ?? ''} <span className="text-gray-500 font-normal">(rykker {i.reminderNumber})</span>
                  </p>
                  <p className="text-xs text-gray-600 break-words">
                    {i.customerName ?? 'Ukendt kunde'} → {i.recipientName ? `${i.recipientName} ` : ''}&lt;{i.recipientEmail}&gt;
                    {i.hasPortalLink ? '' : ' · uden portal-link (kunden har ingen aktiv portaladgang)'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Ingen tilbud ville blive rykket lige nu.</p>
          )}
          {preview.excludedCounts.length > 0 && (
            <div>
              <button type="button" className="text-sm text-gray-600 underline" onClick={() => setShowExcluded((v) => !v)}>
                {showExcluded ? 'Skjul' : 'Vis'} udelukkede ({preview.excluded.length})
              </button>
              {showExcluded && (
                <ul className="mt-2 space-y-1 text-xs text-gray-600" data-testid="offer-reminder-excluded">
                  {preview.excludedCounts.map((c) => (
                    <li key={c.reason}>{c.label}: {c.count}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
