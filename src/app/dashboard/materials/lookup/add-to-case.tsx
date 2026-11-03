'use client'

import { useState } from 'react'
import { addKnownCatalogueProductToCase } from '@/lib/actions/catalogue-case-material'

export function AddCatalogueToCase({ caseId, productId }: { caseId: string; productId: string }) {
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function add() {
    setBusy(true)
    setMessage(null)
    const quantity = Number(qty.replace(',', '.'))
    const res = await addKnownCatalogueProductToCase({ caseId, supplierProductId: productId, quantity })
    setBusy(false)
    setMessage(res.success ? (res.message ?? 'Varen er lagt på sagen.') : (res.error ?? 'Linjen blev ikke oprettet.'))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="Antal" value={qty} onChange={(e) => setQty(e.target.value)} className="w-16 rounded-md border px-2 py-1" />
      <button type="button" disabled={busy} onClick={add} className="min-h-9 rounded-md border px-2 text-xs">Bekræft og tilføj</button>
      {message && <span className="text-xs text-gray-700">{message}</span>}
    </div>
  )
}
