# DB-sikkerhed (review 2026-10-16) — migrationsforslag, BLOCKED_APPROVAL

**Status:** forslag. Intet kørt. Hver migration kræver egen godkendelse (nr/formål/risiko/pre-post). Procesregel:
kompatibel kode først → push → migration → post-check → `npx tsx scripts/prod-db-audit.ts`.
App-værn der allerede er i koden er markeret.

| # | Fund | Alvor | App-værn i kode | Forslag |
|---|---|---|---|---|
| DB-1 | `ai_suggestions` (type `margin_alert`) viser margin/avance/omsætning til alle indloggede (`SELECT USING (true)`, 00174); 00222's trigger skriver nu flere rækker | S2 | — | 00238: SELECT-politik `type <> 'margin_alert' OR user_role() IN ('admin','serviceleder','bogholderi')` |
| DB-2 | `case_materials`/`case_other_costs` kostkolonner læsbare for alle (= F-11) | S2 | actions stripper kost bag gate | 00234 (allerede forslag: docs/runbooks/cost-columns-case-materials-proposal.md) |
| DB-3 | Kladdelåsen (00215) kan omgås: accepteret/sendt → `status='draft'` → ret linjer → tilbage; `vat_mode`/`billing_model` ikke i låsen | S2 | app: kun kladder redigeres (edit-lock.ts), men direkte REST-PATCH går uden om | 00239: udvid `offers_draft_lock_guard` (afvis sent/viewed/accepted → draft; accepteret → anden status; sammenlign `vat_mode`, `billing_model`) |
| DB-4 | 00218-backfill gjorde `document_type='internal'` synlige i portalen | S2 | **ja (denne bølge):** portal + partner udelukker `internal`; deling af interne afvises | 00240: `UPDATE customer_documents SET visible_in_portal=false WHERE document_type='internal'` + CHECK `NOT (visible_in_portal AND document_type='internal')` — pre-check: antal berørte rækker i prod |
| DB-5 | `trg_invoice_snapshot_profit` SECURITY DEFINER uden REVOKE (hygiejne, som 00225) | S4 | — | `REVOKE ALL ON FUNCTION public.trg_invoice_snapshot_profit() FROM PUBLIC, anon, authenticated` |
| DB-6 | EXECUTE til authenticated på RPC'er kun admin-klienten kalder: `snapshot_work_order_profit`, `apply_package_to_offer`, `create_invoice_from_work_order` | S4 | alle kald via admin-klient | REVOKE fra PUBLIC/anon/authenticated + GRANT til service_role |
| DB-7 | 00222 nulstillede `search_path` på `calculate_work_order_profit`/`snapshot_work_order_profit` | S4 | — | `ALTER FUNCTION … SET search_path = public, pg_temp` |
| DB-8 | Bogholderi kan læse sygefravær (`kind='syg'`) for alle (00228) | S3? | — | **Beslutning (GDPR):** er det tilsigtet? Ellers fjern bogholderi fra SELECT-politikken |

Pre-check (kun SELECT) før DB-4: `select count(*) from customer_documents where document_type='internal' and visible_in_portal`.
DB-1/DB-5/DB-6/DB-7 kan samles i én hygiejne-migration efter godkendelse; DB-3 og DB-4 hver for sig (adfærd).
