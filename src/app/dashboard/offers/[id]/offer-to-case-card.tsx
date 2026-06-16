'use client'

/**
 * Sprint 3B + Ø7.0 — "Opret sag fra tilbud" med cost-free preview.
 *
 * Viser FØR oprettelse: kunde, sagspartnere, adresse, tilbudsnr/-sum, sagstype,
 * dokumenter der følger med, og hvad der IKKE følger med. Salgssum vises;
 * ALDRIG intern kost/margin. Konvertering er gated + dublet-sikret server-side.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight, Briefcase, FilePlus2, FileText, Loader2, AlertTriangle, Info, CheckCircle2,
} from 'lucide-react'
import {
  createServiceCaseFromOffer,
  getOfferConversionPreview,
  type OfferConversionPreview,
} from '@/lib/actions/offer-to-case'
import type { OfferStatus } from '@/types/offers.types'

interface LinkedCase {
  case_id: string
  case_number: string
}

const ALLOWED_STATUSES: ReadonlySet<OfferStatus> = new Set(['sent', 'viewed', 'accepted'])

function kr(n: number | null, ccy: string | null): string {
  if (n === null) return '—'
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: ccy || 'DKK', maximumFractionDigits: 0 }).format(n)
}

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
  const [preview, setPreview] = useState<OfferConversionPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Hent preview når der ikke allerede er en koblet sag og status tillader det.
  useEffect(() => {
    if (linkedCase || !ALLOWED_STATUSES.has(offerStatus)) return
    let alive = true
    setLoadingPreview(true)
    getOfferConversionPreview(offerId)
      .then((res) => { if (alive && res.success && res.data) setPreview(res.data) })
      .finally(() => { if (alive) setLoadingPreview(false) })
    return () => { alive = false }
  }, [offerId, offerStatus, linkedCase])

  if (!ALLOWED_STATUSES.has(offerStatus)) return null

  // --- Linked sag exists ---
  if (linkedCase) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Briefcase className="w-5 h-5 text-emerald-700 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-emerald-900">Tilknyttet sag</div>
            <div className="text-sm text-emerald-800 font-mono truncate">{linkedCase.case_number}</div>
          </div>
        </div>
        <Link
          href={`/dashboard/orders/${linkedCase.case_number}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-700 text-white rounded-md hover:bg-emerald-800 shrink-0"
        >
          Åbn sag <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  const onCreate = async () => {
    setError(null)
    setIsWorking(true)
    const res = await createServiceCaseFromOffer(offerId)
    setIsWorking(false)
    if (!res.success || !res.data) {
      setError(res.error || 'Kunne ikke oprette sag')
      return
    }
    if (!res.data.created) {
      setLinkedCase({ case_id: res.data.case_id, case_number: res.data.case_number })
      return
    }
    startTransition(() => router.push(`/dashboard/orders/${res.data!.case_number}`))
  }

  const canConvert = preview ? preview.can_convert : true

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FilePlus2 className="w-5 h-5 text-blue-700 shrink-0" />
        <div className="text-sm font-semibold text-blue-900">Opret sag fra dette tilbud</div>
      </div>

      {loadingPreview ? (
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter preview…
        </div>
      ) : preview ? (
        <div className="rounded-md bg-white/70 border border-blue-100 p-3 text-sm text-gray-700 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Field label="Tilbud" value={preview.offer_number ?? '—'} mono />
            <Field label="Tilbudssum" value={kr(preview.offer_sum, preview.currency)} />
            <Field label="Kunde" value={preview.customer_name ?? '—'} />
            <Field label="Sagstype" value={preview.expected_case_type} />
            <Field label="Arbejdstitel" value={preview.work_title ?? '—'} />
            <Field label="Adresse" value={preview.address ?? '—'} />
          </div>

          <div className="border-t border-blue-100 pt-2">
            <div className="text-xs font-medium text-gray-500 mb-1">Sagspartnere</div>
            {preview.parties.map((p) => (
              <div key={p.role} className="flex justify-between text-xs">
                <span className="text-gray-500">{p.role}</span>
                <span className="text-gray-800">{p.name ?? '—'}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-blue-100 pt-2">
            <div className="text-xs font-medium text-gray-500 mb-1">
              Dokumenter der følger med ({preview.documents_following.length})
            </div>
            {preview.documents_following.length === 0 ? (
              <div className="text-xs text-gray-400">Ingen dokumenter koblet til tilbuddet.</div>
            ) : (
              preview.documents_following.map((d) => (
                <div key={d.id} className="flex items-center gap-1 text-xs text-gray-700">
                  <FileText className="w-3 h-3 text-gray-400" /> {d.title ?? 'Dokument'}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-blue-100 pt-2">
            <div className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
              <Info className="w-3 h-3" /> Følger IKKE med
            </div>
            <ul className="list-disc list-inside text-xs text-gray-500 space-y-0.5">
              {preview.not_included.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>

          {preview.warnings.length > 0 && (
            <div className="border-t border-amber-200 pt-2">
              {preview.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1 text-xs text-amber-700">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-blue-800">
          Opretter en ny sag (SVC-…) med kunde, sagspartnere, tilbudsnummer som reference og tilbudssum som kontraktsum.
        </div>
      )}

      {error && <div className="text-sm text-red-700">⚠ {error}</div>}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Dublet-sikret — samme tilbud kan ikke konverteres to gange.
        </span>
        <button
          type="button"
          onClick={onCreate}
          disabled={isWorking || !canConvert}
          title={!canConvert ? 'Tilbuddet mangler data (fx kunde) eller er ikke klar' : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 shrink-0"
        >
          {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
          {isWorking ? 'Opretter…' : 'Opret sag fra tilbud'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm text-gray-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}
