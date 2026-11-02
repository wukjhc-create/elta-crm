-- =====================================================================================================================
-- 00245 — customer_notes efter NUTIDENS rettighedsmodel (erstatter 00196 som vej til prod)
--
-- STAGING FØRST (Henrik 2026-11-02). PROD KRÆVER SÆRSKILT GODKENDELSE.
-- Baggrund: 00196 (kun staging) oprettede customer_notes med SELECT USING (true) og rå rolle-skrivning. 00241 strammede
-- læsningen på staging, men kørte i prod mens tabellen ikke fandtes. 00196 må derfor IKKE anvendes på prod; denne
-- migration opretter/bringer tabellen i paritet med 00240/00241-modellen, uanset om den findes (staging) eller ej (prod).
--
-- Regler:
--   SELECT  customers.view.all ELLER kunden i my_customer_scope_ids()                                   (= 00241)
--   INSERT  customers.edit + kunden i læse-scope (view.all ELLER my_customer_scope_ids()) + created_by = mig
--           + source = 'manual' (assistent/telegram/system skriver kun via service-role)
--   UPDATE  kun kolonnen content (kolonne-grant) · rækken i læse-scope · customers.edit · egen note ELLER
--           customers.notes.manage
--   DELETE  rækken i læse-scope · customers.edit · egen note ELLER customers.notes.manage
--   Ny nøgle customers.notes.manage (standard admin + serviceleder = 00196's "admin/serviceleder må rette/slette andres
--   noter", nu som effektiv rettighed i stedet for rå rolle; kan tildeles/fratages pr. medarbejder).
--   Inaktiv/manglende profil: user_has_permission = false og my_customer_scope_ids() = {} → intet.
--   anon/PUBLIC: ingen adgang. service_role: fuld (kontrollerede server-stier, fx assistenten).
-- case_notes.source tilføjes kun hvis den mangler (prod). Ingen eksisterende kunde-/sags-/note-data ændres.
-- Test (staging): npx tsx scripts/test-harness/cli.ts notes-00245-probe (rollback-only) · notes-00245-state (read-only)
-- Prod-tjek: npx tsx scripts/prod-verify-00245.ts pre|post (read-only)
-- =====================================================================================================================
BEGIN;

-- 0. Forudsætninger: 00238/00240-hjælpere og nøgler; findes tabellen, skal den have den forventede form
DO $guard$
BEGIN
  IF to_regprocedure('public.user_has_permission(text)') IS NULL OR to_regprocedure('public.my_customer_scope_ids()') IS NULL THEN
    RAISE EXCEPTION '00245: user_has_permission/my_customer_scope_ids mangler — 00238/00240 skal være anvendt';
  END IF;
  IF (SELECT count(*) FROM public.permission_catalog WHERE permission IN ('customers.view', 'customers.view.all', 'customers.edit')) <> 3 THEN
    RAISE EXCEPTION '00245: forudsatte rettighedsnøgler mangler i permission_catalog';
  END IF;
  IF to_regclass('public.customer_notes') IS NOT NULL AND (
       SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customer_notes'
     ) <> 'content,created_at,created_by,customer_id,id,source' THEN
    RAISE EXCEPTION '00245: customer_notes findes med uventede kolonner — kontrollér før kørsel';
  END IF;
END
$guard$;

-- 1. case_notes.source (kun hvis den mangler; eksisterende rækker får standardværdien 'manual')
ALTER TABLE public.case_notes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'assistant', 'telegram', 'system'));

-- 2. customer_notes (samme form som 00196; eksisterende tabel røres ikke)
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'assistant', 'telegram', 'system')),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON public.customer_notes (customer_id, created_at DESC);
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

-- 3. Ny nøgle customers.notes.manage (= src/lib/auth/permissions.ts)
INSERT INTO public.permission_catalog (permission) VALUES ('customers.notes.manage') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_defaults (role, permission) VALUES
  ('admin', 'customers.notes.manage'),
  ('serviceleder', 'customers.notes.manage')
ON CONFLICT DO NOTHING;

-- 4. Politikker: fjern ALLE eksisterende (00196: _select/_insert/_update/_delete · 00241: _select_scope) og opret de fire
DO $drop$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_notes' LOOP
    EXECUTE format('DROP POLICY %I ON public.customer_notes', p.policyname);
  END LOOP;
END
$drop$;

CREATE POLICY customer_notes_select_scope ON public.customer_notes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('customers.view.all'))
    OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
  );

CREATE POLICY customer_notes_insert_scope ON public.customer_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.user_has_permission('customers.edit'))
    AND created_by = (SELECT auth.uid())
    AND source = 'manual'
    AND (
      (SELECT public.user_has_permission('customers.view.all'))
      OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
    )
  );

CREATE POLICY customer_notes_update_scope ON public.customer_notes
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.user_has_permission('customers.edit'))
    AND (created_by = (SELECT auth.uid()) OR (SELECT public.user_has_permission('customers.notes.manage')))
    AND (
      (SELECT public.user_has_permission('customers.view.all'))
      OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
    )
  )
  WITH CHECK (
    (SELECT public.user_has_permission('customers.edit'))
    AND (created_by = (SELECT auth.uid()) OR (SELECT public.user_has_permission('customers.notes.manage')))
    AND (
      (SELECT public.user_has_permission('customers.view.all'))
      OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
    )
  );

CREATE POLICY customer_notes_delete_scope ON public.customer_notes
  FOR DELETE TO authenticated
  USING (
    (SELECT public.user_has_permission('customers.edit'))
    AND (created_by = (SELECT auth.uid()) OR (SELECT public.user_has_permission('customers.notes.manage')))
    AND (
      (SELECT public.user_has_permission('customers.view.all'))
      OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
    )
  );

-- 5. Grants: anon/PUBLIC intet · authenticated SELECT/INSERT/DELETE + UPDATE kun content · service_role alt
REVOKE ALL ON public.customer_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.customer_notes TO authenticated;
GRANT UPDATE (content) ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ROLLBACK (manuel; bevarer data — fjerner kun de nye regler, tabellen bliver uden politikker = lukket for brugere):
-- BEGIN;
-- DROP POLICY IF EXISTS customer_notes_select_scope ON public.customer_notes;
-- DROP POLICY IF EXISTS customer_notes_insert_scope ON public.customer_notes;
-- DROP POLICY IF EXISTS customer_notes_update_scope ON public.customer_notes;
-- DROP POLICY IF EXISTS customer_notes_delete_scope ON public.customer_notes;
-- DELETE FROM public.role_permission_defaults WHERE permission = 'customers.notes.manage';
-- DELETE FROM public.user_permission_overrides WHERE permission = 'customers.notes.manage';
-- DELETE FROM public.permission_catalog WHERE permission = 'customers.notes.manage';
-- COMMIT;
-- (Prod: tabellen og case_notes.source kan fjernes med DROP TABLE public.customer_notes; / ALTER TABLE public.case_notes
--  DROP COLUMN source; — KUN hvis ingen noter er skrevet. Brede 00196-politikker genskabes ALDRIG.)
