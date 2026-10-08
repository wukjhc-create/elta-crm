'use client'

/**
 * 00203 (staging): revisioner på tilbudssiden — "Ny revision" for sendte tilbud (den sendte version forbliver
 * uændret) + historik over revisionskæden. Vises kun når OFFER_REVISIONS_ENABLED er slået til (server-prop).
 */
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GitBranch, History } from 'lucide-react'
import { createOfferRevisionAction, getOfferRevisionHistoryAction } from '@/lib/actions/offers'
import { OFFER_STATUS_LABELS, type OfferStatus } from '@/types/offers.types'

type Rev = { id: string; offer_number: string; revision_number: number; status: string; superseded_at: string | null; snapshot_sent_at: string | null }

const REVISABLE = new Set(['sent', 'viewed', 'rejected', 'expired'])

export function OfferRevisionsPanel({ offerId, status, supersededBy }: { offerId: string; status: string; supersededBy: string | null }) {
  const router = useRouter()
  const [revs, setRevs] = useState<Rev[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    getOfferRevisionHistoryAction(offerId).then((r) => { if (r.success && r.data) setRevs(r.data) })
  }, [offerId])

  const canRevise = REVISABLE.has(status) && !supersededBy
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }) : '—')

  return (
    <div className="bg-white rounded-lg border p-4 space-y-3" data-testid="offer-revisions">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><History className="w-4 h-4" /> Revisioner</h3>
        {canRevise && (
          <button
            data-testid="offer-new-revision"
            disabled={pending}
            onClick={() => startTransition(async () => {
              setError(null)
              const r = await createOfferRevisionAction(offerId)
              if (!r.success || !r.data) { setError(r.error ?? 'Kunne ikke oprette revision'); return }
              router.push(`/dashboard/offers/${r.data.id}`)
            })}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border hover:bg-gray-50 disabled:opacity-50"
          >
            <GitBranch className="w-4 h-4" /> Ny revision
          </button>
        )}
      </div>
      {supersededBy && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2" data-testid="offer-superseded">
          Denne revision er afløst af en nyere — kunden ser kun den gældende version.{' '}
          <a className="underline" href={`/dashboard/offers/${supersededBy}`}>Åbn gældende revision</a>
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {revs.length > 0 ? (
        <ul className="text-sm divide-y">
          {revs.map((r) => (
            <li key={r.id} className="py-1.5 flex items-center justify-between gap-2">
              <a href={`/dashboard/offers/${r.id}`} className={r.id === offerId ? 'font-semibold' : 'text-blue-700 hover:underline'}>
                Rev. {r.revision_number} · {r.offer_number}
              </a>
              <span className="text-gray-500">
                {OFFER_STATUS_LABELS[r.status as OfferStatus] ?? r.status}
                {r.snapshot_sent_at ? ` · sendt ${fmt(r.snapshot_sent_at)}` : ''}
                {r.superseded_at ? ` · afløst ${fmt(r.superseded_at)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">Ingen revisioner endnu — det sendte indhold gemmes uforanderligt ved afsendelse.</p>
      )}
    </div>
  )
}
