-- =====================================================================
-- 00170 — P-009 RLS-skrivelås, WAVE1 (customers, customer_contacts, offers, offer_line_items, portal_access_tokens, customer_documents, incoming_emails)
--
-- GENERERET af scripts/rls/build-migration.ts fra scripts/rls/write-matrix.ts — ret matrixen, ikke denne fil.
--
-- Fund (P-009, S2 systemisk, prod read-only 2026-09-29): skrive-policies USING/WITH CHECK (true) -> enhver indlogget
-- kunne via REST oprette/rette/slette paa tvaers af roller (RBAC blev kun haandhaevet i server-actions).
-- Nu: praecis de roller appen skriver med via bruger-sessionen (AST-kortlagt: scripts/rls-write-sites.ts;
-- CI: npm run check:rls-matrix). Laesning (SELECT) er UAENDRET. anon mister alle tabel-grants.
-- service-role (cron, portal, sync) paavirkes ikke af RLS.
--
-- Rollback: genskab de droppede policies (navne i DROP-linjerne) som USING/WITH CHECK (true) for authenticated.
-- =====================================================================

BEGIN;

-- customers: opret: customers.create + offers.create + opret-fra-mail (inbox.view, inkl. montør) · ret: customers.edit/tools.pricing · slet: customers.delete
REVOKE ALL ON public.customers FROM anon;
DROP POLICY IF EXISTS "Users can create customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete customers" ON public.customers;
DROP POLICY IF EXISTS customers_insert_role ON public.customers;
DROP POLICY IF EXISTS customers_update_role ON public.customers;
DROP POLICY IF EXISTS customers_delete_role ON public.customers;
DROP POLICY IF EXISTS customers_select_authenticated ON public.customers;
CREATE POLICY customers_insert_role ON public.customers FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));
CREATE POLICY customers_update_role ON public.customers FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY customers_delete_role ON public.customers FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- customer_contacts: customers.edit + opret-fra-mail (inbox.view) + sags-kontakt (cases.edit)
REVOKE ALL ON public.customer_contacts FROM anon;
DROP POLICY IF EXISTS "Users can manage customer contacts" ON public.customer_contacts;
DROP POLICY IF EXISTS customer_contacts_insert_role ON public.customer_contacts;
DROP POLICY IF EXISTS customer_contacts_update_role ON public.customer_contacts;
DROP POLICY IF EXISTS customer_contacts_delete_role ON public.customer_contacts;
DROP POLICY IF EXISTS customer_contacts_select_authenticated ON public.customer_contacts;
CREATE POLICY customer_contacts_select_authenticated ON public.customer_contacts FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY customer_contacts_insert_role ON public.customer_contacts FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));
CREATE POLICY customer_contacts_update_role ON public.customer_contacts FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY customer_contacts_delete_role ON public.customer_contacts FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- offers: offers.create/edit/send, tools.calculations, cases.create · slet: offers.delete (admin) + afvis forslag
REVOKE ALL ON public.offers FROM anon;
DROP POLICY IF EXISTS "Users can create offers" ON public.offers;
DROP POLICY IF EXISTS "Users can update offers" ON public.offers;
DROP POLICY IF EXISTS "Users can delete offers" ON public.offers;
DROP POLICY IF EXISTS offers_insert_role ON public.offers;
DROP POLICY IF EXISTS offers_update_role ON public.offers;
DROP POLICY IF EXISTS offers_delete_role ON public.offers;
DROP POLICY IF EXISTS offers_select_authenticated ON public.offers;
CREATE POLICY offers_insert_role ON public.offers FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg') AND created_by = auth.uid());
CREATE POLICY offers_update_role ON public.offers FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY offers_delete_role ON public.offers FOR DELETE TO authenticated USING ((public.user_role() IN ('admin')) OR (public.user_role() IN ('serviceleder', 'salg') AND is_proposal = true));

