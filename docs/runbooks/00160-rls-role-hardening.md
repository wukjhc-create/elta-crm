# Runbook — prod-migration 00160 RLS-stramning (pilot-gate, incident P-000)

**Status:** ✅ KØRT I PRODUCTION 2026-09-27 (godkendt af Henrik) · verificeret med `prod:role-policies` + `prod:verify-00160`.
**Prioritet:** skal køres før ikke-admin pilotbrugere onboardes (prod har i dag 2 montør-konti).

## Hvad og hvorfor
8 følsomme tabeller havde `USING (true)` for alle indloggede; 6 af dem også `WITH CHECK (true)`. Enhver rolle kunne
læse og **oprette/ændre/slette** fakturaer, betalinger, banktransaktioner, indgående fakturaer,
integrationsindstillinger og leverandør-credentials direkte via REST (anon-nøgle + egen login). App-laget skjulte det.

Migrationen afstemmer RLS med `permissions.ts` **uden at fjerne en kodesti for en tilladt rolle** (kortlagt: alle
app-skrivninger til 5 af tabellerne går via admin-klienten; læsninger via den autentificerede klient er gatet med de
samme roller som de nye policies).

Fil: [`supabase/migrations/00160_rls_role_hardening.sql`](../../supabase/migrations/00160_rls_role_hardening.sql)

## Målt effekt (staging, `npm run harness:pilot-roles`)
| | Før | Efter |
|---|---|---|
| Uautoriseret læsning (rolle × tabel) | 14 | 0 |
| Uautoriseret indsættelse (montør/salg × 4 tabeller) | 8/8 lykkedes | 0/8 |
| Tilladte roller der mistede læseadgang | — | 0 |
| Opdatering af indgående faktura | alle roller | kun admin + bogholderi (= `incoming_invoices.edit`) |
| Security 21/21 · pilot flows 9/9 · invarianter 13/13 | ✅ | ✅ |

## Forventede synlige ændringer i appen (i tråd med permissions.ts)
- Dashboard: faktura-/betalingstal viser 0 for **montør**.
- `/dashboard/go-live`: e-conomic-status "ikke konfigureret" for andre end admin/bogholderi.
- Bank-siden: kun admin/bogholderi.
- Leverandør-test fra ikke-admin opdaterer ikke `last_test_*` (kosmetisk).

## Kendte rest-risici (ikke lukket — kræver kodeændring, se Pilot Ops-rapport)
- **R1** salg kan læse alle fakturaer/betalinger via REST (appen viser kun egne sager).
- **R2** `time_logs` læsning åben for indloggede; montør-skrivning begrænset på rolle, ikke egen medarbejder.
- **R3** `supplier_credentials` læsning åben (AES-256-GCM-krypteret; skrivning nu kun admin).

## Udførelse (efter godkendelse)
1. **Pre-check:** `npm run prod:role-policies` → forventet 8 åbne tabeller (read-only).
2. **Anvend:** Supabase Dashboard → prod → SQL Editor → indsæt hele `00160_rls_role_hardening.sql` → Run (én transaktion).
3. **Post-check:** `npm run prod:role-policies` → forventet **0 uventede huller**, kun R2/R3 markeret som kendt rest-risiko.
4. **Smoke (admin):** faktura-liste, bank-side, indgående fakturaer, tidsregistrering og e-conomic-status virker.
   Hvis en bogholderi-/serviceleder-bruger findes: log ind og se fakturaer + indgående fakturaer.
5. `npm run prod:pilot-health` → 🟢. Opdatér [INCIDENT_LOG](../pilot/INCIDENT_LOG.md) P-000.

## Rollback
Rollback-SQL står i migrationens header (genskaber præcis de tidligere policies). Ingen data ændres af migrationen.
