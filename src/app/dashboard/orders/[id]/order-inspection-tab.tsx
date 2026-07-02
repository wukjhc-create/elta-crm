'use client'

/**
 * Trin 1 — besigtigelse FRA sagen ("sagen som omdrejningspunkt").
 *
 * Renderer den eksisterende BesigtigelsesNotat-komponent med sagen
 * forudvalgt og LÅST (lockCase), så montøren ikke skal vælge sag: sagen
 * er konteksten. Parterne (underskriver=anlægsejer, leveringsadresse,
 * betaler) auto-resolves fra sagens parter via komponentens egen
 * getCaseSignerSummary-opslag.
 *
 * BesigtigelsesNotat kræver et fuldt CustomerWithRelations-objekt (læser
 * bl.a. adresse + mobil), men sagens indlejrede customer-join er smal
 * (kun id/navn/kontakt/email/telefon). Derfor henter vi den fulde
 * primær-kunde her via getCustomer. Dokumentet forankres på sagens
 * primære customer_id (låst beslutning); signer/adresse styres af sagen.
 */

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, FileSignature } from 'lucide-react'
import { getCustomer } from '@/lib/actions/customers'
import type { CustomerWithRelations } from '@/types/customers.types'
import { BesigtigelsesNotat } from '@/components/modules/customers/besigtigelse-notat'
import { FuldmagtModal } from '@/components/modules/customers/fuldmagt-modal'

export function OrderInspectionTab({
  caseId,
  customerId,
}: {
  caseId: string
  customerId: string | null
}) {
  const [customer, setCustomer] = useState<CustomerWithRelations | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showFuldmagt, setShowFuldmagt] = useState(false)

  useEffect(() => {
    if (!customerId) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    getCustomer(customerId)
      .then((res) => {
        if (!active) return
        if (res.success && res.data) setCustomer(res.data)
        else setError(res.error || 'Kunne ikke hente kunde')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [customerId])

  if (!customerId) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">Sagen har ingen primær kunde.</p>
          <p className="mt-1">
            Knyt en kunde til sagen for at kunne oprette en besigtigelse herfra.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !customer) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-sm text-red-800">
        {error || 'Kunne ikke hente kunde'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Trin 2 — fuldmagt fra sagen. createFuldmagt håndhæver serverside
          signer=end_customer + at anlægsejeren har aktivt portal-token. */}
      <div className="bg-white rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-purple-600" /> Fuldmagt
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Opret en fuldmagt til sagens anlægsejer (slutkunde), som underskrives i portalen.
          </p>
        </div>
        <button
          onClick={() => setShowFuldmagt(true)}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
        >
          <FileSignature className="w-4 h-4" />
          Opret fuldmagt
        </button>
      </div>

      <BesigtigelsesNotat customer={customer} serviceCaseId={caseId} lockCase />

      {showFuldmagt && (
        <FuldmagtModal
          customerId={customer.id}
          customerName={customer.company_name}
          serviceCaseId={caseId}
          lockCase
          onClose={() => setShowFuldmagt(false)}
        />
      )}
    </div>
  )
}
