'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Briefcase, FilePlus2 } from 'lucide-react'
import {
  createServiceCaseFromOffer,
} from '@/lib/actions/offer-to-case'
import type { OfferStatus } from '@/types/offers.types'

interface LinkedCase {
  case_id: string
  case_number: string
}

const ALLOWED_STATUSES: ReadonlySet<OfferStatus> = new Set([
  'sent',
  'viewed',
  'accepted',
])

export function OfferToCaseCard({
  offerId,
  offerStatus,
  initialLinkedCase,
}: {
  offerId: string
  offerStatus: OfferStatus
  initialLinkedCase: LinkedCase | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [linkedCase, setLinkedCase] = useState<LinkedCase | null>(initialLinkedCase)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hide entirely on draft and on terminal states (rejected/expired) where
  // the operator should not be able to spawn a new sag.
  if (!ALLOWED_STATUSES.has(offerStatus)) return null

  // --- Linked sag exists: show "Tilknyttet sag" box ---
  if (linkedCase) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Briefcase className="w-5 h-5 text-emerald-700 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-emerald-900">
              Tilknyttet sag
            </div>
            <div className="text-sm text-emerald-800 font-mono truncate">
              {linkedCase.case_number}
            </div>
          </div>
        </div>
        <Link
          href={`/dashboard/orders/${linkedCase.case_number}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-700 text-white rounded-md hover:bg-emerald-800 shrink-0"
        >
          Åbn sag
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  // --- No linked sag yet: show "Opret sag fra tilbud" CTA ---
  const onCreate = async () => {
    setError(null)
    setIsWorking(true)
    const res = await createServiceCaseFromOffer(offerId)
    setIsWorking(false)
    if (!res.success || !res.data) {
      setError(res.error || 'Kunne ikke oprette sag')
      return
    }
    // If the action returned an existing sag (idempotency), update local
    // state so the UI flips to "Åbn sag" rather than navigating away.
    if (!res.data.created) {
      setLinkedCase({ case_id: res.data.case_id, case_number: res.data.case_number })
      return
    }
    // New sag created → navigate to it.
    startTransition(() =>
      router.push(`/dashboard/orders/${res.data!.case_number}`)
    )
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <FilePlus2 className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-blue-900">
            Opret sag fra dette tilbud
          </div>
          <div className="text-sm text-blue-800 mt-0.5">
            Opretter en ny sag (SVC-…) med kunde, titel, tilbudsnummer som
            reference og final beløb som tilbudssum.
          </div>
          {error && (
            <div className="text-sm text-red-700 mt-2">⚠ {error}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={isWorking}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 shrink-0"
      >
        {isWorking ? 'Opretter…' : 'Opret sag fra tilbud'}
      </button>
    </div>
  )
}
