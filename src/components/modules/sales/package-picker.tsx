'use client'

/**
 * <PackagePicker>
 *
 * Drop-in panel for the offer create/detail page.
 * Lists active packages, lets the salesperson tick options, shows a live
 * total, and applies everything to the offer in one click.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  applyPackageToDraftOfferAction,
  getPackageWithOptionsAction,
  getOfferTextAction,
  listActivePackagesAction,
} from '@/lib/actions/sales-engine'
import type {
  OfferTextResult,
  SalesPackageRow,
  SalesPackageWithOptions,
} from '@/types/sales-engine.types'

const fmtAmount = (n: number) =>
  new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n)

interface Props {
  offerId: string
  customerId: string | null
  customerName?: string | null
  onApplied?: () => void
}

export function PackagePicker({ offerId, customerId, customerName, onApplied }: Props) {
  const [packages, setPackages] = useState<SalesPackageRow[]>([])
  const [packagesError, setPackagesError] = useState<string | null>(null)
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null)
  const [pkgDetails, setPkgDetails] = useState<SalesPackageWithOptions | null>(null)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [optionIds, setOptionIds] = useState<string[]>([])
  const [textPreview, setTextPreview] = useState<OfferTextResult | null>(null)
  const [writeOfferText, setWriteOfferText] = useState<boolean>(true)
  const [busy, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    listActivePackagesAction().then((rows) => {
      if (!alive) return
      setPackages(rows)
      setPackagesError(null)
    }).catch(() => {
      if (!alive) return
      setPackagesError('Kunne ikke hente pakker')
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!selectedPkgId) {
      setPkgDetails(null)
      setOptionIds([])
      setTextPreview(null)
      setDetailsError(null)
      return
    }
    let alive = true
    setPkgDetails(null)
    setDetailsError(null)
    getPackageWithOptionsAction(selectedPkgId)
      .then((p) => {
        if (!alive) return
        setPkgDetails(p)
        setOptionIds([])
      })
      .catch(() => {
        if (!alive) return
        setDetailsError('Kunne ikke hente pakken')
      })
    return () => { alive = false }
  }, [selectedPkgId])

  // Live text preview whenever options change.
  useEffect(() => {
    if (!selectedPkgId) { setTextPreview(null); return }
    getOfferTextAction({
      packageId: selectedPkgId,
      optionIds,
      customerName: customerName ?? undefined,
    })
      .then(setTextPreview)
      .catch(() => setTextPreview(null))
  }, [selectedPkgId, optionIds, customerName])

  const selectedOptions = useMemo(
    () => (pkgDetails?.options ?? []).filter((o) => optionIds.includes(o.id)),
    [pkgDetails, optionIds]
  )
  const liveTotal = useMemo(() => {
    if (!pkgDetails) return 0
    return Number(pkgDetails.base_price) + selectedOptions.reduce((s, o) => s + Number(o.price), 0)
  }, [pkgDetails, selectedOptions])

  const apply = () => {
    if (!selectedPkgId) return
    startTransition(async () => {
      const r = await applyPackageToDraftOfferAction({
        offerId,
        packageId: selectedPkgId,
        customerId,
        optionIds,
        customerName: customerName ?? undefined,
        writeOfferText,
      })
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok && onApplied) onApplied()
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Anvend pakke</h3>
          <span className="text-xs text-gray-500">Ændringer er additive — eksisterende linjer bevares.</span>
        </div>

        {packagesError ? (
          <p className="text-sm text-red-700" data-testid="package-list-load-error">
            {packagesError}. Det tælles ikke som ingen pakker.
          </p>
        ) : packages.length === 0 ? (
          <p className="text-xs text-gray-400">Ingen aktive pakker — opret en under Indstillinger → Pakker.</p>
        ) : (
          <>
            <label className="block text-xs text-gray-500 mb-1">Pakke</label>
            <select
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={selectedPkgId ?? ''}
              onChange={(e) => setSelectedPkgId(e.target.value || null)}
            >
              <option value="">— vælg —</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {fmtAmount(Number(p.base_price))}
                </option>
              ))}
            </select>
            {detailsError && (
              <p className="mt-2 text-sm text-red-700" data-testid="package-detail-load-error">
                {detailsError}. Det tælles ikke som en pakke uden tilvalg.
              </p>
            )}

            {pkgDetails && (
              <div className="mt-3 space-y-3">
                {pkgDetails.short_summary && (
                  <p className="text-xs text-gray-600">{pkgDetails.short_summary}</p>
                )}

                {pkgDetails.options.length > 0 && (
                  <div>
                    <div className="text-xs font-medium mb-1">Tilvalg</div>
                    <div className="space-y-1.5">
                      {pkgDetails.options.map((o) => (
                        <label key={o.id} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={optionIds.includes(o.id)}
                            onChange={(e) => {
                              setOptionIds((prev) =>
                                e.target.checked
                                  ? [...prev, o.id]
                                  : prev.filter((x) => x !== o.id)
                              )
                            }}
                          />
                          <div className="flex-1">
                            <div className="font-medium">
                              {o.name}{' '}
                              <span className="text-gray-500 font-normal">
                                +{fmtAmount(Number(o.price))}
                              </span>
                            </div>
                            {o.description && <div className="text-xs text-gray-500">{o.description}</div>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-gray-500">Foreløbig total (basis + tilvalg)</span>
                  <span className="text-base font-semibold">{fmtAmount(liveTotal)}</span>
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={writeOfferText}
                    onChange={(e) => setWriteOfferText(e.target.checked)}
                  />
                  Skriv også genereret tekst til tilbuddets beskrivelse
                </label>

                <Button onClick={apply} disabled={busy}>
                  Anvend pakke{optionIds.length > 0 && ` + ${optionIds.length} tilvalg`}
                </Button>

                {msg && (
                  <div className={`text-sm rounded px-3 py-2 ${
                    msg.ok ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
                           : 'bg-red-50 text-red-900 ring-1 ring-red-200'
                  }`}>
                    {msg.text}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {textPreview && textPreview.full && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
          <h3 className="text-sm font-semibold mb-2">Tekst-forhåndsvisning</h3>
          <pre className="text-xs whitespace-pre-wrap font-sans text-gray-800">{textPreview.full}</pre>
        </div>
      )}
    </div>
  )
}
