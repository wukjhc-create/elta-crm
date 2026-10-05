import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Legacy /view-offer/[id] — mails linkede hertil, før portal-links med token.
 *
 * Sikkerhedsreview 2026-10-04 (S1): ruten kræver intet login og slog med admin-klienten kundens AKTIVE portal-token op
 * ud fra tilbuddets UUID og videresendte til /portal/<token>/… — dvs. enhver med et tilbuds-id (webhook-modtagere,
 * en medarbejder-URL i en skærmdeling, logs) fik fuld portaladgang (beskeder, fakturaer, dokumenter, accept/afvis).
 * Et tilbuds-id er ikke en adgangsnøgle: ruten udleverer aldrig et token, men viser "ugyldigt/udløbet link" med
 * besked om at kontakte sælgeren (samme side som et udløbet portallink).
 */
export default async function ViewOfferPage() {
  redirect('/portal/invalid')
}
