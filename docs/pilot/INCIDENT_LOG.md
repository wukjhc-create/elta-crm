# ELTA CRM — Pilot incident-log

Én række pr. hændelse. Nyeste øverst. Udfyldes af den der opdager hændelsen; lukkes af Henrik.
Proces og alvorlighedsgrader: [PILOT_OPERATIONS.md §6](PILOT_OPERATIONS.md#6-incidents).

| # | Opdaget (dato/tid) | Rapporteret af | Sev | Område | Hvad skete (fakta, ingen persondata) | Påvirkede brugere/data | Midlertidig handling | Rodårsag | Permanent rettelse (commit/PR) | Lukket |
|---|---|---|---|---|---|---|---|---|---|---|
| P-000 | 2026-09-27 | Claude (pilot-forberedelse) | S2 | RLS/rolleadgang | 8 følsomme tabeller har `USING (true)` for alle indloggede (læs + for 6 af dem også skriv): invoices, invoice_payments, bank_transactions, incoming_invoices, supplier_credentials, accounting_integration_settings, integration_settings, time_logs. App-laget skjuler dem, men direkte REST-adgang er åben. Fundet read-only i prod (`npm run prod:role-policies`). | 2 eksisterende montør-konti (inaktive 7d); ingen tegn på misbrug undersøgt endnu | Onboard ikke ikke-admin pilotbrugere før rettet | RLS-politikker fra før RBAC-arbejdet (Sprint 7B-2 ikke gennemført). Staging-måling: 14 uautoriserede læsninger + 8/8 indsættelser | Migration 00160 kørt i prod 2026-09-27 (godkendt): 0 uventede huller, præcis forventet policy-sæt. Rest-risici R1–R3 åbne → egen milestone | ☑ afhjulpet (R1–R3 åbne) |

## Skabelon
```
| P-NNN | ÅÅÅÅ-MM-DD tt:mm | navn | S1–S4 | område | fakta | hvem/hvad | handling | årsag | commit | ☐ |
```
