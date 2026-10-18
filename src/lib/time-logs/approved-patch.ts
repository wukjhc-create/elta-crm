/**
 * Ren logik (ingen I/O): hvilke felter må stå i UPDATE'en på en GODKENDT tidsregistrering.
 *
 * EM-2 (review 2026-10-17): sats-triggeren (trg_time_logs_cost_amount) kører, når end_time/pay_rate_type m.fl. står i
 * SET-listen — også med samme værdi — og omprisede en godkendt registrering til dagens sats ved "Gem" uden ændring.
 * Uændrede felter udelades derfor.
 *
 * TT-1 (timer-review 2026-10-18): triggeren lytter IKKE på start_time. Ændres starttiden, skal end_time stå i
 * SET-listen, ellers blev sale/cost-beløbet stående på de gamle timer (8 t faktureret for en rettet 6 t-række).
 */
export interface ApprovedTimeLogCurrent {
  start_time?: string | null
  end_time?: string | null
  pay_rate_type?: string | null
  employee_rate_id?: string | null
}

const sameInstant = (a: unknown, b: unknown) =>
  (a == null && b == null) || (a != null && b != null && new Date(String(a)).getTime() === new Date(String(b)).getTime())

/** Muterer og returnerer patch: uændrede sats-felter fjernes; ændret starttid tager end_time med. */
export function normalizeApprovedTimeLogPatch(patch: Record<string, unknown>, cur: ApprovedTimeLogCurrent): Record<string, unknown> {
  if ('start_time' in patch && sameInstant(patch.start_time, cur.start_time)) delete patch.start_time
  const curEnd = cur.end_time ?? null
  if ('start_time' in patch) {
    if (!('end_time' in patch) && curEnd) patch.end_time = curEnd
  } else if ('end_time' in patch && sameInstant(patch.end_time, curEnd)) {
    delete patch.end_time
  }
  if ('pay_rate_type' in patch && patch.pay_rate_type === (cur.pay_rate_type ?? 'normal')) delete patch.pay_rate_type
  if ('employee_rate_id' in patch && (patch.employee_rate_id ?? null) === (cur.employee_rate_id ?? null)) delete patch.employee_rate_id
  return patch
}
