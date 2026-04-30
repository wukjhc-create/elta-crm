# Supplier Phase 3 — Audit Report

Snapshot date: 2026-04-28
Scope: AO + Lemvigh-Müller integration end-to-end.

## What works today

| Layer | Status | Detail |
|---|---|---|
| Suppliers table | ✅ | 2 rows: `AO` (api), `LM` (ftp) |
| `supplier_products` | ✅ | 282,935 rows; all have `cost_price > 0` |
| `supplier_credentials` | ✅ | AO `api` active, last test status `success`. LM `ftp` active, never tested. |
| `supplier_settings` | ✅ | Per-supplier import format, CSV mapping, FTP host, `adapter_code`, `sync_config` |
| `supplier_margin_rules` | ✅ | Priority hierarchy of margins (supplier/category/sub_category/product/customer) |
| `customer_supplier_prices` | ✅ | Discount + custom margin per customer/supplier |
| `customer_product_prices` | ✅ | Per-customer overrides on individual `supplier_product_id` |
| DB functions | ✅ | `get_customer_product_price()`, `get_best_price_for_customer()`, `get_effective_margin()`, `calculate_sale_price()` |
| Adapter framework | ✅ | `supplier-adapter.ts` with AO + LM adapters and registry |
| Sync engine | ✅ | `supplier-sync.ts`, `lemu-sync.ts`, `supplier-ftp-sync.ts`, jobs/logs tables |
| Nightly cron | ✅ | `/api/cron/supplier-sync` at 02:00 UTC, parallelizes per-supplier syncs |
| Local search | ✅ | `searchSupplierProductsForOffer()` (offers.ts) ranks by customer-effective price |
| Live search | ✅ | `searchSupplierProductsLive()` parallel-calls active API suppliers, falls back to local |
| Offer line creation | ✅ | `createLineItemFromSupplierProduct()` writes `supplier_*` tracking fields |
| Kalkia integration | ✅ | `kalkia_variant_materials` joins material → `supplier_product_id`; `kalkia-supplier-prices.ts` provides live pricing in calculations |
| Health monitoring | ✅ | `supplier-health.ts`, `SupplierHealthOverview` widget |
| LM API | n/a | `LMAPIClient` deleted (no real API); LM is CSV/FTP only via `LMClassicClient` and `supplier-ftp-sync.ts` |

## What's missing for Phase 3

| Gap | Effort | Built this turn |
|---|---|---|
| Single-call best-price lookup `getBestSupplierPrice(q)` for service-side use (no auth context) | XS | ✅ |
| Starter line items per detected intent (solar/service/installation) | S | ✅ |
| Auto-draft offer pre-populates lines when supplier match exists | S | ✅ |
| LM FTP credential health-check (`last_test_status`) | XS | not blocking — left for ops |

## Production-safe design choices

- **No fake live API.** The new helper queries the local `supplier_products` mirror only. AO/LM live calls remain inside the existing `searchSupplierProductsLive()` / adapter framework, which already gracefully falls back when credentials are missing.
- **No new tables.** "Internal material → supplier product" already exists as `kalkia_variant_materials.supplier_product_id`. Starter items rely on direct `supplier_products` text match; later, they can move to a dedicated `kalkia_starter_packs` view without breaking the contract.
- **No silent column changes.** All new code matches the production schema verified live.

## Credential / ops notes

- AO API key present and last sync `success` — `searchSupplierProductsLive` already returns AO results.
- LM FTP credential present but **`last_test_status: null`** — never tested. Not blocking auto-draft (we read from `supplier_products` cache), but health UI should be ran to confirm FTP reachability before relying on nightly LM sync.
- If credentials disappear: `searchSupplierProductsLive()` already falls back to local; `getBestSupplierPrice()` is local-only and unaffected.

## How starter line items work

1. AI summary returns `jobType ∈ {solar | service | installation | project | general}`.
2. `suggestStarterLineItems(jobType)` returns 0–5 canonical search terms (Danish).
3. For each term, `getBestSupplierPrice(term)` returns the cheapest available supplier product.
4. Auto-draft inserts `offer_line_items` rows with `line_type='product'`, `supplier_product_id`, `supplier_cost_price_at_creation`, `quantity=1`, `unit_price=cost_price`. Sales rep edits and sets margins.
5. If no supplier match → no line. Logs: `STARTER LINE ADDED` / `STARTER LINE NO MATCH`.

## Next phase candidates (not done)

- Calibrated quantity heuristics (e.g. solar kWp → panel count) using kalkia building profiles.
- Auto-margin from `supplier_margin_rules` so `unit_price` reflects sale price not cost.
- Push starter items into a configurable table (`offer_starter_packs`) so non-engineers can edit.
- LM FTP "test connection" UI button.
