-- =====================================================================
-- 00155: C — storage_path som source of truth for avatar + firmalogo
-- =====================================================================
-- FORMÅL
--   Muliggør lazy-refresh af signed URLs (avatar) og en stabil app-route
--   for firmalogo (/api/brand/logo), saa udgaaende mails ikke laengere
--   baerer udloebende Supabase signed URLs (ingen token-laekage, ingen
--   broken image efter TTL-udloeb). attachments-bucket forbliver PRIVAT.
--
-- INGEN DATA-MIGRATION
--   Prod har 0 logoer og 0 avatars sat paa migrations-tidspunktet, saa
--   der er intet at backfille. Nye kolonner udfyldes fremadrettet af
--   uploadProfileAvatar / uploadCompanyLogo.
--
-- SCOPE (bevidst minimal)
--   - KUN to nye nullable text-kolonner.
--   - INGEN RLS-aendring (kolonner arver tabellernes eksisterende policies).
--   - INGEN aendring af eksisterende data.
--
-- ROLLBACK
--   ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_storage_path;
--   ALTER TABLE company_settings DROP COLUMN IF EXISTS company_logo_storage_path;
-- =====================================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_storage_path text;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS company_logo_storage_path text;

COMMENT ON COLUMN profiles.avatar_storage_path IS
  'Sti i attachments-bucket (avatars/...). Source of truth; avatar_url er cache/fallback, regenereres som signed URL ved laesning.';
COMMENT ON COLUMN company_settings.company_logo_storage_path IS
  'Sti i attachments-bucket (logos/...). Source of truth; logoet serveres via den stabile app-route /api/brand/logo.';

NOTIFY pgrst, 'reload schema';

COMMIT;
