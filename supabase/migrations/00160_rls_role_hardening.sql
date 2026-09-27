-- =====================================================================
-- 00160: RLS-stramning af 8 foelsomme tabeller (pilot-gate, incident P-000)
-- =====================================================================
-- FUND (read-only, prod + staging, 2026-09-27 — npm run prod:role-policies)
--   invoices, invoice_payments, bank_transactions, incoming_invoices,
--   supplier_credentials, accounting_integration_settings, integration_settings,
--   time_logs havde USING (true) for ALLE indloggede — og 6 af dem ogsaa
--   WITH CHECK (true), dvs. enhver rolle (fx montoer) kunne laese OG
--   oprette/aendre/slette fakturaer, betalinger, banktransaktioner,
--   integrationsindstillinger og leverandoer-credentials direkte via REST.
--
-- PRINCIP — sikker delmaengde, ingen tilladt rolle mister en kodesti
--   Hver regel er afstemt mod (a) app-politikken i src/lib/auth/permissions.ts
--   og (b) en kortlaegning af ALLE app-kald til tabellerne: hvilke der bruger
--   den autentificerede klient (RLS gaelder) vs. admin-klienten (bypass).
--   * Skrivninger der KUN sker via admin-klienten -> ingen write-policy
--     (kun service_role kan skrive): invoices, invoice_payments,
--     bank_transactions, accounting_integration_settings, integration_settings.
--   * Laesning begraenses til de roller app-politikken giver adgang.
--   Rollen laeses via public.user_role() (SECURITY DEFINER, fail-safe 'montør').
--
-- REST-RISICI (bevidst IKKE lukket her — kraever kodeaendring, se rapport):
--   R1 salg kan laese ALLE fakturaer/betalinger (app viser kun egne sager;
--      raekkefilter pr. sag kraever omlaegning af service-case-economy).
--   R2 time_logs SELECT forbliver aaben for indloggede, og montoer-skrivning
--      begraenses paa rolle, ikke paa egen medarbejder (ejerskab gaar via
--      employee_id/work-order-scope i app-laget).
--   R3 supplier_credentials SELECT forbliver aaben (krypteret ciphertext;
--      tilbuds-embed laeser kun id/credential_type/is_active). Skrivning -> admin.
--
-- APP-EFFEKT (forventet og i traad med permissions.ts)
--   - dashboard/stats: faktura-/betalingstal = 0 for montoer (maa ikke se oekonomi)
--   - go-live-siden: e-conomic-status "ikke konfigureret" for andre end admin/bogholderi
--   - bank-siden: kun admin/bogholderi (bank.view)
--   - supplier-api-client last_test_*-opdatering fra ikke-admin kontekst paavirker 0 raekker
--   Cron-/API-stier der bruger server-klienten uden session er anon og var
--   i forvejen uden adgang (alle policies er TO authenticated) — uaendret.
--
-- ROLLBACK (genskaber praecis de tidligere policies)
--   BEGIN;
--   DROP POLICY IF EXISTS invoices_select_by_role ON public.invoices;
--   CREATE POLICY "invoices_all_auth" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   DROP POLICY IF EXISTS invoice_payments_select_by_role ON public.invoice_payments;
--   CREATE POLICY "invoice_payments_all_auth" ON public.invoice_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   DROP POLICY IF EXISTS bank_transactions_select_by_role ON public.bank_transactions;
--   CREATE POLICY "bank_tx_all_auth" ON public.bank_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   DROP POLICY IF EXISTS incoming_invoices_select_by_role ON public.incoming_invoices;
--   DROP POLICY IF EXISTS incoming_invoices_update_by_role ON public.incoming_invoices;
--   DROP POLICY IF EXISTS incoming_invoices_insert_admin ON public.incoming_invoices;
--   DROP POLICY IF EXISTS incoming_invoices_delete_admin ON public.incoming_invoices;
--   CREATE POLICY "incoming_invoices_all_auth" ON public.incoming_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   DROP POLICY IF EXISTS supplier_credentials_write_admin ON public.supplier_credentials;
--   DROP POLICY IF EXISTS supplier_credentials_update_admin ON public.supplier_credentials;
--   DROP POLICY IF EXISTS supplier_credentials_delete_admin ON public.supplier_credentials;
--   CREATE POLICY "Authenticated users can delete supplier credentials" ON public.supplier_credentials FOR DELETE TO authenticated USING (true);
--   CREATE POLICY "Authenticated users can manage supplier credentials" ON public.supplier_credentials FOR INSERT TO authenticated WITH CHECK (true);
--   CREATE POLICY "Authenticated users can update supplier credentials" ON public.supplier_credentials FOR UPDATE TO authenticated USING (true);
--   DROP POLICY IF EXISTS accounting_integration_settings_select_by_role ON public.accounting_integration_settings;
--   CREATE POLICY "acc_settings_select_auth" ON public.accounting_integration_settings FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS integration_settings_select_admin ON public.integration_settings;
--   CREATE POLICY "auth_all_integration_settings" ON public.integration_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   CREATE POLICY "auth_read_integration_settings" ON public.integration_settings FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS time_logs_select_auth ON public.time_logs;
--   DROP POLICY IF EXISTS time_logs_insert_by_role ON public.time_logs;
--   DROP POLICY IF EXISTS time_logs_update_by_role ON public.time_logs;
--   CREATE POLICY "time_logs_all_auth" ON public.time_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- KOER IKKE MOD PRODUCTION uden eksplicit approval. Staging: npm run harness:migrate-staging -- 00160
-- Verifikation: npm run harness:pilot-roles (staging) / npm run prod:role-policies (read-only)
-- =====================================================================

