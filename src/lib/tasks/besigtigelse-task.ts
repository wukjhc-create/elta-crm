/**
 * Hvilke kundeopgaver er en KUNDEVENDT besigtigelse? (ren logik). Bevidst IKKE 'use server'.
 *
 * Kommunikations-review 2026-10-07 (X4): rykker-cronen og kundeportalen matchede alt med "esigtigelse" i titlen —
 * også den INTERNE opstartsopgave "Planlæg besigtigelse eller montage" (oprettes ved hver tilbud→sag, også ved accept i
 * portalen) og assistent-/manuelle opgaver. Kunden fik 3 dage efter accept en mail om at bekræfte en besigtigelse ingen
 * havde foreslået, og kunne "bekræfte" interne opgaver i portalen.
 *
 *  - Booket besigtigelse (bookBesigtigelse — kunden har fået tid + ICS): titel "Besigtigelse hos …", ingen auto_rule.
 *  - Kundens egen portal-anmodning: titel "PORTAL: Besigtigelse …" (Elta skal handle — kunden skal ikke bekræfte/rykkes).
 */
export type BesigtigelseTaskLike = { title?: string | null; auto_rule?: string | null; due_date?: string | null; status?: string | null }

/** Booket, kundevendt besigtigelse (må vises, bekræftes, ombookes og rykkes for bekræftelse) */
export function isBookedCustomerBesigtigelse(t: BesigtigelseTaskLike): boolean {
  return !t.auto_rule && /^besigtigelse hos /i.test((t.title ?? '').trim())
}

/** Kundens egen anmodning fra portalen (må vises i portalen, men ikke bekræftes/rykkes) */
export function isPortalBesigtigelseRequest(t: BesigtigelseTaskLike): boolean {
  return /^portal:\s*besigtigelse/i.test((t.title ?? '').trim())
}

/** Må kunden rykkes for at bekræfte tiden? Kun bookede, åbne besigtigelser hvis tid endnu ikke er passeret. */
export function shouldRemindBesigtigelse(t: BesigtigelseTaskLike, now: Date = new Date()): boolean {
  if (!isBookedCustomerBesigtigelse(t) || t.status !== 'pending' || !t.due_date) return false
  return new Date(t.due_date).getTime() > now.getTime()
}
