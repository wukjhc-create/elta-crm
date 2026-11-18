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
export type BesigtigelseTaskLike = { title?: string | null; auto_rule?: string | null; due_date?: string | null; status?: string | null; customer_visible?: boolean | null }

/** Booket, kundevendt besigtigelse (må vises, bekræftes, ombookes og rykkes for bekræftelse) */
export function isBookedCustomerBesigtigelse(t: BesigtigelseTaskLike): boolean {
  return !t.auto_rule && /^besigtigelse hos /i.test((t.title ?? '').trim())
}

/** Kundens egen anmodning fra portalen (må vises i portalen, men ikke bekræftes/rykkes) */
export function isPortalBesigtigelseRequest(t: BesigtigelseTaskLike): boolean {
  return /^portal:\s*besigtigelse/i.test((t.title ?? '').trim())
}

/**
 * Portal-sikkerhedsreview 2026-11-18 (00252): synlighed udledes ALDRIG af titlen alene. En opgave er kun kundevendt,
 * når serveren eksplicit har sat customer_visible (efter afsendt booking-bekræftelse eller ved kundens egen
 * portal-anmodning) OG den er en besigtigelse. Manglende/false flag = intern.
 */
export function isPortalVisibleBesigtigelse(t: BesigtigelseTaskLike): boolean {
  return t.customer_visible === true && (isBookedCustomerBesigtigelse(t) || isPortalBesigtigelseRequest(t))
}

/** Må kunden bekræfte/ombooke opgaven i portalen? Kun en kundevendt, booket besigtigelse (ikke egen anmodning). */
export function isPortalConfirmableBesigtigelse(t: BesigtigelseTaskLike): boolean {
  return t.customer_visible === true && isBookedCustomerBesigtigelse(t)
}

/**
 * Flyt en booket besigtigelse (assistentens bekræftede "flyt"). Portalen viser datoen fra due_date, men klokkeslættet
 * fra beskrivelsens første "kl."-linje — så linjen skal følge med, ellers ser kunden ny dato med gammelt klokkeslæt.
 * Første linje ("Besigtigelse planlagt d. … kl. …") erstattes; en historiklinje tilføjes. Kunden får ingen besked.
 */
export function rescheduledBesigtigelseDescription(description: string | null | undefined, newDateLabel: string, newTime: string, movedOn: string): string {
  const lines = (description ?? '').split('\n')
  const first = lines[0] ?? ''
  const head = `Besigtigelse planlagt d. ${newDateLabel} kl. ${newTime}`
  const rest = /^besigtigelse planlagt d\. /i.test(first) ? lines.slice(1) : lines
  const history = `Flyttet d. ${movedOn} via assistenten${/^besigtigelse planlagt d\. /i.test(first) ? ` (før: ${first.replace(/^besigtigelse planlagt d\. /i, '')})` : ''} — kunden har ikke fået besked om den nye tid`
  return [head, ...rest.filter((l) => l.trim() !== ''), history].join('\n')
}

/** Må kunden rykkes for at bekræfte tiden? Kun bookede, åbne besigtigelser hvis tid endnu ikke er passeret. */
export function shouldRemindBesigtigelse(t: BesigtigelseTaskLike, now: Date = new Date()): boolean {
  // 00252: kunden rykkes kun om en besigtigelse hun kan se og bekræfte i portalen
  if (!isPortalConfirmableBesigtigelse(t) || t.status !== 'pending' || !t.due_date) return false
  return new Date(t.due_date).getTime() > now.getTime()
}