BEGIN;

-- invoices: laes = invoices.view.all + view.own_cases (salg, se R1); skriv = kun service_role
DROP POLICY IF EXISTS "invoices_all_auth" ON public.invoices;
DROP POLICY IF EXISTS invoices_select_by_role ON public.invoices;
CREATE POLICY invoices_select_by_role ON public.invoices FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi', 'salg'));

-- invoice_payments: som invoices
DROP POLICY IF EXISTS "invoice_payments_all_auth" ON public.invoice_payments;
DROP POLICY IF EXISTS invoice_payments_select_by_role ON public.invoice_payments;
CREATE POLICY invoice_payments_select_by_role ON public.invoice_payments FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi', 'salg'));

-- bank_transactions: laes = bank.view; skriv = kun service_role
DROP POLICY IF EXISTS "bank_tx_all_auth" ON public.bank_transactions;
DROP POLICY IF EXISTS bank_transactions_select_by_role ON public.bank_transactions;
CREATE POLICY bank_transactions_select_by_role ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'bogholderi'));

-- incoming_invoices: laes = incoming_invoices.view; ret = .edit; opret/slet = admin (som app-stierne)
DROP POLICY IF EXISTS "incoming_invoices_all_auth" ON public.incoming_invoices;
DROP POLICY IF EXISTS incoming_invoices_select_by_role ON public.incoming_invoices;
DROP POLICY IF EXISTS incoming_invoices_update_by_role ON public.incoming_invoices;
DROP POLICY IF EXISTS incoming_invoices_insert_admin ON public.incoming_invoices;
DROP POLICY IF EXISTS incoming_invoices_delete_admin ON public.incoming_invoices;
CREATE POLICY incoming_invoices_select_by_role ON public.incoming_invoices FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));
CREATE POLICY incoming_invoices_update_by_role ON public.incoming_invoices FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'bogholderi'))
  WITH CHECK (public.user_role() IN ('admin', 'bogholderi'));
CREATE POLICY incoming_invoices_insert_admin ON public.incoming_invoices FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');
CREATE POLICY incoming_invoices_delete_admin ON public.incoming_invoices FOR DELETE TO authenticated
  USING (public.user_role() = 'admin');

-- supplier_credentials: laes uaendret (R3); skriv = settings.suppliers (admin)
DROP POLICY IF EXISTS "Authenticated users can delete supplier credentials" ON public.supplier_credentials;
DROP POLICY IF EXISTS "Authenticated users can manage supplier credentials" ON public.supplier_credentials;
DROP POLICY IF EXISTS "Authenticated users can update supplier credentials" ON public.supplier_credentials;
DROP POLICY IF EXISTS supplier_credentials_write_admin ON public.supplier_credentials;
DROP POLICY IF EXISTS supplier_credentials_update_admin ON public.supplier_credentials;
DROP POLICY IF EXISTS supplier_credentials_delete_admin ON public.supplier_credentials;
CREATE POLICY supplier_credentials_write_admin ON public.supplier_credentials FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');
CREATE POLICY supplier_credentials_update_admin ON public.supplier_credentials FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin') WITH CHECK (public.user_role() = 'admin');
CREATE POLICY supplier_credentials_delete_admin ON public.supplier_credentials FOR DELETE TO authenticated
  USING (public.user_role() = 'admin');

-- accounting_integration_settings: laes = settings.economic; skriv = kun service_role (uaendret)
DROP POLICY IF EXISTS "acc_settings_select_auth" ON public.accounting_integration_settings;
DROP POLICY IF EXISTS accounting_integration_settings_select_by_role ON public.accounting_integration_settings;
CREATE POLICY accounting_integration_settings_select_by_role ON public.accounting_integration_settings FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'bogholderi'));

-- integration_settings: ingen app-adgang via JS; laes = admin; skriv = kun service_role
DROP POLICY IF EXISTS "auth_all_integration_settings" ON public.integration_settings;
DROP POLICY IF EXISTS "auth_read_integration_settings" ON public.integration_settings;
DROP POLICY IF EXISTS integration_settings_select_admin ON public.integration_settings;
CREATE POLICY integration_settings_select_admin ON public.integration_settings FOR SELECT TO authenticated
  USING (public.user_role() = 'admin');

-- time_logs: laes uaendret aaben (R2); opret/ret = time_logs.create/edit (admin, serviceleder, montør); slet = service_role
DROP POLICY IF EXISTS "time_logs_all_auth" ON public.time_logs;
DROP POLICY IF EXISTS time_logs_select_auth ON public.time_logs;
DROP POLICY IF EXISTS time_logs_insert_by_role ON public.time_logs;
DROP POLICY IF EXISTS time_logs_update_by_role ON public.time_logs;
CREATE POLICY time_logs_select_auth ON public.time_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY time_logs_insert_by_role ON public.time_logs FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));
CREATE POLICY time_logs_update_by_role ON public.time_logs FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'montør'))
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));

NOTIFY pgrst, 'reload schema';

COMMIT;
