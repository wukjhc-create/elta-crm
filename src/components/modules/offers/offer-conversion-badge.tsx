'use client'

/**
 * Sprint Ø7.1 — Konverteringsstatus-badge i tilbudsoversigten.
 *
 * O(1) — drevet af offers.converted_case_id + embedded converted_case
 * (offers_converted_case_id_fkey). Ingen N+1. Cost-free: kun status + link.
 *
 *   Konverteret   → grøn, linker til sagen
 *   Sag mangler   → amber advarsel (converted_case_id sat, men sag væk)
 *   Klar til sag  → blå (sendt/set/accepteret, endnu ikke konverteret)
 *   (øvrige statusser viser intet)
 */

import Link from 'next/link'
import { Briefcase, ArrowRight, AlertTriangle, CircleDot } from 'lucide-react'
import type { OfferStatus } from '@/types/offers.types'
import { offerConversionLabel } from '@/lib/offers/conversion-label'

export function OfferConversionBadge({
  status,
  convertedCaseId,
  convertedCase,
}: {
  status: OfferStatus
  convertedCaseId: string | null
  convertedCase?: { id: string; case_number: string } | null
}) {
  const label = offerConversionLabel(status, convertedCaseId, Boolean(convertedCase))

  // Konverteret + sagen findes → grøn link. Sagsnummeret bliver synligt.
  if (convertedCaseId && convertedCase && label) {
    return (
      <Link
        href={`/dashboard/orders/${convertedCase.case_number}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 break-words min-w-0"
        title="Åbn sagen"
      >
        <Briefcase className="w-3 h-3" />
        <span className="sr-only break-words min-w-0">{label}</span>
        {convertedCase.case_number}
        <ArrowRight className="w-3 h-3" />
      </Link>
    )
  }

  // Forward-link sat, men sagen findes ikke (slettet) → pæn advarsel.
  if (label === 'Sag mangler') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700 break-words min-w-0"
        title="Tilbuddet er markeret som konverteret, men sagen kan ikke findes (måske slettet)."
      >
        <AlertTriangle className="w-3 h-3" />
        {label}
      </span>
    )
  }

  // Klar til konvertering.
  if (label === 'Klar til sag') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 ring-1 ring-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700">
        <CircleDot className="w-3 h-3" />
        {label}
      </span>
    )
  }

  return null
}
