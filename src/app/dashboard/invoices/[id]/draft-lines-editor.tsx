'use client'

/**
 * Rediger fakturakladde (GO-LIVE N5): ret beskrivelse/stk-pris, antal på manuelle linjer, tilføj/slet manuelle linjer.
 * Linjer fra timer/materialer beholder kildens antal (sporbarhed). Serveren håndhæver det samme + kun status 'draft'.
 */
import { useState } from 'react'
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import { editDraftInvoiceLineAction, addDraftInvoiceLineAction, deleteDraftInvoiceLineAction } from '@/lib/actions/invoices'

export interface DraftLine {
  id: string
  position: number
  description: string
  quantity: number | string
  unit: string | null
  unit_price: number | string
  total_price: number | string
  source_time_log_id?: string | null
  source_case_material_id?: string | null
  source_case_other_cost_id?: string | null
}

const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'))
const fmt = (n: number | string) => Number(n).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sourced = (l: DraftLine) => !!(l.source_time_log_id || l.source_case_material_id || l.source_case_other_cost_id)

export function DraftLinesEditor({ invoiceId, lines, onChanged }: { invoiceId: string; lines: DraftLine[]; onChanged: (ok: boolean, message: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ description: '', quantity: '', unit_price: '' })
  const [add, setAdd] = useState({ description: '', quantity: '1', unit: 'stk', unit_price: '' })

  const startEdit = (l: DraftLine) => {
    setEditing(l.id)
    setDraft({ description: l.description, quantity: String(l.quantity).replace('.', ','), unit_price: fmt(l.unit_price) })
  }
  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    onChanged(r.ok, r.message)
    return r.ok
  }
  const save = async (l: DraftLine) => {
    const patch: { description?: string; unit_price?: number; quantity?: number } = {}
    if (draft.description.trim() !== l.description) patch.description = draft.description.trim()
    const up = num(draft.unit_price)
    if (Number.isFinite(up) && up !== Number(l.unit_price)) patch.unit_price = up
    if (!sourced(l)) { const q = num(draft.quantity); if (Number.isFinite(q) && q !== Number(l.quantity)) patch.quantity = q }
    if (!Object.keys(patch).length) { setEditing(null); return }
    if (await run(() => editDraftInvoiceLineAction(invoiceId, l.id, patch))) setEditing(null)
  }
  const input = 'w-full rounded border border-gray-300 px-1.5 py-1 text-xs'

  return (
    <div data-testid="draft-lines-editor">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr><th className="px-2 py-1.5 w-8">#</th><th className="px-2 py-1.5">Beskrivelse</th><th className="px-2 py-1.5 text-right w-20">Antal</th>
            <th className="px-2 py-1.5 text-right w-28">Stk-pris</th><th className="px-2 py-1.5 text-right w-24">Total</th><th className="px-2 py-1.5 w-20" /></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((l) => editing === l.id ? (
            <tr key={l.id} className="bg-amber-50/50">
              <td className="px-2 py-1.5 text-gray-500">{l.position}</td>
              <td className="px-2 py-1.5"><input className={input} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} data-testid="draft-edit-description" /></td>
              <td className="px-2 py-1.5 text-right">{sourced(l)
                ? <span title="Antal kommer fra sagen">{String(l.quantity).replace('.', ',')}</span>
                : <input className={`${input} text-right`} value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />}</td>
              <td className="px-2 py-1.5"><input className={`${input} text-right`} value={draft.unit_price} onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })} data-testid="draft-edit-price" /></td>
              <td className="px-2 py-1.5 text-right text-gray-500">—</td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                <button type="button" disabled={busy} onClick={() => save(l)} className="p-1 text-emerald-700 hover:bg-emerald-50 rounded" title="Gem" data-testid="draft-edit-save"><Check className="w-4 h-4" /></button>
                <button type="button" disabled={busy} onClick={() => setEditing(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="Annullér"><X className="w-4 h-4" /></button>
              </td>
            </tr>
          ) : (
            <tr key={l.id}>
              <td className="px-2 py-1.5 text-gray-500">{l.position}</td>
              <td className="px-2 py-1.5">{l.description}{sourced(l) && <span className="ml-1 text-[10px] text-gray-400">(fra sagen)</span>}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{String(l.quantity).replace('.', ',')} {l.unit ?? ''}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(l.unit_price)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmt(l.total_price)}</td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                <button type="button" disabled={busy || editing !== null} onClick={() => startEdit(l)} className="p-1 text-gray-600 hover:bg-gray-100 rounded" title="Ret linje" data-testid="draft-edit"><Pencil className="w-3.5 h-3.5" /></button>
                {!sourced(l) && (
                  <button type="button" disabled={busy || editing !== null} onClick={() => { if (window.confirm('Slet denne manuelle linje?')) run(() => deleteDraftInvoiceLineAction(invoiceId, l.id)) }}
                    className="p-1 text-red-600 hover:bg-red-50 rounded" title="Slet manuel linje" data-testid="draft-delete"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="mt-3 grid grid-cols-2 sm:grid-cols-[1fr_5rem_5rem_7rem_auto] gap-2 items-end"
        onSubmit={async (e) => {
          e.preventDefault()
          const ok = await run(() => addDraftInvoiceLineAction(invoiceId, { description: add.description, quantity: num(add.quantity), unit: add.unit, unit_price: num(add.unit_price) }))
          if (ok) setAdd({ description: '', quantity: '1', unit: 'stk', unit_price: '' })
        }}
      >
        <label className="col-span-2 sm:col-span-1 text-[11px] text-gray-600">Ny linje<input className={input} value={add.description} onChange={(e) => setAdd({ ...add, description: e.target.value })} placeholder="Fx kørsel, gebyr, rabat" data-testid="draft-add-description" /></label>
        <label className="text-[11px] text-gray-600">Antal<input className={`${input} text-right`} value={add.quantity} onChange={(e) => setAdd({ ...add, quantity: e.target.value })} data-testid="draft-add-quantity" /></label>
        <label className="text-[11px] text-gray-600">Enhed<input className={input} value={add.unit} onChange={(e) => setAdd({ ...add, unit: e.target.value })} /></label>
        <label className="text-[11px] text-gray-600">Stk-pris<input className={`${input} text-right`} value={add.unit_price} onChange={(e) => setAdd({ ...add, unit_price: e.target.value })} data-testid="draft-add-price" /></label>
        <button type="submit" disabled={busy || !add.description.trim() || !add.unit_price.trim()} className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50" data-testid="draft-add-submit">
          <Plus className="w-3.5 h-3.5" /> Tilføj
        </button>
      </form>
      <p className="text-[11px] text-gray-400 mt-2">Antal på linjer fra timer/materialer rettes på sagen. Totaler og moms genberegnes automatisk.</p>
    </div>
  )
}
