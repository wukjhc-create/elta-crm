/**
 * Kost på sagsmaterialer (00248). Bevidst IKKE 'use server': hjælperne bruger admin-klienten og må kun kaldes fra
 * server-kode, der allerede har gatet brugeren (scripts/assert-server-only-helpers.ts).
 *
 * Databasen: `authenticated` har ingen kolonne-SELECT på case_materials.unit_cost/total_cost (00248, samme mekanik som
 * 00192/00201). Ingen bruger kan læse, filtrere, sortere eller joine på kosten via API'et, uanset rolle. Bruger-klienten
 * vælger altid CASE_MATERIAL_PUBLIC_COLUMNS. Kosten læses med admin-klienten, KUN:
 *   1. når brugeren har den effektive rettighed materials.view.cost_prices, og
 *   2. for id'er brugerens egen klient lige har returneret (det er beviset for sags-scope).
 * Uden ret er kosten null på alle linjer. Så kan ingen se forskel på kendt og ukendt kost.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Permission } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { selectInChunks } from '@/lib/supabase/in-chunks'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { knownCost, marginOf, sumCosts } from '@/lib/cases/material-cost'
import type { CaseMaterialRow, CaseMaterialsSummary } from '@/types/case-materials.types'

/** Alle kolonner undtagen unit_cost og total_cost. Skal svare til kolonne-granten i 00248. */
export const CASE_MATERIAL_PUBLIC_COLUMNS = 'id, case_id, work_order_id, supplier_product_id, material_id, description, sku_snapshot, supplier_name_snapshot, unit, quantity, unit_sales_price, total_sales_price, source, source_offer_line_id, source_incoming_invoice_line_id, billable, invoice_line_id, notes, created_by, created_at, updated_at'

export const CASE_MATERIAL_COST_COLUMNS = ['unit_cost', 'total_cost'] as const

export const MATERIAL_COST_PERMISSION: Permission = 'materials.view.cost_prices'

export interface MaterialCost { unit_cost: number | null; total_cost: number | null }

export type MaterialCostRead =
  | { state: 'hidden' }
  | { state: 'error' }
  | { state: 'ok'; byId: Map<string, MaterialCost> }

/**
 * Kost for id'er, som brugerens egen klient allerede har returneret. Kalderen må aldrig sende id'er, den ikke selv har
 * læst med brugerens klient. Fejl er 'error', aldrig 0.
 */
export async function readCaseMaterialCosts(
  ctx: { hasPermission: (perm: Permission) => boolean; admin?: SupabaseClient },
  ids: string[],
): Promise<MaterialCostRead> {
  if (!ctx.hasPermission(MATERIAL_COST_PERMISSION)) return { state: 'hidden' }
  const unique = Array.from(new Set(ids.filter(Boolean)))
  const byId = new Map<string, MaterialCost>()
  if (unique.length === 0) return { state: 'ok', byId }
  try {
    const admin = ctx.admin ?? createAdminClient()
    const rows = await selectInChunks<{ id: string; unit_cost: unknown; total_cost: unknown }>(unique, (chunk) =>
      admin.from('case_materials').select('id, unit_cost, total_cost').in('id', chunk))
    for (const r of rows) byId.set(r.id, { unit_cost: knownCost(r.unit_cost), total_cost: knownCost(r.total_cost) })
    return { state: 'ok', byId }
  } catch {
    return { state: 'error' }
  }
}

/** Kost på hver række. Skjult eller mangler en række i svaret, er kosten null. */
export function withCosts<T extends { id: string }>(rows: T[], read: MaterialCostRead): Array<T & MaterialCost> {
  return rows.map((r) => {
    const c = read.state === 'ok' ? read.byId.get(r.id) : undefined
    return { ...r, unit_cost: c?.unit_cost ?? null, total_cost: c?.total_cost ?? null }
  })
}

export interface MaterialListCtx {
  supabase: SupabaseClient
  hasPermission: (perm: Permission) => boolean
  canViewCase: (caseId: string) => Promise<boolean>
  admin?: SupabaseClient
}

export type MaterialListResult =
  | { success: true; data: { rows: CaseMaterialRow[]; summary: CaseMaterialsSummary } }
  | { success: false; error: string }

const EMPTY_SUMMARY: CaseMaterialsSummary = {
  count: 0, total_cost: 0, total_cost_known: 0, unknown_cost_lines: 0, total_sales_price: 0, contribution_margin: 0, margin_percentage: 0,
}

/** Materialelisten på en sag (listCaseMaterials). Rækker via brugerens klient, kost kun med ret. */
export async function listCaseMaterialsCore(ctx: MaterialListCtx, caseId: string): Promise<MaterialListResult> {
  if (!ctx.hasPermission('materials.view')) return { success: false, error: 'Manglende tilladelse: materials.view' }
  if (!(await ctx.canViewCase(caseId))) return { success: true, data: { rows: [], summary: EMPTY_SUMMARY } }

  let raw: Array<Record<string, unknown>>
  try {
    raw = await fetchAllRows<Record<string, unknown>>((f, t) => ctx.supabase
      .from('case_materials')
      .select(CASE_MATERIAL_PUBLIC_COLUMNS)
      .eq('case_id', caseId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(f, t))
  } catch {
    return { success: false, error: 'Kunne ikke hente materialer' }
  }

  const base = raw.map((r) => ({
    ...(r as unknown as Omit<CaseMaterialRow, 'unit_cost' | 'total_cost'>),
    quantity: Number(r.quantity),
    unit_sales_price: Number(r.unit_sales_price),
    total_sales_price: Number(r.total_sales_price),
  }))
  const costs = await readCaseMaterialCosts(ctx, base.map((r) => r.id))
  if (costs.state === 'error') return { success: false, error: 'Kunne ikke hente materialernes kost' }
  const canSee = costs.state === 'ok'
  const rows = withCosts(base, costs) as CaseMaterialRow[]

  const sum = sumCosts(rows.map((r) => r.total_cost))
  const sale = rows.reduce((s, r) => s + r.total_sales_price, 0)
  const margin = marginOf(sale, sum.total)
  return {
    success: true,
    data: {
      rows,
      summary: {
        count: rows.length,
        total_cost: canSee ? sum.total : null,
        total_cost_known: canSee ? sum.known : null,
        unknown_cost_lines: canSee ? sum.unknownLines : null,
        total_sales_price: Math.round(sale * 100) / 100,
        contribution_margin: canSee ? margin.amount : null,
        margin_percentage: canSee ? margin.percentage : null,
      },
    },
  }
}
