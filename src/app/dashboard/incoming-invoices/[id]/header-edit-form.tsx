'use client'

/**
 * L-7 — ret fakturahovedet (nr., datoer, valuta, beløb) på en ikke-afsluttet leverandørfaktura.
 * Serveren validerer og auditerer (editIncomingInvoiceHeaderAction); formularen sender kun ændrede felter.
 */

import { parseDanishDecimal } from '@/lib/utils/danish-number'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { editIncomingInvoiceHeaderAction } from '@/lib/actions/incoming-invoices'
import type { InvoiceHeaderInput } from '@/lib/invoices/incoming-header-edit'
import { Button } from '@/components/ui/button'

interface HeaderValues {
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  currency: string
  amount_excl_vat: number | string | null
  vat_amount: number | string | null
  amount_incl_vat: number | string | null
}

const toText = (v: number | string | null) => (v === null || v === undefined ? '' : String(v))

/** Dansk eller punktum-format → tal; tomt felt = null; ugyldigt = NaN (serveren afviser) */
function parseAmount(s: string): number | null {
  if (!s.trim()) return null
  // TZ-1 (format-review 2026-10-18): "12.500" er 12.500 kr (dansk tusindtal) — før blev det 12,50 kr
  const n = parseDanishDecimal(s)
  return n === null ? NaN : n
}

export function HeaderEditForm({
  invoiceId,
  initial,
  onSaved,
  onCancel,
}: {
  invoiceId: string
  initial: HeaderValues
  onSaved: (message: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    invoice_number: initial.invoice_number ?? '',
    invoice_date: initial.invoice_date ?? '',
    due_date: initial.due_date ?? '',
    currency: initial.currency ?? 'DKK',
    amount_excl_vat: toText(initial.amount_excl_vat),
    vat_amount: toText(initial.vat_amount),
    amount_incl_vat: toText(initial.amount_incl_vat),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setError(null)
    const input: InvoiceHeaderInput = {}
    if (form.invoice_number.trim() !== (initial.invoice_number ?? '')) input.invoice_number = form.invoice_number
    if (form.invoice_date !== (initial.invoice_date ?? '')) input.invoice_date = form.invoice_date || null
    if (form.due_date !== (initial.due_date ?? '')) input.due_date = form.due_date || null
    if (form.currency.trim().toUpperCase() !== (initial.currency ?? 'DKK')) input.currency = form.currency
    for (const k of ['amount_excl_vat', 'vat_amount', 'amount_incl_vat'] as const) {
      const before = initial[k] === null || initial[k] === undefined ? null : Number(initial[k])
      const after = parseAmount(form[k])
      if (after === null ? before !== null : Number.isNaN(after) || after !== before) input[k] = after
    }
    if (Object.keys(input).length === 0) { onCancel(); return }
    setSaving(true)
    const r = await editIncomingInvoiceHeaderAction(invoiceId, input)
    setSaving(false)
    if (!r.ok) { setError(r.message); return }
    await onSaved(r.message)
  }

  const field = 'w-full min-w-0 max-w-full rounded-md border border-gray-300 px-2 py-1 text-sm'
  return (
    <div className="space-y-2" data-testid="invoice-header-edit">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm min-w-0">
        <label className="min-w-0 sm:col-span-2">
          <span className="text-gray-500 text-xs">Faktura nr</span>
          <input className={field} value={form.invoice_number} onChange={set('invoice_number')} data-testid="header-invoice-number" />
        </label>
        <label className="min-w-0">
          <span className="text-gray-500 text-xs">Faktura dato</span>
          <input type="date" className={field} value={form.invoice_date} onChange={set('invoice_date')} />
        </label>
        <label className="min-w-0">
          <span className="text-gray-500 text-xs">Forfald</span>
          <input type="date" className={field} value={form.due_date} onChange={set('due_date')} />
        </label>
        <label className="min-w-0">
          <span className="text-gray-500 text-xs">Valuta</span>
          <input className={field} value={form.currency} maxLength={3} onChange={set('currency')} />
        </label>
        <label className="min-w-0">
          <span className="text-gray-500 text-xs">Beløb ekskl moms</span>
          <input inputMode="decimal" className={field} value={form.amount_excl_vat} onChange={set('amount_excl_vat')} data-testid="header-amount-excl" />
        </label>
        <label className="min-w-0">
          <span className="text-gray-500 text-xs">Moms</span>
          <input inputMode="decimal" className={field} value={form.vat_amount} onChange={set('vat_amount')} data-testid="header-vat" />
        </label>
        <label className="min-w-0">
          <span className="text-gray-500 text-xs">Beløb incl moms</span>
          <input inputMode="decimal" className={field} value={form.amount_incl_vat} onChange={set('amount_incl_vat')} data-testid="header-amount-incl" />
        </label>
      </div>
      {error && <div className="text-xs text-red-700 break-words" data-testid="header-edit-error">{error}</div>}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>Annullér</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} data-testid="header-edit-save">
          {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Gem
        </Button>
      </div>
      <p className="text-[11px] text-gray-500 break-words">Ændringen logges i fakturaens historik. Ekskl. + moms skal give inkl. moms.</p>
    </div>
  )
}
