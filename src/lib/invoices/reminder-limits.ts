/**
 * Fælles loft for rykkermails pr. kørsel (cron og "Kør rykker-tjek nu"). Mail-review 2026-10-08 (#1): maxDuration 60 s
 * og en Graph-afsendelse kan tage op til 30 s — resten tages ved næste kørsel. Bevidst IKKE 'use server'.
 */
export const MAX_REMINDER_MAILS_PER_RUN = 3

/** F-10: tidsbudget pr. kørsel (maxDuration 60 s; en Graph-afsendelse kan tage op til 30 s) */
export const REMINDER_RUN_BUDGET_MS = 25_000

/**
 * Faktura-review 2026-10-14 (F-10): før talte fejlede afsendelser med i loftet på 3, og listen er altid ældste forfald
 * først — 3 fakturaer der fejler hver dag (fx ugyldig modtager) betød, at ingen andre fik rykker. Nu tæller kun SENDTE
 * i loftet; tidsbudgettet stopper kørslen, hvis afsendelser hænger.
 */
export function reminderRunExhausted(s: { sent: number; elapsedMs: number }): boolean {
  return s.sent >= MAX_REMINDER_MAILS_PER_RUN || s.elapsedMs >= REMINDER_RUN_BUDGET_MS
}

/** F-10: fakturaer med et nyligt fejlet rykkerforsøg tages sidst (stabil rækkefølge ellers) */
export function orderRemindersFailedLast<T extends { id: string }>(invoices: T[], recentlyFailedIds: ReadonlySet<string>): T[] {
  return [...invoices.filter((i) => !recentlyFailedIds.has(i.id)), ...invoices.filter((i) => recentlyFailedIds.has(i.id))]
}
