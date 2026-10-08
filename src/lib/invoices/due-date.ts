/**
 * Forfaldsdato ved UDSTEDELSE (ren logik). Bevidst IKKE 'use server'.
 *
 * Økonomi-review 2026-10-07 (X1): forfaldsdatoen blev sat da KLADDEN blev oprettet og aldrig flyttet ved afsendelse.
 * Kladde 1/10 (forfald 15/10) sendt 25/10 → rykker-cronen så fakturaen som 10 dage over forfald dagen efter kunden
 * modtog den. Ved afsendelse beholdes de valgte betalingsbetingelser (antal dage fra kladde til forfald), men de
 * regnes fra afsendelsesdagen — i dansk kalender.
 */
import { copenhagenParts, copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'

const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000

/**
 * Ny forfaldsdato (YYYY-MM-DD) ved afsendelse `now`, eller null hvis den ikke kan/skal flyttes
 * (ingen forfald, ingen oprettelsesdato, eller forfald før oprettelse).
 */
export function rebaseDueDateOnSend(createdAt: string | null | undefined, dueDate: string | null | undefined, now: Date = new Date()): string | null {
  if (!createdAt || !dueDate || !/^\d{4}-\d{2}-\d{2}/.test(dueDate)) return null
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null
  const terms = Math.round(dayNumber(dueDate.slice(0, 10)) - dayNumber(copenhagenParts(created).date))
  if (!Number.isFinite(terms) || terms < 0) return null
  return copenhagenDatePlusDays(terms, now)
}
