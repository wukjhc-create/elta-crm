-- 00254 ROLLBACK — identisk med den kommenterede ROLLBACK-blok nederst i supabase/migrations/00254_party_audience_foundation.sql
-- (prod-00254-dryrun.ts beviser at blokkene er ens og at denne tekst gendanner skemaet bit-for-bit).
-- Fjerner kun det nye: parter, relationer, deltagere og offentliggørelser går tabt; audit_logs-rækker (external_publication_*)
-- bliver. Eksisterende tabeller: kun conversations' tre nye kolonner fjernes. Kræver egen godkendelse før prod-kørsel.
BEGIN;
DROP TRIGGER IF EXISTS trg_conversations_party_guard ON public.conversations;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS source_party_id, DROP COLUMN IF EXISTS communication_class,
  DROP COLUMN IF EXISTS communication_class_source;
DROP TABLE IF EXISTS public.external_publications;
DROP TABLE IF EXISTS public.case_participants;
DROP TABLE IF EXISTS public.party_relationships;
DROP TABLE IF EXISTS public.parties;
DROP FUNCTION IF EXISTS public.external_feed(text, uuid);
DROP FUNCTION IF EXISTS public.revoke_external_publication(uuid);
DROP FUNCTION IF EXISTS public.publish_external(text, uuid, uuid, text, text, text, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.party_can_be_audience(uuid, text);
DROP FUNCTION IF EXISTS public.external_publications_guard();
DROP FUNCTION IF EXISTS public.party_relationships_guard();
DROP FUNCTION IF EXISTS public.conversations_party_guard();
DROP FUNCTION IF EXISTS public.party_visible_to_me(uuid);
DROP FUNCTION IF EXISTS public.case_visible_to_me(uuid);
DELETE FROM public.user_permission_overrides WHERE permission IN ('parties.manage', 'portal.publish');
DELETE FROM public.role_permission_defaults WHERE permission IN ('parties.manage', 'portal.publish');
DELETE FROM public.permission_catalog WHERE permission IN ('parties.manage', 'portal.publish');
NOTIFY pgrst, 'reload schema';
COMMIT;
