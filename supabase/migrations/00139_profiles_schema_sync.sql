-- =====================================================================
-- 00139: Sprint Ø2.2 Fase 1 — bring profiles-schema i sync med koden
-- =====================================================================
--
-- ROD (fra Ø2.1-audit, R1)
--   Prod `profiles` havde KUN {id, full_name, role, email, created_at}, men
--   koden læser/skriver kolonner der aldrig blev oprettet i prod:
--     - is_active   (updateTeamMember + login-gate)
--     - department  (updateTeamMember / team-UI)
--     - avatar_url  (profil-avatar upload/visning)
--     - phone       (profil)
--     - updated_at  (sættes ved hver update)
--   Konsekvens: updateTeamMember (rolle/aktiv-toggle) fejlede i prod, og en
--   login-deaktivering kunne ikke hænge på en kolonne der ikke fandtes.
--
-- ÆNDRING (additiv, ingen data røres)
--   Tilføjer de manglende kolonner som koden allerede forventer.
--   is_active default TRUE + NOT NULL → ALLE eksisterende brugere forbliver
--   aktive (ingen mister adgang). updated_at default now().
--
-- SCOPE / GARANTIER
--   - KUN ADD COLUMN IF NOT EXISTS. Idempotent. Ingen eksisterende rækker
--     ændrer adgang (is_active backfiller til TRUE for alle).
--   - INGEN trigger-/RLS-ændring her.
--
-- ROLLBACK
--   ALTER TABLE profiles DROP COLUMN IF EXISTS is_active;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS department;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_url;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS phone;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS updated_at;
--   NOTIFY pgrst, 'reload schema';
-- =====================================================================

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone      text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN profiles.is_active IS
  'Login-adgang. FALSE = brugeren kan ikke logge ind (gates i login-flow + auth-ban). Default TRUE.';

NOTIFY pgrst, 'reload schema';

COMMIT;
