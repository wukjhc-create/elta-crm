# Runbook — prod-migration 00162: luk anon-eksponering (incident P-004)

**Status:** forberedt · anvendt og verificeret på staging (2026-09-27) · **IKKE kørt i production** — kræver Henriks godkendelse.
**Prioritet:** HØJ — fortrolige indkøbspriser er offentligt læsbare i dag.

## Fund (prod, read-only `npm run prod:db-audit`, 2026-09-27)
`anon` = alle på internettet med den offentlige anon-nøgle (den ligger i sitets JS-bundle).

| Kode | Flade | Eksponering |
|---|---|---|
| V1 | `v_supplier_products_with_supplier` | **310.308 leverandørprodukter med indkøbspris, avance, salgspris** |
| V1 | `v_packages_summary`, `v_kalkia_nodes_summary` | kost-/salgspris og DB pr. pakke/komponent |
| V1 | `v_kalkia_calculations_summary` | kundenavn + marginer (0 rækker i dag) |
| V1 | `v_import_batches_summary`, `v_supplier_sync_jobs`, `v_calc_components_summary` | bruger-email, sync-konfiguration, komponenter |
| F1 | `log_audit_event` | anon kan **forfalske audit-hændelser** |
| F1 | `user_role`, `user_has_role`, `user_permissions`, `user_employee_id`, `user_has_permission` | rolle-opslag for vilkårlige bruger-id'er |
| T2 | `product_catalog`, `package_categories`, `product_categories`, `project_templates` | kataloger (product_catalog har cost_price; 0 rækker i dag) |
| T3 | `email_events`, `sms_events`, `integration_logs` | anon kan skrive (log-forurening) |
| F3 | `handle_new_user`, `log_audit_event` | SECURITY DEFINER uden låst search_path |

Kode-kontrol: appen bruger ingen af fladerne med anon-klienten (eneste anon-brug er login-verifikation).

## Målt på staging (`npm run harness:pilot-roles` — probe-rækker, dynamisk)
| | Før | Efter |
|---|---|---|
| Anon læser probe-række (prisview, pakkeview, 4 kataloger) | 6/6 | **0/6** |
| Anon skriver i integration_logs | ja | **afvist** |
| Anon kalder user_role / user_permissions / log_audit_event | 3/3 | **0/3** |
| Indloggede kan fortsat læse de samme rækker | ✓ | **✓** |
| `db-audit` HØJ / MIDDEL | 23 / 0 | **0 / 0** |
| Security 21/21 · flows 9/9 · invarianter 14/14 · R1–R4 35/35 | ✓ | ✓ |

## Udførelse (efter godkendelse)
1. Tilføj `'00162': '<dato>'` til allowlist i `scripts/prod-apply-migration.ts`.
2. Pre-check: `npm run prod:db-audit` → forventet HØJ=21.
3. `npm run prod:apply-migration -- 00162 --approved-by-henrik`
4. Post-check: `npm run prod:db-audit` → **HØJ=0, MIDDEL=0** · `npm run prod:role-policies` 0·0·0 · `npm run prod:pilot-health` 🟢.
5. Smoke som admin: leverandørprodukter/prissøgning, pakker, kalkia, audit-log-siden.

## Anbefalet menneskelig opfølgning
Supabase Dashboard → Logs → API: søg efter anon-kald til `/rest/v1/v_supplier_products_with_supplier` (og de øvrige views)
for at afgøre, om eksponeringen er blevet udnyttet. Det kan ikke ses fra databasen.

## Rollback
Rollback-SQL i migrationens header. Ingen data ændres.
