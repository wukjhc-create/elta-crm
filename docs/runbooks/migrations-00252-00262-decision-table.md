# Migrationer 00252–00262: beslutningstabel (2026-10-19)

**Status for alle numre:** BLOCKED_APPROVAL. Hver migration kræver sin egen godkendelse, og ingen er kørt på staging eller prod.

**Kilder:** SQL'en findes kun i to runbooks:
- `next44-migrations-proposal.md` (00252–00256)
- `next45-46-migrations-proposal.md` (00257–00262)

`supabase/migrations/` slutter ved 00233. Filerne oprettes først efter godkendelse.

**Forløb pr. migration:** CODE → TEST → PUSH → MIGRATION (staging, derefter prod) → POST-CHECK.

**Kodeforudsætninger der IKKE er på plads endnu:**
- 23P01-mapping (kræves før 00253)
- kald af `revoke_user_sessions` (kommer efter 00258)
- P0001-mapping til "Sagen er lukket" (00261)
- flytning af `time_logs.sale_*` til admin-klienten (00255)

## Gruppe A: RLS-/auth-sikkerhedsbølge

| migration | formål | skema | ændring af eksisterende data | roller/sikkerhed | forretningsadfærd | risiko | staging | rollback | afhængigheder/rækkefølge |
|---|---|---|---|---|---|---|---|---|---|
| 00252 | RX-1: deaktiveret bruger får ingen DB-rolle. Manglende profil giver ingen rolle (i dag 'montør'). | `user_role()` får `AND is_active = true` | ingen | Alle politikker der bruger `user_role()`. Politikker der læser `profiles.role` direkte (audit_logs) dækkes ikke. | Deaktiverede brugere mister DB-adgang med det samme i stedet for efter ca. 1 t (tokenudløb) | Med: alt afhænger af funktionen | ikke kørt | 00108-kroppen genskabes | Først i bølgen. Pre-check: 0 inaktive profiler med aktive sessioner og 0 auth.users uden profil. |
| 00254 (udvidet) | LD-2 + PM2-2: leadrettigheder som i appen | USING(true)-SELECT fjernes. Nye politikker: `leads_select_role` (admin/serviceleder/salg), `leads_insert_role` (`created_by = auth.uid()`), `leads_update_role`, `lead_activities_insert_role` (`performed_by = auth.uid()`). | ingen | Montør og bogholderi mister lead-SELECT, -INSERT og -UPDATE. Salg beholder alle leads. | Montør kan ikke længere læse leads via REST (appen gater allerede, PM2-2). Aktiviteter kan ikke logges i en andens navn. | Lav-med: serverindsættelser med en anden `performed_by` fejler | ikke kørt | 00173-politikkerne og USING(true) genskabes | Efter 00252. Grep `lead_activities`-inserts først. |
| 00257 | AI-2: kun admin/serviceleder skriver `calculation_feedback` | Politikken `calculation_feedback_insert_role` uden montør | ingen | Montør mister INSERT | Ingen synlig ændring (ingen montørsti). Lukker for forgiftning af kalibreringen. | Lav | ikke kørt | 00178-politikken genskabes | Uafhængig |
| 00258 | AS-3: sessioner tilbagekaldes ved deaktivering | `revoke_user_sessions(uuid)` (SECURITY DEFINER, kun service_role). Sletter `auth.sessions` og `auth.refresh_tokens`. | Kun når funktionen kaldes | auth-skemaet | Deaktiveret bruger logges ud med det samme | Med: kolonnetyper i auth-skemaet skal tjekkes (`refresh_tokens.user_id` er varchar i nogle versioner) | ikke kørt | `DROP FUNCTION` | Efter 00252. Koden der kalder funktionen deployes efter migrationen. |
| 00255 | TT-6: montør kan ikke læse `sale_amount`/`sale_rate_snapshot` via REST | `REVOKE SELECT (sale_amount, sale_rate_snapshot) ON time_logs FROM authenticated` | ingen | Kolonneadgang for authenticated | Montør ser ikke kollegers salgssatser | Med: bred kodeflade | ikke kørt. **Ikke klar** | `GRANT SELECT (kolonner)` | Kræver først kode (TIME_LOG_PUBLIC_COLUMNS, cockpit, sagsøkonomi via admin-klient). **HOLD.** |

