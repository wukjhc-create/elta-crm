'use client'

/**
 * N66: vælg leverandør på en leverandørfaktura — eller opret den (admin) med afsenderdomænet som website, så næste
 * faktura fra samme afsender kobles automatisk. Vises kun for incoming_invoices.edit og kun på ikke-afsluttede fakturaer.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  createSupplierFromIncomingInvoiceAction,
  getIncomingInvoiceSupplierContextAction,
  setIncomingInvoiceSupplierAction,
  type IncomingInvoiceSupplierContext,
} from '@/lib/actions/incoming-invoice-supplier'

export function IncomingInvoiceSupplierPicker({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [ctx, setCtx] = useState<IncomingInvoiceSupplierContext | null>(null)
  const [choice, setChoice] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    void getIncomingInvoiceSupplierContextAction(invoiceId).then((r) => {
      if (!alive || !r.success || !r.data) return
      setCtx(r.data)
      setChoice(r.data.supplierId ?? '')
      setName(r.data.suggestedName ?? '')
    })
    return () => { alive = false }
  }, [invoiceId])

  if (!ctx || ctx.locked) return null

  const save = async () => {
    setBusy(true); setMsg(null)
    const r = await setIncomingInvoiceSupplierAction(invoiceId, choice || null)
    setBusy(false)
    if (!r.success) { setMsg({ ok: false, text: r.error ?? 'Kunne ikke gemme' }); return }
    setCtx({ ...ctx, supplierId: choice || null })
    setMsg({ ok: true, text: choice ? 'Leverandør koblet' : 'Leverandør fjernet' })
    router.refresh()
  }

  const create = async () => {
    setBusy(true); setMsg(null)
    const r = await createSupplierFromIncomingInvoiceAction(invoiceId, name)
    setBusy(false)
    if (!r.success || !r.data) { setMsg({ ok: false, text: r.error ?? 'Kunne ikke oprette' }); return }
    const id = r.data.supplierId
    setCtx({ ...ctx, supplierId: id, options: [...ctx.options, { id, name: name.trim(), code: null }].sort((a, b) => a.name.localeCompare(b.name, 'da')) })
    setChoice(id); setCreating(false)
    setMsg({ ok: true, text: 'Leverandør oprettet og koblet' })
    router.refresh()
  }

  return (
    <div className="space-y-2 w-full" data-testid="invoice-supplier-picker">
      <div className="flex flex-wrap items-center gap-2">
        <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy} data-testid="invoice-supplier-select"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm">
          <option value="">— Ingen leverandør —</option>
          {ctx.options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.code ? ` (${o.code})` : ''}</option>)}
        </select>
        <button type="button" onClick={() => void save()} disabled={busy || choice === (ctx.supplierId ?? '')} data-testid="invoice-supplier-save"
          className="px-3 py-1 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
          Gem
        </button>
        {ctx.canCreate && !creating && (
          <button type="button" onClick={() => setCreating(true)} className="text-sm text-emerald-700 hover:underline" data-testid="invoice-supplier-new">
            Opret ny
          </button>
        )}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
      </div>
      {creating && (
        <div className="rounded-md ring-1 ring-gray-200 p-2 space-y-2 text-sm">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Leverandørens navn" data-testid="invoice-supplier-name"
            className="w-full rounded-md border border-gray-300 px-2 py-1" />
          <p className="text-xs text-gray-500">
            {ctx.senderDomain
              ? <>Afsenderdomænet <strong>{ctx.senderDomain}</strong> gemmes som website — næste faktura herfra kobles automatisk.</>
              : 'Ingen firma-afsender på mailen (fx gmail) — fremtidige fakturaer kobles via CVR/navn.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void create()} disabled={busy || name.trim().length < 2} data-testid="invoice-supplier-create"
              className="px-3 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              Opret og kobl
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-1 rounded-md border hover:bg-gray-50">Annullér</button>
          </div>
        </div>
      )}
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`} data-testid="invoice-supplier-msg">{msg.text}</p>}
    </div>
  )
}
