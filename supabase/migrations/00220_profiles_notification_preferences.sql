-- 00220: personlige notifikationsindstillinger (Henrik 2026-10-10: "IMPLEMENTÉR dem").
-- profiles.notification_preferences fandtes IKKE i prod (00048 blev aldrig kørt dér), og authenticated har kun
-- UPDATE på (full_name, phone, department, updated_at) (00192) → indstillingssiden var skjult.
-- Format: {"<hændelse>": {"email": true|false, "push": false}}. Mangler en hændelse = FRA (ingen mails før man selv
-- slår dem til). Afsendere: lib/notifications/user-notify.ts (respekterer valget; push findes ikke endnu).
-- Rækken opdateres kun af brugeren selv (eksisterende profiles-politik: egen række). Ingen dataændring.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

GRANT UPDATE (notification_preferences) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
