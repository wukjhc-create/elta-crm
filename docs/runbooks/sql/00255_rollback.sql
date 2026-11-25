-- 00255 ROLLBACK — KUN ved en egentlig beslutning om rollback (Henrik 2026-11-25: prod-rollback må ikke køres som test;
-- prod-verifikation sker rollback-only i scripts/prod-00255-dryrun.ts). Samme tekst som rollback-sektionen i
-- supabase/migrations/00255_party_write_rpcs.sql (scripts/party-phase-b-test.ts tjekker det).
-- Fjerner RPC'erne og CVR-indekset/-tjekket; genskaber 00254's direkte skrivepolitikker og grants præcist. Parter,
-- relationer, deltagere og audit_logs-rækker oprettet via RPC'erne bliver liggende (interne, eksternt usynlige).
BEGIN;
DROP FUNCTION IF EXISTS public.end_case_participant(uuid);
DROP FUNCTION IF EXISTS public.add_case_participant_for_register(uuid, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.add_case_participant(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.end_party_relationship(uuid, text);
DROP FUNCTION IF EXISTS public.set_party_relationship(uuid, text, text[]);
DROP FUNCTION IF EXISTS public.ensure_register_party(text, uuid);
DROP FUNCTION IF EXISTS public.update_party(uuid, text, uuid, text[], text[], text);
DROP FUNCTION IF EXISTS public.create_party(text, text, uuid, text[], text[], text, text, text);
DROP FUNCTION IF EXISTS public._party_register_visible(text, uuid);
DROP FUNCTION IF EXISTS public._party_require_user();
DROP FUNCTION IF EXISTS public._party_add_participant(uuid, uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public._party_ensure_register(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.party_normalize_vat(text);
DROP FUNCTION IF EXISTS public.party_normalize_domains(text[]);
DROP FUNCTION IF EXISTS public.party_normalize_emails(text[]);
DROP FUNCTION IF EXISTS public.party_normalize_name(text);
DROP INDEX IF EXISTS public.parties_vat_uniq;
ALTER TABLE public.parties DROP CONSTRAINT IF EXISTS parties_vat_digits;
CREATE POLICY parties_insert ON public.parties FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('parties.manage')) AND created_by = auth.uid()
              AND (customer_id IS NULL OR (SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])));
CREATE POLICY parties_update ON public.parties FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('parties.manage')))
  WITH CHECK ((SELECT public.user_has_permission('parties.manage'))
              AND (customer_id IS NULL OR (SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])));
CREATE POLICY party_relationships_insert ON public.party_relationships FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('parties.manage')) AND created_by = auth.uid() AND source IN ('manual', 'register'));
CREATE POLICY party_relationships_update ON public.party_relationships FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('parties.manage'))) WITH CHECK ((SELECT public.user_has_permission('parties.manage')));
CREATE POLICY case_participants_insert ON public.case_participants FOR INSERT TO authenticated
  WITH CHECK (((SELECT public.user_has_permission('parties.manage')) OR (SELECT public.user_has_permission('cases.edit')))
              AND created_by = auth.uid() AND public.case_visible_to_me(service_case_id) AND public.party_visible_to_me(party_id));
CREATE POLICY case_participants_update ON public.case_participants FOR UPDATE TO authenticated
  USING (((SELECT public.user_has_permission('parties.manage')) OR (SELECT public.user_has_permission('cases.edit'))) AND public.case_visible_to_me(service_case_id))
  WITH CHECK (((SELECT public.user_has_permission('parties.manage')) OR (SELECT public.user_has_permission('cases.edit'))) AND public.case_visible_to_me(service_case_id));
GRANT INSERT, UPDATE ON public.parties, public.party_relationships TO authenticated;
GRANT INSERT, UPDATE (role, note, ended_at) ON public.case_participants TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
