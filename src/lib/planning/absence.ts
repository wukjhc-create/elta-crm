/**
 * 00228 (Henrik 2026-10-15): fravær — kun type + periode (ingen helbredsdetaljer). Rene funktioner.
 * Planlægning på en fraværsdag = ADVARSEL + eksplicit override (admin/serviceleder, bekræftelse + audit) — ikke blokering.
 */

export const ABSENCE_KINDS = ['ferie', 'syg', 'kursus', 'afspadsering', 'andet'] as const
export type AbsenceKind = (typeof ABSENCE_KINDS)[number]

export const ABSENCE_LABEL: Record<AbsenceKind, string> = {
  ferie: 'Ferie', syg: 'Sygdom', kursus: 'Kursus', afspadsering: 'Afspadsering', andet: 'Fravær',
}

export interface AbsenceRow { id: string; employee_id: string; kind: string; start_date: string; end_date: string }

export function absenceLabel(kind: string): string {
  return ABSENCE_LABEL[kind as AbsenceKind] ?? 'Fravær'
}

/** Fravær der dækker datoen (YYYY-MM-DD; inklusive start/slut) */
export function absenceOn(rows: AbsenceRow[], employeeId: string, date: string): AbsenceRow | null {
  return rows.find((r) => r.employee_id === employeeId && r.start_date <= date && r.end_date >= date) ?? null
}

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function absencePeriodText(r: Pick<AbsenceRow, 'start_date' | 'end_date'>): string {
  return r.start_date === r.end_date ? fmt(r.start_date) : `${fmt(r.start_date)}–${fmt(r.end_date)}`
}

/** Fejlkode i server-svar: UI'et genkender den, beder om bekræftelse og sender igen med override */
export const ABSENCE_CONFLICT_PREFIX = 'FRAVÆR:'

export function absenceConflictMessage(employeeName: string | null, r: AbsenceRow): string {
  return `${ABSENCE_CONFLICT_PREFIX} ${employeeName ?? 'Medarbejderen'} har ${absenceLabel(r.kind).toLowerCase()} ${absencePeriodText(r)}. Planlæg alligevel?`
}

export function isAbsenceConflict(error: string | null | undefined): boolean {
  return !!error && error.startsWith(ABSENCE_CONFLICT_PREFIX)
}

export type AbsenceInputResult = { ok: true; value: { kind: AbsenceKind; start_date: string; end_date: string } } | { ok: false; error: string }

export function validateAbsenceInput(input: { kind: string; start_date: string; end_date: string }): AbsenceInputResult {
  if (!(ABSENCE_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: 'Ukendt fraværstype' }
  const re = /^\d{4}-\d{2}-\d{2}$/
  if (!re.test(input.start_date) || !re.test(input.end_date)) return { ok: false, error: 'Vælg fra- og til-dato' }
  if (input.end_date < input.start_date) return { ok: false, error: 'Til-dato skal være samme dag eller efter fra-dato' }
  const days = (Date.parse(`${input.end_date}T00:00:00Z`) - Date.parse(`${input.start_date}T00:00:00Z`)) / 86_400_000
  if (days > 366) return { ok: false, error: 'En fraværsperiode kan højst være et år — del den op' }
  return { ok: true, value: { kind: input.kind as AbsenceKind, start_date: input.start_date, end_date: input.end_date } }
}
