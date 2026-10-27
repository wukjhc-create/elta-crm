/**
 * Fælles værn for sagens kostrækker (case_materials / case_other_costs). Bevidst IKKE 'use server'.
 *
 * Sags-review 2026-10-17:
 *  - SC-1: en række konverteret fra en leverandørfakturalinje blev slettet → linjens FK blev NULL (ON DELETE SET NULL),
 *    men converted_at blev stående = "bevidst sprunget over" → kosten forsvandt fra sagen uden advarsel og linjen kunne
 *    ikke konverteres igen. Linjerne frigives nu efter sletningen.
 *  - SC-5: arbejdsordren skal høre til sagen (ellers forvrænges en anden ordres avance-snapshot)
 *  - SC-8: kvitteringsstien skal ligge under sagens egen mappe (receipts/<sag>/…)
 *  - SC-9: ingen ændringer på en lukket sag
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

type Db = { from: (t: string) => any }

/**
 * SC-9: må sagens kostrækker IKKE ændres? 00240 forudsætning 4: fail-closed — sagens status læses med admin-klienten
 * (efter kalderens scope-tjek), og en ulæselig/manglende sag tæller som lukket. `db` bevares for kompatibilitet.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function caseIsClosed(_db: Db, caseId: string): Promise<boolean> {
  const { readCaseWriteState } = await import('@/lib/cases/case-write-guard')
  const st = await readCaseWriteState(caseId)
  return !st || st.status === 'closed'
}

export async function workOrderBelongsToCase(db: Db, workOrderId: string, caseId: string): Promise<boolean> {
  const { data } = await db.from('work_orders').select('case_id').eq('id', workOrderId).maybeSingle()
  return !!data && (data as { case_id: string | null }).case_id === caseId
}

export function receiptPathAllowed(path: string | null | undefined, caseId: string): boolean {
  if (!path) return true
  // Ældre eksterne links signeres/slettes aldrig (kun storage-stier under receipts/) — kun storage-stier afgrænses
  if (!path.startsWith('receipts/')) return true
  return path.startsWith(`receipts/${caseId}/`) && !path.includes('..')
}

/** Leverandørfakturalinjer der er konverteret til rækken (findes FØR sletning — bagefter er FK'en NULL). */
export async function findConvertedSupplierLines(kind: 'material' | 'other_cost', rowId: string): Promise<string[]> {
  const col = kind === 'material' ? 'converted_case_material_id' : 'converted_case_other_cost_id'
  const { data, error } = await createAdminClient().from('incoming_invoice_lines').select('id').eq(col, rowId)
  if (error) throw new Error('Kunne ikke kontrollere leverandørfakturalinjer — prøv igen')
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
}

/** Efter sletning: linjerne bliver "ikke konverteret" igen (synlige i sagens advarsel og kan konverteres på ny). */
export async function releaseSupplierLines(lineIds: string[]): Promise<void> {
  if (lineIds.length === 0) return
  const { error } = await createAdminClient().from('incoming_invoice_lines')
    .update({ converted_at: null, converted_by: null }).in('id', lineIds)
  if (error) logger.error('releaseSupplierLines failed (SC-1)', { error, metadata: { lineIds } })
}