-- offer_line_items: offers.edit, tools.calculations, tools.ai_project
REVOKE ALL ON public.offer_line_items FROM anon;
DROP POLICY IF EXISTS "Users can manage line items" ON public.offer_line_items;
DROP POLICY IF EXISTS offer_line_items_insert_role ON public.offer_line_items;
DROP POLICY IF EXISTS offer_line_items_update_role ON public.offer_line_items;
DROP POLICY IF EXISTS offer_line_items_delete_role ON public.offer_line_items;
DROP POLICY IF EXISTS offer_line_items_select_authenticated ON public.offer_line_items;
CREATE POLICY offer_line_items_select_authenticated ON public.offer_line_items FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY offer_line_items_insert_role ON public.offer_line_items FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY offer_line_items_update_role ON public.offer_line_items FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY offer_line_items_delete_role ON public.offer_line_items FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- portal_access_tokens: offers.send (opret/deaktivér portal-adgang); validering sker med service-role
REVOKE ALL ON public.portal_access_tokens FROM anon;
DROP POLICY IF EXISTS "Employees can create portal tokens" ON public.portal_access_tokens;
DROP POLICY IF EXISTS "Employees can update portal tokens" ON public.portal_access_tokens;
DROP POLICY IF EXISTS "Employees can delete portal tokens" ON public.portal_access_tokens;
DROP POLICY IF EXISTS portal_access_tokens_insert_role ON public.portal_access_tokens;
DROP POLICY IF EXISTS portal_access_tokens_update_role ON public.portal_access_tokens;
DROP POLICY IF EXISTS portal_access_tokens_delete_role ON public.portal_access_tokens;
DROP POLICY IF EXISTS portal_access_tokens_select_authenticated ON public.portal_access_tokens;
CREATE POLICY portal_access_tokens_insert_role ON public.portal_access_tokens FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg') AND created_by = auth.uid());
CREATE POLICY portal_access_tokens_update_role ON public.portal_access_tokens FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY portal_access_tokens_delete_role ON public.portal_access_tokens FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- customer_documents: upload (customers.view = alle roller), besigtigelse/fuldmagt (service.edit), tilbud (offers.send), sag (cases.*), mail (inbox.view); sletning kun service-role i appen
REVOKE ALL ON public.customer_documents FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage customer documents" ON public.customer_documents;
DROP POLICY IF EXISTS "auth_all_customer_documents" ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_insert_role ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_update_role ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_delete_role ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_select_authenticated ON public.customer_documents;
CREATE POLICY customer_documents_select_authenticated ON public.customer_documents FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY customer_documents_insert_role ON public.customer_documents FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
CREATE POLICY customer_documents_update_role ON public.customer_documents FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg'));
CREATE POLICY customer_documents_delete_role ON public.customer_documents FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- incoming_emails: indsaet: sendte mails (inbox.send, offers.send, tasks.edit, customers.edit) · ret: laest/kobling (inbox.view, cases.create, customers.view) · slet: kun service-role i appen
REVOKE ALL ON public.incoming_emails FROM anon;
DROP POLICY IF EXISTS "incoming_emails_insert" ON public.incoming_emails;
DROP POLICY IF EXISTS "incoming_emails_update" ON public.incoming_emails;
DROP POLICY IF EXISTS "incoming_emails_delete" ON public.incoming_emails;
DROP POLICY IF EXISTS incoming_emails_insert_role ON public.incoming_emails;
DROP POLICY IF EXISTS incoming_emails_update_role ON public.incoming_emails;
DROP POLICY IF EXISTS incoming_emails_delete_role ON public.incoming_emails;
DROP POLICY IF EXISTS incoming_emails_select_authenticated ON public.incoming_emails;
CREATE POLICY incoming_emails_insert_role ON public.incoming_emails FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg'));
CREATE POLICY incoming_emails_update_role ON public.incoming_emails FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
CREATE POLICY incoming_emails_delete_role ON public.incoming_emails FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

NOTIFY pgrst, 'reload schema';

COMMIT;
