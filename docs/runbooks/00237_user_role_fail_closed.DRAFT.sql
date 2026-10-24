-- =====================================================================
-- FORSLAG 00237 — SEC-B10: user_role() fail-closed (manglende eller inaktiv profil = 'ingen_adgang')
--
-- STATUS: DRAFT — IKKE ANVENDT. Kræver særskilt godkendelse pr. miljø.
-- Fund (per-medarbejder-kortlægning 2026-10-24): 00108's user_role() gav COALESCE(role, 'montør') og ignorerede
-- is_active → en bruger uden profil fik montør-rettigheder i RLS, og en deaktiveret medarbejder beholdt sin rolle i RLS
-- så længe et udstedt access-token gælder (≤ ca. 1 t; deaktivering ban'er også auth-brugeren). Appen (TS) er allerede
-- fail-closed (readRoleCached → 'ingen_adgang').
-- Prod 2026-10-24 (scripts/prod-sec-b10-precheck.ts): 5 auth-brugere, 0 uden profil, 0 inaktive → latent, ingen eksponering nu.
-- Sikkerhed: alle ~200 policies er allowlists (user_role() IN (...) / = '…'); guard-triggere tjekker current_user først
-- (00150/00213/00235). 'ingen_adgang' findes i ingen liste → ændringen kan KUN fjerne adgang, aldrig give.
-- Signatur, SECURITY DEFINER og grants uændrede (CREATE OR REPLACE bevarer ACL: authenticated + service_role, jf. 00162).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.user_role(p_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = p_user_id AND is_active),
    'ingen_adgang'
  );
$$;

COMMIT;

-- ROLLBACK (kun ved reel regression):
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.user_role(p_user_id uuid DEFAULT auth.uid()) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path = public AS $$ SELECT COALESCE((SELECT role FROM profiles WHERE id = p_user_id), 'montør'); $$;
-- COMMIT;
