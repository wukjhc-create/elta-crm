/**
 * Fælles loft for rykkermails pr. kørsel (cron og "Kør rykker-tjek nu"). Mail-review 2026-10-08 (#1): maxDuration 60 s
 * og en Graph-afsendelse kan tage op til 30 s — resten tages ved næste kørsel. Bevidst IKKE 'use server'.
 */
export const MAX_REMINDER_MAILS_PER_RUN = 3
