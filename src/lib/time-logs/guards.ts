/**
 * Vagter for timeregistrering (planlægnings-review 2026-10-07, X4). Bevidst IKKE 'use server'.
 *
 *  - Overlap: samme medarbejder kunne registrere 08–16 på job A og 08–16 på job B samme dag → 16 t løn og fakturering
 *    uden advarsel. En ny/flyttet registrering må ikke overlappe medarbejderens andre afsluttede registreringer.
 *  - Sats: createTimeLog/updateTimeLog tog ethvert employee_rate_id → en montør kunne via direkte kald sætte en kollegas
 *    eller en inaktiv (højere) overtidssats; DB-funktionen tjekker ikke ejer/aktiv. Satsen skal være medarbejderens egen
 *    og aktiv.
 */
import { copenhagenParts, copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'

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
    // Planlægnings-review 2026-10-14 (PL-1): en AFVIST registrering er ikke udført arbejde — den må ikke blokere, at
    // montøren registrerer tiden korrekt (fx på det rigtige job)
    .neq('approval_status', 'rejected')
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

/** PL-6: højst så mange timer i én registrering (fanger "80" i stedet for "8,0") */
export const MAX_HOURS_PER_TIME_LOG = 16

/**
 * PL-6 (planlægnings-review 2026-10-14): fornuftsgrænse for manuel tid — højst 16 t pr. registrering og ikke mere end
 * én dag frem (København). Returnerer en fejltekst eller null.
 */
export function timeLogSpanError(startIso: string, endIso: string, now: Date = new Date()): string | null {
  const hours = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000
  if (hours > MAX_HOURS_PER_TIME_LOG) {
    return `En registrering kan højst være ${MAX_HOURS_PER_TIME_LOG} timer (${hours.toLocaleString('da-DK', { maximumFractionDigits: 2 })} t angivet) — del den op eller ret tallet`
  }
  if (copenhagenParts(startIso).date > copenhagenDatePlusDays(1, now)) {
    return 'Tid kan ikke registreres mere end én dag frem'
  }
  return null
}

/**
 * Pilot-review 2026-10-15 (#7): nattevagt 22:00–02:00 blev afvist ("Sluttid skal være efter starttid"), fordi sluttiden
 * altid lå på startdatoen. Sluttid FØR starttid = næste dag (16-timersgrænsen fanger fejlindtastninger); samme klokkeslæt
 * er stadig en fejl (0 t, ikke 24 t). Returnerer sluttidens dato (YYYY-MM-DD) eller null ved ens klokkeslæt.
 */
export function endDateForClocks(date: string, startClock: string, endClock: string): string | null {
  if (endClock === startClock) return null
  if (endClock > startClock) return date
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}
