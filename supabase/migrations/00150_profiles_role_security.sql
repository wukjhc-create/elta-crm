-- =====================================================================
-- 00150: profiles.role sikkerhed — stop default-admin + luk self-escalation
-- =====================================================================
--
-- ROD (verificeret read-only mod prod 2026-06-21)
--   1) Live `handle_new_user`-trigger satte SLET ikke role (kun id+full_name).
--      Kolonne-default på profiles.role var 'admin'. Konsekvens: enhver ny
--      profil (public /register, team-invitation, direkte insert uden role)
--      faldt tilbage på role = 'admin'.
--   2) RLS-policy "Users can update own profile" havde INGEN WITH CHECK →
--      enhver autentificeret bruger kunne PATCH'e sin egen profil-række og
--      sætte role='admin' (privilege escalation via PostgREST).
--
-- ÆNDRING (additiv/defensiv — INGEN eksisterende rækker røres)
--   FIX A: default → 'montør' (least-privilege) + trigger sætter role
--          eksplicit til 'montør' og stoler ALDRIG på raw_user_meta_data->>'role'
--          (attacker-styret ved self-signup). Inviterede brugeres reelle rolle
--          sættes server-side via service-role-klient (inviteEmployeeLogin gør
--          allerede dette; team-invite justeres på team-kortet).
--   FIX B: BEFORE UPDATE-guard der afviser ændring af role/is_active når kaldet
--          kommer fra en almindelig (anon/authenticated) PostgREST-session og
--          den handlende ikke er admin. service_role (admin-klient), postgres
--          og migrationer er upåvirket. Genbruger user_role() fra 00108.
--
-- GARANTIER
--   - At ændre kolonne-default ændrer ALDRIG eksisterende rækker (3 admin /
--     2 montør forbliver præcis som nu).
--   - Guarden fyrer KUN når role ELLER is_active faktisk ændres.
--   - Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
--
-- ROLLBACK
--   ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'admin';
--   CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
--     LANGUAGE plpgsql SECURITY DEFINER AS $$
--     BEGIN
--       INSERT INTO public.profiles (id, full_name)
--       VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''));
--       RETURN NEW;
--     END; $$;
--   DROP TRIGGER IF EXISTS prevent_profile_privilege_change ON public.profiles;
--   DROP FUNCTION IF EXISTS public.prevent_profile_privilege_change();
--   NOTIFY pgrst, 'reload schema';
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- FIX A.1: least-privilege default (rører ikke eksisterende rækker)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'montør';

-- ---------------------------------------------------------------------
-- FIX A.2: trigger sætter role eksplicit + ignorerer untrusted metadata
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- role sættes ALDRIG fra raw_user_meta_data (attacker-styret ved self-signup).
  -- Inviterede brugeres reelle rolle sættes server-side via service-role-klient.
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'montør'
  );
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- FIX B: BEFORE UPDATE-guard mod self-escalation af role/is_active
-- ---------------------------------------------------------------------
-- VIGTIGT: SECURITY INVOKER (default) — IKKE definer. Vi aflæser current_user
-- for at se den faktiske PostgREST-rolle; under SECURITY DEFINER ville
-- current_user blive funktions-ejeren (postgres) og guarden ville aldrig fyre.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role)
     OR (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    -- Kun almindelige PostgREST-sessioner gates. service_role/postgres (admin-
    -- klient + migrationer) er undtaget. Admins må fortsat ændre.
    IF current_user IN ('anon', 'authenticated')
       AND COALESCE(user_role(auth.uid()), '') <> 'admin' THEN
      RAISE EXCEPTION 'Ændring af role/is_active kræver admin-rettigheder'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_change ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_change();

NOTIFY pgrst, 'reload schema';

COMMIT;
