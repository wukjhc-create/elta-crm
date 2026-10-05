-- 00192 — Kost-/løndata kan ikke læses direkte via API'et af salg/montør (T1, L1, M1 + P2), 2026-10-05
--
-- Analyse og kodesteder: docs/runbooks/rls-cost-columns.md. Henrik 2026-10-05: "færdiggør RLS-migration på STAGING —
-- salg og montør må ikke kunne læse cost/wage columns direkte; admin/bogholderi efter eksisterende permissions;
-- ingen prod migration uden approval".
--
-- Mekanik: kolonne-privilegier gælder databaserollen `authenticated` (alle brugere). Kostkolonnerne fjernes derfor fra
-- `authenticated`; app'en læser dem med service-role (admin-klienten) EFTER sine permission-gates (admin, serviceleder,
-- bogholderi). Rækkesynlighed er uændret. INSERT/UPDATE-rettigheder er uændrede (salg kan fortsat gemme den kost en
-- linje oprettes med — men ikke læse den tilbage).
--
-- Kræver at app-koden er udrullet FØRST (ingen select('*') / (*)-indlejringer / .select() efter skrivning på
-- tabellerne fra bruger-klienten) — ellers fejler de forespørgsler med "permission denied".
--
-- Rollback:
--   GRANT SELECT ON public.offer_line_items, public.supplier_products, public.time_logs TO authenticated;
--   GRANT UPDATE ON public.profiles TO authenticated;
--   DROP POLICY IF EXISTS work_order_profit_select_cost_roles ON public.work_order_profit;
--   CREATE POLICY work_order_profit_select_authenticated ON public.work_order_profit FOR SELECT TO authenticated USING (true);
--   GRANT EXECUTE ON FUNCTION public.calculate_work_order_profit(uuid) TO authenticated;
--   NOTIFY pgrst, 'reload schema';

BEGIN;

-- 1. Kostkolonner: tabel-SELECT fjernes, alle øvrige kolonner gives tilbage (genereret fra det faktiske skema)
DO $$
DECLARE
  t text;
  excluded text[];
  cols text;
BEGIN
  FOR t, excluded IN VALUES
    ('offer_line_items', ARRAY['cost_price', 'supplier_cost_price_at_creation', 'supplier_margin_applied', 'margin_percentage']),
    ('supplier_products', ARRAY['cost_price', 'margin_percentage']),
    ('time_logs', ARRAY['cost_amount', 'cost_rate_snapshot'])
  LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t AND NOT (column_name = ANY(excluded));
    IF cols IS NULL THEN
      RAISE EXCEPTION '00192: tabellen % findes ikke', t;
    END IF;
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, t);
  END LOOP;
END $$;

-- 2. Viewet med leverandørvarer (security_invoker) udstillede cost_price/margin_percentage — salg bruger det ikke efter
--    kodeændringen; kostroller læser via admin-klienten. Ingen ændring af selve viewet nødvendig: bruger-klientens
--    forespørgsler vælger kun ikke-kost-kolonner.

-- 3. Profit pr. arbejdsordre er ren kost/avance → kun kostroller (før USING (true) for alle)
DROP POLICY IF EXISTS work_order_profit_select_authenticated ON public.work_order_profit;
DROP POLICY IF EXISTS work_order_profit_select_cost_roles ON public.work_order_profit;
CREATE POLICY work_order_profit_select_cost_roles ON public.work_order_profit
  FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- 4. Kostberegningen kan kaldes af alle via REST (bruges kun via admin-klienten)
REVOKE EXECUTE ON FUNCTION public.calculate_work_order_profit(uuid) FROM PUBLIC, anon, authenticated;

-- 5. P2: brugere må kun selv opdatere ufarlige profilfelter (rolle/aktiv er allerede værnet af 00150-triggeren;
--    e-mail og avatar-sti kunne før sættes via REST). Avatar skrives server-side (admin-klienten).
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, phone, department, updated_at) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verifikation (staging): npx tsx scripts/test-harness/cli.ts cost-columns-check
--   salg/montør: offer_line_items.cost_price, supplier_products.cost_price, time_logs.cost_amount → "permission denied";
--   work_order_profit → 0 rækker; PATCH profiles.email/avatar_storage_path → afvist.
--   admin/serviceleder/bogholderi: app-sider med kost virker (U7, U8, U51, U66, U88, U91, U40, U62).
