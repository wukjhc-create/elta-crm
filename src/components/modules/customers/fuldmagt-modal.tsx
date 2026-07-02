'use client'

import { useState, useEffect } from 'react'
import { FileSignature } from 'lucide-react'
import { createFuldmagt } from '@/lib/actions/fuldmagt'
import { listCustomerServiceCasesForBesigtigelse } from '@/lib/actions/besigtigelse'
import { useToast } from '@/components/ui/toast'

interface FuldmagtCaseOption {
  id: string
  case_number: string | null
  title: string | null
  status: string | null
}

interface FuldmagtModalProps {
  customerId: string
  customerName: string | null
  /**
   * Fase 2b — når modalen åbnes FRA en sag, låses sagen: vælgeren skjules,
   * og oprettelsen bindes til denne sag. Udeladt (default) = kundekort-flow
   * hvor brugeren selv vælger sag blandt kundens sager (uændret adfærd).
   */
  serviceCaseId?: string
  lockCase?: boolean
  onClose: () => void
  onSuccess?: () => void
}

/**
 * Fuldmagt-opret modal — udtrukket fra kundekortet (customer-detail-client)
 * så den kan genbruges fra sagens detaljeside. `createFuldmagt` er allerede
 * sag-bevidst (signer=end_customer + adresse fra sagens parter); denne modal
 * leverer blot sag-valget: enten via kundens sag-liste (kundekort) eller
 * låst til én bestemt sag (åbnet fra sagen).
 */
export function FuldmagtModal({
  customerId,
  customerName,
  serviceCaseId: lockedCaseId,
  lockCase = false,
  onClose,
  onSuccess,
}: FuldmagtModalProps) {
  const toast = useToast()
  const [orderNr, setOrderNr] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [selectedCaseId, setSelectedCaseId] = useState(lockCase && lockedCaseId ? lockedCaseId : '')
  const [cases, setCases] = useState<FuldmagtCaseOption[]>([])
  const [loadingCases, setLoadingCases] = useState(!lockCase)

  // Kundekort-flow: hent kundens sager til vælgeren. Låst sag (fra sagen)
  // springer dette over — sagen er allerede kendt.
  useEffect(() => {
    if (lockCase) return
    let active = true
    setLoadingCases(true)
    listCustomerServiceCasesForBesigtigelse(customerId)
      .then((res) => {
        if (!active) return
        const list = res.success && res.data ? res.data : []
        setCases(list)
        if (list.length === 1) setSelectedCaseId(list[0].id)
      })
      .finally(() => {
        if (active) setLoadingCases(false)
      })
    return () => {
      active = false
    }
  }, [customerId, lockCase])

  const handleCreate = async () => {
    if (!selectedCaseId) {
      toast.error('Vælg en sag')
      return
    }
    if (!orderNr.trim()) {
      toast.error('Ordrenummer er påkrævet')
      return
    }
    setIsSending(true)
    const result = await createFuldmagt(customerId, orderNr, selectedCaseId)
    setIsSending(false)
    if (result.success) {
      toast.success('Fuldmagt oprettet — kunden kan nu underskrive i portalen')
      onSuccess?.()
      onClose()
    } else {
      toast.error(result.error || 'Kunne ikke oprette fuldmagt')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-bold mb-4">Send Fuldmagt til kunde</h3>
        <p className="text-sm text-gray-600 mb-4">
          Opret en fuldmagt som kunden kan underskrive i portalen. Fuldmagten giver{' '}
          {customerName || 'kunden'} mulighed for at underskrive digitalt.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sag <span className="text-red-500">*</span>
          </label>
          {lockCase ? (
            <div className="p-3 bg-gray-50 border rounded-lg text-sm text-gray-700">
              Fuldmagten oprettes på denne sag.
            </div>
          ) : loadingCases ? (
            <p className="text-sm text-gray-400">Henter sager…</p>
          ) : cases.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              Denne kunde har ingen sager endnu. Opret en sag, før du opretter en fuldmagt.
            </div>
          ) : (
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
            >
              <option value="">— Vælg sag —</option>
              {cases.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {[sc.case_number, sc.title].filter(Boolean).join(' · ') || 'Sag'}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Underskriver bliver sagens anlægsejer (slutkunde), og adressen tages fra sagen.
          </p>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Ordrenummer</label>
          <input
            type="text"
            value={orderNr}
            onChange={(e) => setOrderNr(e.target.value)}
            placeholder="f.eks. ORD-2026-001"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium"
          >
            Annuller
          </button>
          <button
            onClick={handleCreate}
            disabled={isSending || !selectedCaseId}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSending ? 'Opretter...' : <><FileSignature className="w-4 h-4" /> Opret Fuldmagt</>}
          </button>
        </div>
      </div>
    </div>
  )
}
