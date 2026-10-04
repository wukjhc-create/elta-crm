-- 00188 — profiles.email fra auth.users (AFVENTER HENRIK — køres IKKE uden godkendelse)
--
-- Problem (prod read-only 2026-10-04): profiles.email er tom for ALLE brugere — handle_new_user (00150) indsætter kun
-- id, full_name, role. Konsekvenser:
--   * admin-alarmer når ingen ("no_recipients" hver dag; fallback'en læser profiles.email)
--   * kundeportalen viser sælgeren uden e-mail; mailsignatur/faktura-mail-indstillinger finder ingen afsender-mail
-- Ændring:
--   1. handle_new_user sætter også email = NEW.email (nye brugere)
--   2. backfill: profiles.email = auth.users.email hvor profiles.email er tom (eksisterende brugere)
--   3. hold i sync: når auth.users.email ændres, opdateres profiles.email (kun hvis den var lig den gamle eller tom)
-- Ingen RLS-ændringer. Rollen sættes fortsat ALDRIG fra metadata (uændret fra 00150).
-- NB: login-e-mailen vises derefter for kunder i portalen (sælgerkontakt) — er den privat, ret profilens e-mail bagefter.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
--   DROP FUNCTION IF EXISTS public.sync_profile_email();
--   CREATE OR REPLACE FUNCTION public.handle_new_user() … (definitionen fra 00150, uden email)
--   (backfillen rulles ikke tilbage automatisk — gamle værdier var tomme)

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- role sættes ALDRIG fra raw_user_meta_data (attacker-styret ved self-signup).
  -- Inviterede brugeres reelle rolle sættes server-side via service-role-klient.
  INSERT INTO public.profiles (id, full_name, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'montør',
    NEW.email
  );
  RETURN NEW;
END;
$function$;

-- Backfill: kun tomme e-mails
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND (p.email IS NULL OR p.email = '')
  AND u.email IS NOT NULL;

-- Sync ved ændret login-e-mail (overskriver ikke en bevidst anderledes profil-e-mail)
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = NEW.email
    WHERE id = NEW.id AND (email IS NULL OR email = '' OR email = OLD.email);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

COMMIT;
