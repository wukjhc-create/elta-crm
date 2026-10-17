# Sikkerhed/økonomi 2026-10-17 — migrationsforslag (BLOCKED_APPROVAL)

Kilde: review-bølgen NEXT-29 (docs/AUTONOMOUS_BACKLOG.md). Kodedelen af hvert fund er lavet. Her står kun det, der
kræver skemaændring.

Regler for hver migration:
- Den skal godkendes særskilt (nummer, formål, risiko, pre- og post-tjek).
- Rækkefølgen er CODE → TEST → PUSH → MIGRATION → POST-CHECK.
- Pre-tjek mod prod gøres read-only (`pg_policies`). Prod kan afvige fra migrationsfilerne.

Numrene er foreløbige. 00237–00240 er allerede reserveret til tidligere forslag.

## 00241 — integration_webhooks: kun admin må ændre; headers ikke læsbare (SEC2-2)
**Fund:** `integration_webhooks_update_role` tillader admin, serviceleder og salg uden kolonnegrænse (00171:105). SELECT
er `USING (true)`.
- En salgsbruger kan ændre `url`. Næste hændelse sender så de dekrypterede API-nøgler til en fremmed vært.
- Koden afviser nu http og private værter og følger ikke omdirigeringer, men en offentlig fremmed vært kan stadig
  modtage nøglerne.

**Prod-status:** 0 webhooks (`scripts/prod-webhook-urls.ts`). Ændringen har ingen effekt på eksisterende data.

```sql
DROP POLICY IF EXISTS integration_webhooks_update_role ON public.integration_webhooks;
CREATE POLICY integration_webhooks_update_role ON public.integration_webhooks FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin') WITH CHECK (public.user_role() = 'admin');
DROP POLICY IF EXISTS integration_webhooks_select_authenticated ON public.integration_webhooks;
CREATE POLICY integration_webhooks_select_role ON public.integration_webhooks FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));
```

- **Pre-tjek:** `pg_policies` for tabellen. Find også read-sites med andre roller via `scripts/rls/read-sites.ts`.
  Tællerne skrives med service-role (webhook-dispatch), så det er upåvirket.
- **Post-tjek:** check:rls-matrix og db-audit 0/0/0.

## 00242 — customer_documents: følsomme kolonner kun for admin/serviceleder (SEC2-4)
**Fund:** `customer_documents_update_role` tillader montør og salg at opdatere alle rækker og kolonner (00170:90). Det
gælder også `visible_in_portal`, `source_email_id`, `document_type`, `storage_path` og `customer_id`. Dermed kan app-værnet
omgås via REST, så interne dokumenter havner i portalen.

Forslaget er en trigger, så montørens almindelige opdateringer (titel, sag) stadig virker:

```sql
CREATE OR REPLACE FUNCTION public.customer_documents_guard_sensitive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.user_role() IN ('admin', 'serviceleder') THEN RETURN NEW; END IF;
  IF NEW.visible_in_portal IS DISTINCT FROM OLD.visible_in_portal
     OR NEW.source_email_id IS DISTINCT FROM OLD.source_email_id
     OR NEW.document_type IS DISTINCT FROM OLD.document_type
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'Kun admin/serviceleder må ændre dokumentets portal-synlighed, type, sti eller kunde';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.customer_documents_guard_sensitive() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_customer_documents_guard_sensitive BEFORE UPDATE ON public.customer_documents
  FOR EACH ROW EXECUTE FUNCTION public.customer_documents_guard_sensitive();
```

- **Pre-tjek:** find hvilke app-stier der ændrer disse kolonner med brugerklient fra andre roller end admin og
  serviceleder (fx kobling af dokument til sag ændrer kun `service_case_id`).
- **Post-tjek:** UI-testene for dokumenter, upload og portal-synlighed.

## 00243 — solar_products.price og solar-kostnøgler (C-F2)
**Fund:** `"Authenticated users can read solar products"` er `USING (true)` (00020:50). Appen fjerner `price` for salg,
men REST udleverer den stadig. `calculation_settings` har nøglerne `solar_labor_cost_per_hour` og
`solar_base_installation_cost`, som heller ikke er dækket af 00223.

