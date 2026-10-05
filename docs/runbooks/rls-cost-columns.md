# RLS: kost-/løndata via direkte API (T1, L1, M1, K3) — analyse og plan

Read-only analyse 2026-10-05 (intet anvendt). Problemet: app'en skjuler kost/løn for salg og montør, men databasen gør
ikke — med den offentlige anon-nøgle + eget login kan de læse kolonnerne direkte via PostgREST.
Før SQL skrives færdig: tjek i prod med `SELECT * … LIMIT 1` at `customer_documents.source_email_id` og
`email_threads.service_case_id` findes (oprettes ikke i nogen migration i repoet).

## Mekanik (vigtigt)

- Kolonne-privilegier gælder databaserollen `authenticated` — de kan IKKE skelne salg fra admin. Fjernes en kolonne,
  mister ALLE bruger-klient-læsninger den (også admin/serviceleder/bogholderi).
- `REVOKE SELECT (kol)` virker ikke så længe tabel-`GRANT SELECT` findes → revoke hele tabellen, grant de tilladte
  kolonner tilbage.
- For en rolle uden kolonnen fejler `select('*')`, indlejringer `x(*)` og `insert/update(...).select()`. INSERT/UPDATE
  uden RETURNING virker fortsat. SECURITY INVOKER-funktioner der læser kolonnen fejler; DEFINER gør ikke.

## Nuværende tilstand

| Tabel | SELECT-policy | Kostkolonner |
|---|---|---|
| offer_line_items | `USING (true)` (00170:62) | cost_price, supplier_cost_price_at_creation, supplier_margin_applied, margin_percentage |
| supplier_products | `USING (true)` (00014:407) | cost_price, margin_percentage, calculated_sale_price |
| time_logs | `can_view_time_log` — montør egne + kollegers på egne ordrer, salg på egne sager (00161) | cost_amount, cost_rate_snapshot (+ sale_*) |
| customer_documents | `USING (true)` (00170:88) | rækker med source_email_id (mail-vedhæftninger) |
| email_threads / email_messages | `USING (true)` (00033) | tilbudsmails |

Også: `work_order_profit` (`USING (true)`), `product_catalog.cost_price`, `kalkia_variant_materials`, `case_materials`,
`case_other_costs`, `customer_supplier_prices`, `employees.cost_rate`; `calculate_work_order_profit` har
`GRANT EXECUTE TO authenticated` (kun brugt via admin-klient → bør revokes).

## Anbefalet plan

**Trin 1 — rækkebegrænsning (lav risiko): customer_documents + email_*** (samme mønster som 00180)

```sql
DROP POLICY customer_documents_select_authenticated ON public.customer_documents;
CREATE POLICY customer_documents_select_scoped ON public.customer_documents FOR SELECT TO authenticated USING (
  source_email_id IS NULL
  OR public.user_role() IN ('admin','serviceleder','salg','bogholderi')
  OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
);
DROP POLICY "email_threads_select" ON public.email_threads;
CREATE POLICY email_threads_select_scoped ON public.email_threads FOR SELECT TO authenticated USING (
  public.user_role() IN ('admin','serviceleder','salg','bogholderi') OR created_by = auth.uid()
  OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id)));
DROP POLICY "email_messages_select" ON public.email_messages;
CREATE POLICY email_messages_select_scoped ON public.email_messages FOR SELECT TO authenticated USING (
  created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.email_threads t WHERE t.id = thread_id));
NOTIFY pgrst, 'reload schema';
```
Beslutning: må montør se mail-vedhæftninger på egne sager (G9 tillader mails på egne sager)? Hvis nej: fjern montør-
linjen og tilføj `.is('source_email_id', null)` i `getDocumentsForCase` uden `customers.emails.view`. Kode: gate
`email.ts`-læserne (295/348/414/1027/1195) med `offers.view`/`inbox.view`; `task-mail.ts:213` kræver `created_by`-grenen.

**Trin 2 — kolonne-REVOKE + kostlæsninger flyttes til admin-klient bag eksisterende gates** (pr. tabel:
supplier_products → offer_line_items → time_logs; hver gang staging + `harness:pilot-roles` + rls-matrix)

```sql
DO $$ DECLARE t text; ex text[]; cols text; BEGIN
 FOR t, ex IN VALUES
  ('supplier_products', ARRAY['cost_price','margin_percentage','calculated_sale_price']),
  ('offer_line_items', ARRAY['cost_price','supplier_cost_price_at_creation','supplier_margin_applied','margin_percentage']),
  ('time_logs', ARRAY['cost_amount','cost_rate_snapshot'])
 LOOP
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = t AND NOT (column_name = ANY(ex));
  EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', t);
  EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, t);
 END LOOP; END $$;
REVOKE EXECUTE ON FUNCTION public.calculate_work_order_profit(uuid) FROM authenticated;
NOTIFY pgrst, 'reload schema';
-- Rollback: GRANT SELECT ON public.<tabel> TO authenticated;
```

