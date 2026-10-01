/**
 * Redigering af fakturakladder (GO-LIVE N5). Server-only (IKKE 'use server'); kalderen gater (invoices.create).
 * invoice_lines skrives KUN med service-role (RLS 00171: ingen REST-skrivning) — derfor her.
 *
 * Regler (sporbarhed før bekvemmelighed):
 *  - kun fakturaer med status 'draft' (sendte/betalte rettes via kreditnota)
 *  - beskrivelse og stk-pris kan rettes på alle linjer
 *  - antal kun på MANUELLE linjer — linjer fra timer/materialer/øvrige beholder kildens antal
 *  - manuelle linjer kan tilføjes og slettes; kildelinjer slettes via "Slet kladde" (frigiver kilderne)
 *  - totaler genberegnes med fakturaens egen momssats; header opdateres kun mens den stadig er kladde
 */
type Admin = { from: (t: string) => any }

const r2 = (n: number) => Math.round(n * 100) / 100

export interface DraftLinePatch { description?: string; unit_price?: number; quantity?: number }
export interface DraftEditResult { ok: boolean; message: string; totals?: { total_amount: number; tax_amount: number; final_amount: number } }

function isSourced(line: Record<string, unknown>): boolean {
  return !!(line.source_time_log_id || line.source_case_material_id || line.source_case_other_cost_id)
}

async function loadDraft(admin: Admin, invoiceId: string) {
  const { data } = await admin.from('invoices').select('id, status, total_amount, tax_amount').eq('id', invoiceId).maybeSingle()
  if (!data) return { error: 'Faktura ikke fundet' as const }
  if (data.status !== 'draft') return { error: 'Kun kladder kan redigeres — brug kreditnota på sendte fakturaer' as const }
  return { inv: data as { id: string; status: string; total_amount: number | null; tax_amount: number | null } }
}

export function vatRateOf(inv: { total_amount: number | null; tax_amount: number | null }): number {
  const t = Number(inv.total_amount ?? 0)
  const v = Number(inv.tax_amount ?? 0)
  if (!(t > 0)) return 0.25
  const ratio = v / t
  // Afrunding på små beløb giver fx 0,2475 — snap til kendte satser (25 % / momsfri), ellers behold fakturaens egen
  for (const known of [0.25, 0]) if (Math.abs(ratio - known) <= 0.01) return known
  return Math.round(ratio * 10000) / 10000
}

export async function recomputeDraftTotals(admin: Admin, invoiceId: string, vatRate: number): Promise<DraftEditResult> {
  const { data: lines } = await admin.from('invoice_lines').select('total_price').eq('invoice_id', invoiceId)
  const subtotal = r2(((lines ?? []) as Array<{ total_price: number | null }>).reduce((s, l) => s + Number(l.total_price ?? 0), 0))
  const tax = r2(subtotal * vatRate)
  const totals = { total_amount: subtotal, tax_amount: tax, final_amount: r2(subtotal + tax) }
  const { data, error } = await admin.from('invoices').update(totals).eq('id', invoiceId).eq('status', 'draft').select('id')
  if (error || !(data ?? []).length) return { ok: false, message: 'Totaler kunne ikke opdateres (er fakturaen stadig en kladde?)' }
  return { ok: true, message: 'Opdateret', totals }
}

function validNumber(n: unknown, { min, max }: { min: number; max: number }): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
}

export async function editDraftLine(admin: Admin, invoiceId: string, lineId: string, patch: DraftLinePatch): Promise<DraftEditResult> {
  const d = await loadDraft(admin, invoiceId)
  if ('error' in d) return { ok: false, message: d.error! }
  const { data: line } = await admin.from('invoice_lines').select('*').eq('id', lineId).eq('invoice_id', invoiceId).maybeSingle()
  if (!line) return { ok: false, message: 'Linjen findes ikke på fakturaen' }

  const upd: Record<string, unknown> = {}
  if (patch.description !== undefined) {
    const desc = String(patch.description).trim()
    if (!desc || desc.length > 1000) return { ok: false, message: 'Beskrivelse skal være 1–1000 tegn' }
    upd.description = desc
  }
  if (patch.unit_price !== undefined) {
    if (!validNumber(patch.unit_price, { min: -10_000_000, max: 10_000_000 })) return { ok: false, message: 'Ugyldig stk-pris' }
    upd.unit_price = r2(patch.unit_price)
  }
  if (patch.quantity !== undefined) {
    if (isSourced(line)) return { ok: false, message: 'Antal kommer fra timer/materialer — ret det på sagen og lav kladden igen' }
    if (!validNumber(patch.quantity, { min: 0.01, max: 1_000_000 })) return { ok: false, message: 'Antal skal være større end 0' }
    upd.quantity = patch.quantity
  }
  if (!Object.keys(upd).length) return { ok: false, message: 'Intet at ændre' }
  const q = Number(upd.quantity ?? line.quantity ?? 0)
  const up = Number(upd.unit_price ?? line.unit_price ?? 0)
  upd.total_price = r2(q * up)

  const { error } = await admin.from('invoice_lines').update(upd).eq('id', lineId).eq('invoice_id', invoiceId)
  if (error) return { ok: false, message: 'Linjen kunne ikke gemmes' }
  return recomputeDraftTotals(admin, invoiceId, vatRateOf(d.inv!))
}

export async function addManualDraftLine(admin: Admin, invoiceId: string, input: { description: string; quantity: number; unit?: string | null; unit_price: number }): Promise<DraftEditResult> {
  const d = await loadDraft(admin, invoiceId)
  if ('error' in d) return { ok: false, message: d.error! }
  const desc = String(input.description ?? '').trim()
  if (!desc || desc.length > 1000) return { ok: false, message: 'Beskrivelse skal være 1–1000 tegn' }
  if (!validNumber(input.quantity, { min: 0.01, max: 1_000_000 })) return { ok: false, message: 'Antal skal være større end 0' }
  if (!validNumber(input.unit_price, { min: -10_000_000, max: 10_000_000 })) return { ok: false, message: 'Ugyldig stk-pris' }
  const { data: last } = await admin.from('invoice_lines').select('position').eq('invoice_id', invoiceId).order('position', { ascending: false }).limit(1).maybeSingle()
  const { error } = await admin.from('invoice_lines').insert({
    invoice_id: invoiceId, position: Number(last?.position ?? 0) + 1, description: desc, quantity: input.quantity,
    unit: (input.unit ?? '').trim().slice(0, 20) || 'stk', unit_price: r2(input.unit_price), total_price: r2(input.quantity * input.unit_price),
  })
  if (error) return { ok: false, message: 'Linjen kunne ikke tilføjes' }
  return recomputeDraftTotals(admin, invoiceId, vatRateOf(d.inv!))
}

export async function deleteManualDraftLine(admin: Admin, invoiceId: string, lineId: string): Promise<DraftEditResult> {
  const d = await loadDraft(admin, invoiceId)
  if ('error' in d) return { ok: false, message: d.error! }
  const { data: line } = await admin.from('invoice_lines').select('*').eq('id', lineId).eq('invoice_id', invoiceId).maybeSingle()
  if (!line) return { ok: false, message: 'Linjen findes ikke på fakturaen' }
  if (isSourced(line)) return { ok: false, message: 'Linjen kommer fra sagen — brug "Slet kladde" for at frigive timer/materialer' }
  const { error } = await admin.from('invoice_lines').delete().eq('id', lineId).eq('invoice_id', invoiceId)
  if (error) return { ok: false, message: 'Linjen kunne ikke slettes' }
  return recomputeDraftTotals(admin, invoiceId, vatRateOf(d.inv!))
}