**Forslag:** Følg 00192-mønstret, dvs. kolonne-SELECT på `solar_products` uden `price` for `authenticated`. Appen læser
prisen med admin-klienten bag `tools.solar_calc`. Tilføj de to nøgler til det skjulte nøglesæt i 00223. Det kræver en
ændring i `solar-products.ts` før migrationen (kompatibel kode først).

## 00244 — kostkolonner i AI- og kalkulationstabeller (C-F3)
**Tabeller:**
- `auto_calculations`: `auto_calculations_select_authenticated`, `USING (true)`, 00178:24
- `calculation_snapshots`: `"calculation_snapshots_select"`, `USING (true)`, 00032:497. Tjek også insert- og
  update-politikkerne `USING (true)` i prod.
- `calculation_feedback`

**Forslag:** Følg wave-2a-mønstret, `<t>_select_cost_roles USING (public.user_role() IN ('admin','serviceleder','bogholderi'))`.
- **Før migrationen:** kør read-site-tjek, og gate `learning.ts` `recordProjectFeedback` med `tools.ai_project`.
- **Pre-tjek:** rækkeantal pr. tabel, read-only.

## 00245 — én slutfaktura pr. sag, men kun blandt ikke-annullerede (FIN-2)
**Fund:** `uq_invoices_one_final_per_case` står i 00105:95 som `WHERE is_final_invoice = true AND case_id IS NOT NULL`. En
fuldt krediteret (annulleret) slutfaktura blokerer derfor en rettet slutfaktura for altid.

```sql
DROP INDEX IF EXISTS public.uq_invoices_one_final_per_case;
CREATE UNIQUE INDEX uq_invoices_one_final_per_case ON public.invoices(case_id)
  WHERE is_final_invoice = true AND case_id IS NOT NULL AND voided_at IS NULL;
```

- **Rækkefølge:** kodedelen kommer først (FIN-2: `.is('voided_at', null)` i de tre tjek). Skal koordineres med DF-5
  (kreditnota frigiver `invoice_line_id`).
- **Pre-tjek:** 0 sager med flere ikke-annullerede slutfakturaer.

## 00246 — tidsregistrering: kun omprisning ved reel ændring + fakturalås (EM-2)
**Fund:** `trg_time_logs_cost_amount` kører på `UPDATE OF end_time, employee_id, pay_rate_type, employee_rate_id` (00142).
Postgres udløser triggeren, når kolonnen står i SET-listen, også med samme værdi. Den omprissede derfor til dagens sats.
- Appen udelader nu uændrede felter for godkendte registreringer.
- Via REST kan en montør dog stadig sende `end_time` med samme værdi på egen faktureret række.

**Forslag:**
- I triggerfunktionen: genberegn kun når `NEW.x IS DISTINCT FROM OLD.x` for de fire kolonner.
- En BEFORE UPDATE-guard, der afviser ændring af tid/sats, når `OLD.invoice_line_id IS NOT NULL`, medmindre det er
  service-role.

**Pre-tjek:** antal fakturerede registreringer, og at ingen app-sti opdaterer dem bevidst. Fakturakreditering frigiver via
service-role (DF-5).

## 00247 — user_role()/is_admin() for deaktiverede brugere (EM-7)
**Fund:** `user_role()` (00108) og `is_admin()` (00156) læser kun `profiles.role`. En deaktiveret bruger beholder sine
RLS-rettigheder, indtil JWT'en udløber; ban stopper kun fornyelsen.

**Forslag:**
```sql
-- Skitse: samme signatur; NULL-rolle når profilen er deaktiveret
SELECT CASE WHEN p.is_active IS FALSE THEN NULL ELSE p.role END FROM public.profiles p WHERE p.id = auth.uid();
```
**Pre-tjek:**
- Ingen politik må forvente en rolle for inaktive brugere.
- Funktions-ACL skal være uændret (REVOKE FROM PUBLIC/anon).

## (følger 00241) integration_webhooks SELECT kun admin + maskerede headers (EM-8)
- Dækkes af 00241-forslaget (SELECT kun admin/serviceleder/bogholderi).
- Kun-admin på headers kræver kolonne-REVOKE af `headers` for `authenticated` og læsning med admin-klienten i
  `getWebhooks`/`getIntegration`.
- Redigeringsformularen skal sende headers separat. Ellers gemmes en maske tilbage.