Kodeændringer (~45 steder, liste i analysen nedenfor):
1. Alle `select('*')`, `(*)`-indlejringer og `.select()` efter insert/update på tabellerne → eksplicit kolonneliste
   uden kost (fx fælles `OFFER_LINE_PUBLIC_COLUMNS`).
2. Hvor en kostrolle skal se kost: læs kost med `createAdminClient()` EFTER den eksisterende gate og flet ind
   (erstatter `stripLineCost`/`stripTimeLogPrices`).
3. Salgs-stier der i dag bruger kost: `low-db-status` (send-tilbud), `duplicateOfferAction`, `refreshLineItemPrice`,
   leverandørsøgning (offers.ts 1357/1541/2085 + supplier-api-client cache), `offer-to-case` → admin-klient bag gate.
4. View `v_supplier_products_with_supplier` (security_invoker) fejler for alle bruger-klienter → fjern kostkolonner fra
   viewet eller læs via admin-klient.
5. Udvid `check:rls-matrix` så nye kolonner på de tre tabeller kræver eksplicit grant.

## Berørte kodesteder (bruger-klient)

- offer_line_items, salg rammer: offers.ts 199 (getOffer `(*)`), 813, 876, 963, 1451, 2053, 2609; email.ts 592, 742;
  lib/offers/low-db-status.ts:12; api/offers/[id]/pdf:45; projects.ts:771 (UDEN gate); services/offer-to-case.ts:90.
  Kun kostroller: case-offer-vs-actual.ts:45, profit.ts 54/85/128, reports.ts:425, price-analytics.ts:215,
  offers.ts 2020/2214, price-engine.ts:188.
- supplier_products, salg: offers.ts 1357/1541/1830/2085, supplier-api-client.ts 705/749/806/848/893/925.
  Kostroller: offers.ts 2025/2255/2309/2336, profit.ts 97/102/135, price-engine.ts:93, price-analytics.ts:347,
  products.ts 795/799, kalkia-supplier-prices.ts 43/154/233/333/448/720, suppliers.ts 340/344/437/474/578,
  supplier-sync.ts:131, import.ts:267, lemu-sync.ts:240.
- time_logs, montør: time-logs.ts 76/135 (stripper i dag), 274/418 (`select('*')`). Kostroller: time-logs.ts:479,
  case-offer-vs-actual.ts:54, service-case-economy.ts:197, reports.ts:402, services/employee-economy.ts:102.

Lukket i kode 2026-10-05 (app-niveau): `getKalkiaNode`/`getKalkiaVariants` (indlejrede leverandør-kostpris uden gate)
→ `settings.view` som siden.

## Status 2026-10-05: migration 00192 på STAGING (prod: afventer godkendelse)

`supabase/migrations/00192_cost_columns_lockdown.sql` (anvendt på staging med `npm run harness:migrate-staging -- 00192`):
- kolonne-REVOKE af kostkolonner for `authenticated`/`anon`: offer_line_items (cost_price, supplier_cost_price_at_creation, supplier_margin_applied, margin_percentage), supplier_products (cost_price, margin_percentage), time_logs (cost_amount, cost_rate_snapshot) — alle øvrige kolonner genudlevet (genereret fra skemaet)
- `work_order_profit`: SELECT kun admin/serviceleder/bogholderi (før `USING (true)`)
- `calculate_work_order_profit`: EXECUTE fjernet fra brugere
- P2: brugere må kun selv opdatere `profiles.full_name, phone, department, updated_at` (avatar skrives server-side)

Verifikation med rigtige rolle-sessioner (`npx tsx scripts/test-harness/cli.ts cost-columns-check`, persona-login via Auth for admin/serviceleder/montør/salg/bogholderi):
- FØR migrationen: 51 af 71 tjek fejlede (alle roller kunne læse kostkolonnerne; salg/montør kunne selv sætte profil-e-mail/avatar-sti)
- EFTER: **75/75 som forventet** — ingen rolle kan læse kost/løn direkte, ikke-kost-kolonner virker, work_order_profit kun for kostroller, profil-e-mail/avatar afvist, navn tilladt

App-kode (udrulles FØR migrationen i prod; virker også uden migrationen): bruger-klienten vælger kun ikke-kost-kolonner
(`lib/offers/line-columns.ts`, `lib/suppliers/product-columns.ts`, `lib/time-logs/columns.ts`); kost læses med admin-klienten
efter de eksisterende gates (offers.view.cost_prices, economy.cost_prices, products.view.cost_prices, tools.*); DB-funktioner
der læser kost (invoker: apply/insert_package, get_effective_margin, calculate_sale_price, get_customer_product_price,
get_best_price_for_customer) kaldes med admin-klienten — `insertPackageIntoOffer` tjekker først tilbuddets synlighed via
brugerens klient. Lav-DB-advarslen gælder fortsat alle roller; salg ser ikke DB-procenten.

Prod-rækkefølge (kræver Henriks godkendelse af migrationen): 1) app-koden pushes (allerede bagudkompatibel), 2)
`npm run prod:apply-migration -- 00192 --approved-by-henrik` (+ allowlist-post), 3) `cost-columns-check`-svarende
read-only tjek i prod + U7/U8/U51/U66/U88/U91/U77/U50 mod staging.
