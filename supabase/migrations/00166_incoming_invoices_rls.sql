-- =====================================================================
-- 00166 — leverandoerfakturaer: rollebaseret RLS paa LINJER og AUDIT-LOG (fakturapipeline F-d)
--
-- Baggrund: 00160 laaste incoming_invoices (laes = admin/serviceleder/bogholderi; ret = admin/bogholderi;
-- opret/slet = admin). Men de to undertabeller havde stadig `FOR ALL TO authenticated USING (true) WITH CHECK (true)`:
--   * incoming_invoice_lines      — enhver indlogget (montoer, salg) kunne laese leverandoerpriser pr. vare og
--                                   rette/slette fakturalinjer direkte via REST
--   * incoming_invoice_audit_log  — enhver indlogget kunne rette eller SLETTE audit-spor
-- Denne migration giver dem samme model som hovedtabellen (00160), og audit-loggen bliver append-only.
--
--   incoming_invoice_lines      SELECT admin/serviceleder/bogholderi · UPDATE admin/bogholderi · INSERT/DELETE admin
--   incoming_invoice_audit_log  SELECT + INSERT admin/serviceleder/bogholderi · ALDRIG UPDATE/DELETE for indloggede
--   anon                        ingen grants paa de tre tabeller
-- incoming_invoices selv aendres IKKE (00160 gaelder). ii_*-policies fjernes kun hvis de findes (fra en tidligere
-- staging-udgave af denne fil — i prod er det en no-op). Service-role paavirkes ikke. Ingen data aendres.
--
-- Rollback:
--   DROP POLICY IF EXISTS iil_select ON public.incoming_invoice_lines; (+ iil_update/iil_insert/iil_delete, iia_select/iia_insert)
--   CREATE POLICY incoming_invoice_lines_all_auth ON public.incoming_invoice_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   CREATE POLICY incoming_invoice_audit_all_auth ON public.incoming_invoice_audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   GRANT UPDATE, DELETE ON public.incoming_invoice_audit_log TO authenticated;
-- =====================================================================

BEGIN;

REVOKE ALL ON public.incoming_invoices, public.incoming_invoice_lines, public.incoming_invoice_audit_log FROM anon;

-- oprydning af en tidligere staging-udgave (bredere end 00160 — maa ikke eksistere)
DROP POLICY IF EXISTS ii_select ON public.incoming_invoices;
DROP POLICY IF EXISTS ii_insert ON public.incoming_invoices;
DROP POLICY IF EXISTS ii_update ON public.incoming_invoices;
DROP POLICY IF EXISTS ii_delete ON public.incoming_invoices;

-- ---- incoming_invoice_lines (samme model som hovedtabellen i 00160)
DROP POLICY IF EXISTS incoming_invoice_lines_all_auth ON public.incoming_invoice_lines;
DROP POLICY IF EXISTS iil_select ON public.incoming_invoice_lines;
DROP POLICY IF EXISTS iil_insert ON public.incoming_invoice_lines;
DROP POLICY IF EXISTS iil_update ON public.incoming_invoice_lines;
DROP POLICY IF EXISTS iil_delete ON public.incoming_invoice_lines;
CREATE POLICY iil_select ON public.incoming_invoice_lines FOR SELECT TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));
CREATE POLICY iil_update ON public.incoming_invoice_lines FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'bogholderi')) WITH CHECK (public.user_role() IN ('admin', 'bogholderi'));
CREATE POLICY iil_insert ON public.incoming_invoice_lines FOR INSERT TO authenticated WITH CHECK (public.user_role() = 'admin');
CREATE POLICY iil_delete ON public.incoming_invoice_lines FOR DELETE TO authenticated USING (public.user_role() = 'admin');

-- ---- incoming_invoice_audit_log (append-only)
DROP POLICY IF EXISTS incoming_invoice_audit_all_auth ON public.incoming_invoice_audit_log;
DROP POLICY IF EXISTS iia_select ON public.incoming_invoice_audit_log;
DROP POLICY IF EXISTS iia_insert ON public.incoming_invoice_audit_log;
CREATE POLICY iia_select ON public.incoming_invoice_audit_log FOR SELECT TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));
CREATE POLICY iia_insert ON public.incoming_invoice_audit_log FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));
REVOKE UPDATE, DELETE ON public.incoming_invoice_audit_log FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
