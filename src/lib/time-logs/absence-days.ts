/**
 * FIN3-11 (finans-review 2 2026-10-20): timer på en fraværsdag (ferie/syg/kursus …) — ADVARSEL, ikke blokering (en halv
 * sygedag kan være reel). Bruges ved registrering (svar til brugeren) og i godkendelseslisten (mærke pr. række), så
 * løn/kost ikke godkendes dobbelt for samme dag uden at nogen har set det. Bevidst IKKE 'use server'.
 *
 * Læses med brugerens session: RLS (00228) viser admin/serviceleder/bogholderi alt og montøren kun eget fravær.
 */
import { absenceLabel, absencePeriodText, type AbsenceRow } from '@/lib/planning/absence'
import { selectInChunks } from '@/lib/supabase/in-chunks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any

/** Fravær pr. medarbejder der overlapper [fromDate, toDate] (YYYY-MM-DD, inklusive). */
export async function loadAbsencesFor(client: Client, employeeIds: string[], fromDate: string, toDate: string): Promise<AbsenceRow[]> {
  const ids = [...new Set(employeeIds.filter(Boolean))]
  if (!ids.length || !fromDate || !toDate) return []
  return selectInChunks<AbsenceRow>(ids, (chunk) => client
    .from('employee_absences')
    .select('id, employee_id, kind, start_date, end_date')
    .in('employee_id', chunk)
    .lte('start_date', toDate)
    .gte('end_date', fromDate))
}

/** Dansk advarsel til brugeren efter en registrering på en fraværsdag. */
export function absenceTimeLogWarning(r: Pick<AbsenceRow, 'kind' | 'start_date' | 'end_date'>): string {
  return `Bemærk: medarbejderen har ${absenceLabel(r.kind).toLowerCase()} ${absencePeriodText(r)} — timerne er gemt, men tjek at fraværet er korrekt`
}
