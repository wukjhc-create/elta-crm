/**
 * Employee integrity 2026-11-09: værn foran create_invoice_from_work_order (00202). SQL-funktionen bruger
 * COALESCE(employees.hourly_rate, p_default_hourly_rate) — medarbejderens NUVÆRENDE sats, og en standardsats når den
 * mangler. Værnet tillader kun fakturering, når resultatet er præcis de frosne beløb:
 *   - hver fakturerbar, afsluttet, ikke-afvist og ufaktureret time har sale_amount og sale_rate_snapshot
 *   - medarbejderens nuværende timepris findes og er lig den frosne sats
 * Ellers en dansk fejl uden beløb (kalderen kan ikke fakturere via denne vej; brug sagens fakturakladde).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { knownRate } from './setup-integrity'

export interface BillableTimeRow {
  employee_id: string
  sale_amount: unknown
  sale_rate_snapshot: unknown
}

/** Ren regel (testbar): rækker + nuværende satser pr. medarbejder → fejltekst eller null. */
export function timePricingBlock(rows: BillableTimeRow[], currentRate: Map<string, unknown>): string | null {
  let missingFrozen = 0
  let missingRate = 0
  let changedRate = 0
  for (const r of rows) {
    const snap = knownRate(r.sale_rate_snapshot)
    if (knownRate(r.sale_amount) === null || snap === null) { missingFrozen++; continue }
    const now = knownRate(currentRate.get(r.employee_id))
    if (now === null) missingRate++
    else if (Math.abs(now - snap) > 0.004) changedRate++
  }
  if (missingFrozen) return `${missingFrozen} fakturerbare timer har ingen frossen salgspris — fakturér via sagens fakturakladde, så ingen standardsats bruges`
  if (missingRate) return `${missingRate} fakturerbare timer tilhører en medarbejder uden timepris — sæt timeprisen; en standardsats bruges aldrig`
  if (changedRate) return `${changedRate} fakturerbare timer er registreret til en anden timepris end medarbejderens nuværende — fakturér via sagens fakturakladde, så timerne ikke omprisses`
  return null
}

export async function workOrderTimePricingBlock(admin: SupabaseClient, workOrderId: string): Promise<string | null> {
  const { data, error } = await admin.from('time_logs')
    .select('employee_id, sale_amount, sale_rate_snapshot')
    .eq('work_order_id', workOrderId)
    .is('invoice_line_id', null)
    .not('end_time', 'is', null)
    .eq('billable', true)
    .neq('approval_status', 'rejected')
  if (error) return 'kunne ikke kontrollere timernes priser — prøv igen'
  const rows = (data ?? []) as BillableTimeRow[]
  if (!rows.length) return null
  const ids = [...new Set(rows.map((r) => r.employee_id))]
  const { data: emps, error: empErr } = await admin.from('employees').select('id, hourly_rate').in('id', ids)
  if (empErr) return 'kunne ikke kontrollere medarbejdernes timepriser — prøv igen'
  const rate = new Map(((emps ?? []) as Array<{ id: string; hourly_rate: unknown }>).map((e) => [e.id, e.hourly_rate]))
  return timePricingBlock(rows, rate)
}
