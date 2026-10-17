/**
 * Kontakter for automatiske kunde-rykkere (cron-review 2026-10-17, CR-1/CR-2). Ren modul — bevidst IKKE 'use server'.
 *
 *  - Betalingsrykkere (invoice-reminders + regel-motorens send_reminder): sendes KUN når INVOICE_REMINDERS_LIVE=true.
 *    Prod 2026-10-17 (scripts/prod-reminder-status.ts): 0 sendt nogensinde — alle kørsler "Faktura ikke fundet"
 *    (mail-routerens anon-klient). Uden kontakten ville en rettelse af routeren straks rykke på gamle forfaldne
 *    fakturaer. Standard fra = samme udfald som i dag. Manuelle rykkere fra fakturasiden berøres ikke.
 *  - Fuldmagt-/besigtigelsesrykkere (offer-reminders afsnit 2+3) kører i dag LIVE. FOLLOWUP_REMINDERS_PAUSED=true er et
 *    nødstop; standard (ikke sat) = uændret adfærd. Om de skal bag et live-flag er Henriks beslutning (CR-1).
 *  - Tilbudsrykkere: OFFER_REMINDERS_LIVE (lib/offers/offer-reminder-plan.ts).
 *  - Hele cron'en: CRON_PAUSED=<navn> (lib/services/cron-run.ts).
 */

const isTrue = (v: string | undefined) => (v ?? '').trim().toLowerCase() === 'true'

export function invoiceRemindersLive(env: Record<string, string | undefined> = process.env): boolean {
  return isTrue(env.INVOICE_REMINDERS_LIVE)
}

export function followUpRemindersPaused(env: Record<string, string | undefined> = process.env): boolean {
  return isTrue(env.FOLLOWUP_REMINDERS_PAUSED)
}
