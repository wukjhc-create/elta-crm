/**
 * Vagter for timeregistrering (planlægnings-review 2026-10-07, X4). Bevidst IKKE 'use server'.
 *
 *  - Overlap: samme medarbejder kunne registrere 08–16 på job A og 08–16 på job B samme dag → 16 t løn og fakturering
 *    uden advarsel. En ny/flyttet registrering må ikke overlappe medarbejderens andre afsluttede registreringer.
 *  - Sats: createTimeLog/updateTimeLog tog ethvert employee_rate_id → en montør kunne via direkte kald sætte en kollegas
 *    eller en inaktiv (højere) overtidssats; DB-funktionen tjekker ikke ejer/aktiv. Satsen skal være medarbejderens egen
 *    og aktiv.
 */
type Client = { from: (t: string) => any }

/** Halvåbne intervaller [start, end) overlapper (rene ISO-tidsstempler) */
export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime()
}

export async function findOverlappingTimeLog(
  supabase: Client,
  employeeId: string,
  startIso: string,
  endIso: string,
  excludeId?: string,
): Promise<{ id: string; start_time: string; end_time: string } | null> {
  let q = supabase.from('time_logs').select('id, start_time, end_time').eq('employee_id', employeeId)
    .not('end_time', 'is', null).lt('start_time', endIso).gt('end_time', startIso)
  if (excludeId) q = q.neq('id', excludeId)
  const { data } = await q.limit(1)
  const row = ((data ?? []) as Array<{ id: string; start_time: string; end_time: string }>)[0]
  return row && intervalsOverlap(startIso, endIso, row.start_time, row.end_time) ? row : null
}

/** Satsen skal tilhøre medarbejderen og være aktiv. Læses af kalderen med en klient der kan se satser (admin). */
export async function rateBelongsToEmployee(admin: Client, rateId: string, employeeId: string): Promise<boolean> {
  const { data } = await admin.from('employee_overtime_rates').select('id, employee_id, is_active').eq('id', rateId).maybeSingle()
  const r = data as { employee_id: string; is_active: boolean | null } | null
  return !!r && r.employee_id === employeeId && r.is_active !== false
}