## Gruppe B: integritet og samtidighed

| migration | formål | skema | ændring af eksisterende data | roller/sikkerhed | forretningsadfærd | risiko | staging | rollback | afhængigheder/rækkefølge |
|---|---|---|---|---|---|---|---|---|---|
| 00253 | TT-1: genberegning når start_time ændres. TT-5: ingen overlappende timer. | Triggeren `trg_time_logs_cost_amount` får start_time med. `btree_gist`-extension. `EXCLUDE time_logs_no_overlap` (afviste rækker undtaget). | Ingen, men migrationen fejler hvis der findes overlap | ingen | Samtidige overlappende registreringer afvises (23P01). Ændret starttid giver ny pris. | Med | ikke kørt | Triggeren uden start_time genskabes, og constrainten droppes | Kør alene, efter 23P01-mapping i koden og overlap-pre-check = 0 |
| 00261 | RC-3: intet nyt job og ingen ny tid på en lukket sag | `reject_work_on_closed_case()` med triggere på `work_orders` (INSERT/UPDATE status) og `time_logs` (INSERT) | ingen | ingen | Fejlen "Sagen er lukket" ved oprettelse. Færdigmelding og annullering virker stadig. | Med: harness- og backfill-scripts kan fejle | ikke kørt | Triggere og funktion droppes | Pre-check: job og tid på lukkede sager de sidste 90 dage. Tjek scripts først. |
| 00262 | RC-4 (valgfri): én mailtråd pr. tilbud | Delvist unikt indeks `uq_email_threads_offer_id` | Dubletter skal ryddes først (antal ukendt) | ingen | Forhindrer dobbelt førsteafsendelse | Lav-med: fejler hvis der er dubletter | ikke kørt | `DROP INDEX` | Dublet-pre-check, oprydning, derefter indekset |

## Gruppe C: sletningssikkerhed (FK RESTRICT)

| migration | formål | skema | ændring af eksisterende data | roller/sikkerhed | forretningsadfærd | risiko | staging | rollback | afhængigheder/rækkefølge |
|---|---|---|---|---|---|---|---|---|---|
| 00259 | DL-1: bekræftelser overlever sletning af dokument | `document_confirmations.customer_document_id` CASCADE → RESTRICT | ingen | ingen | Sletning af et dokument med bekræftelser giver 23503 (koden blokerer allerede) | Lav. Constraint-navnet skal bekræftes i prod. | ikke kørt | FK genskabes med CASCADE | Uafhængig |
| 00260 | DL-3: sletning af leverandør bevarer bogførte fakturaer | `incoming_invoices.supplier_id` SET NULL → RESTRICT | ingen | ingen | En leverandør med fakturaer kan ikke slettes (koden blokerer allerede) | Lav. Constraint-navnet skal bekræftes. | ikke kørt | FK genskabes med SET NULL | Uafhængig. `supplier_products` CASCADE er en separat BESLUTNING. |

## Gruppe D: rapportering

| migration | formål | skema | ændring af eksisterende data | roller/sikkerhed | forretningsadfærd | risiko | staging | rollback | afhængigheder/rækkefølge |
|---|---|---|---|---|---|---|---|---|---|
| 00256 | RX-5: betalingsoversigten blander ikke valutaer | `v_customer_payment_summary`: DKK-filter eller valutadimension | ingen | ingen | Uændret hvis alt er DKK | Lav | ikke kørt. SQL ikke endelig. | 00214-viewet genskabes | BESLUTNING først: fakturerer Elta kun i DKK? |

## Anbefalet rækkefølge

1. **Bølge 1:** 00252, derefter 00254, 00257, 00259 og 00260 samlet.
2. **Bølge 2:** 00258 (efter 00252; auth-kolonnetyperne verificeres på staging) og 00261 (efter scripttjek).
3. **00253 alene,** når 23P01-mappingen er på plads og overlap-pre-check = 0.
4. **00262,** når dubletterne er ryddet.
5. **Hold:** 00255 (kode først) og 00256 (DKK-beslutning).

Alle numre køres først på staging med `harness:migrate-staging`, `check:rls-matrix` og persona-probes.

## Ikke i tabellen

API-2 (salg kun egne tilbud) håndhæves nu i koden. En RLS-politik på `offers` (i dag USING(true)) vil være et nyt, separat forslag.
