# 00246 — `incoming_emails` SELECT efter effektive rettigheder (fund P-1)

**Status:** anvendt på STAGING 2026-11-03. **Ikke i prod** — kræver Henriks godkendelse. Prod kører i dag 00180
(bogholderi ser hele postkassen; 0 bogholderi-profiler i prod). 00186 må ikke køres i prod (rå rolle).

Fil: `supabase/migrations/00246_incoming_emails_effective_permissions.sql`. Kun SELECT-politikken ændres; skrive-
politikker, grants, data og katalog røres ikke. Ingen ny rettighedsnøgle. Kode: ingen ændring nødvendig (appens gates
er uændrede; kode-kortlægning nedenfor).

## Politik før / efter

**Prod før (00180):**
```sql
user_role() IN ('admin','serviceleder','salg','bogholderi')
OR (user_role() = 'montør' AND service_case_id IS NOT NULL AND user_can_see_case(service_case_id))
```
**Staging før (00186):** som 00180, men bogholderi kun `customer_id IS NOT NULL OR <kilde til incoming_invoice>`.

**Efter (00246, begge miljøer):**
```sql
(SELECT user_has_permission('inbox.view'))                                                  -- 1 hele postkassen
OR (customer_id IS NOT NULL AND (SELECT user_has_permission('customers.emails.view'))       -- 2 kunde-mails i scope
    AND ((SELECT user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT my_customer_scope_ids())::uuid[])))
OR (customer_id IS NULL AND (SELECT user_has_permission('customers.emails.view'))           -- 3 ukoblede mails
    AND (SELECT user_has_permission('customers.edit')) AND (SELECT user_has_permission('customers.view.all')))
OR (service_case_id IS NOT NULL AND ((SELECT user_has_permission('cases.view.all'))         -- 4 sags-mails i scope
    OR service_case_id = ANY ((SELECT my_case_scope_ids())::uuid[])))
OR ((SELECT user_has_permission('incoming_invoices.view'))                                  -- 5 faktura-kilder
    AND EXISTS (SELECT 1 FROM incoming_invoices ii WHERE ii.source_email_id = incoming_emails.id))
```

## Nøgler (alle eksisterende)

| Gren | Nøgle(r) | Appens brug (kortlagt i `src`) |
|---|---|---|
| 1 | `inbox.view` | Indbakke, statistik, dashboard-mails/webhenvendelser, lead/kunde/sag fra mail, AI-svar, kobling |
| 2 | `customers.emails.view` + kundescope | Kundekortets mails/tidslinje (`getCustomerMailbox`, `getCustomerCommunicationTimeline`) |
| 3 | `customers.emails.view` + `customers.edit` + `customers.view.all` | Adresse-match/efterkobling på kundekortet (`retro-link`), svar, sag/tilbud fra mail — kræver adgang til ukoblede mails. Kræver `view.all`, så scope-brugere aldrig får den ukoblede postkasse |
| 4 | `cases.view.all` / `cases.view.assigned` (via `my_case_scope_ids`) | Ordrens/sagens Mails-fane (`getEmailsForCase`/`getCaseEmailDetail` — samme gate i appen) |
| 5 | `incoming_invoices.view` + synlig faktura | Fakturakøen (afsender/domæne). Følger `incoming_invoices`' egen RLS (i dag rå rolle admin/serviceleder/bogholderi) — en grant til andre roller virker først, når den tabel migreres |

Bevidst ingen ny nøgle: de eksisterende nøgler udtrykker præcis appens adfærd. "Hele postkassen" = `inbox.view`.

## Adfærd for standardroller

| Rolle | Prod før (00180) | Efter 00246 |
|---|---|---|
| admin, serviceleder | alt | alt (gren 1) — uændret |
| salg | alt | alt (2 + 3 + 4) — uændret |
| bogholderi | **alt** | kunde-mails, sags-mails, faktura-kilder — **ikke** ukoblede mails (nye henvendelser, nyhedsbreve, leverandør-/intern post, private) |
| montør | mails på egne sager (`user_can_see_case`) | mails på sager i OWN/RELATED-scope (`my_case_scope_ids`, samme motor som 00240) |
| inaktiv / uden profil / anon | intet | intet |

Forskel til 00186 (bevidst): bogholderi ser også mails koblet til en sag uden kunde (gren 4, `cases.view.all`) — appens
sags-Mails-fane viser dem allerede for bogholderi; 00186 ville skjule dem dér. Prod har 0 sådanne mails i dag (alle 918
er enten kundekoblede, fakturakilder eller ukoblede uden sag).

Montør: `my_case_scope_ids` vs. `user_can_see_case` — tilføjer sager konverteret fra montørens egne tilbud (D4), fjerner
sager hvor montørens eneste arbejdsordre er annulleret. Samme scope som resten af 00240-politikkerne og appens
`userCanViewCase`.

## Staging-bevis (2026-11-03)

- **Dry-run** (`cli.ts mail-00246-probe` før apply, rollback-only): 57/57.
- **Fingeraftryk før = efter apply** (`cli.ts mail-00246-state`): incoming_emails 5555 `7b066097…`, customers 1912
  `9a1e82a4…`, service_cases 1361 `5123b071…`, incoming_invoices 14 `b242fb6e…`, email_messages/emails/email_events/
  sent_quotes 0 — alle uændrede; grants uændrede; katalog 114/273 uændret; eneste politik-diff = `incoming_emails_select`.
- **Efter apply** (`cli.ts mail-00246-probe`, rollback-only): 71/71. A = staging som anvendt, B = prod-stien (00180 sat i
  transaktionen → før-matrix → 00246-kroppen → efter-matrix), C = idempotens; A = B = C. Data-md5 uændret af kroppen;
  udgående tabeller uændrede; staging-tilstand identisk før/efter prøven inkl. oprydning (0 testkunder tilbage).

Persona-matrix (7 fixture-mails; "opdaterer" = en tilbagerullet UPDATE rammer præcis de synlige rækker):

| Persona | own | hidden | unlinked | invoice | case_own | case_hidden | case_salg |
|---|---|---|---|---|---|---|---|
| admin, serviceleder, salg | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| bogholderi | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| montør | — | — | — | — | ✓ | — | — |
| montør + customers.emails.view | ✓ | — | — | — | ✓ | — | — |
| montør + customers.view.all | — | — | — | — | ✓ | — | — |
| montør + emails.view + view.all + edit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| montør + inbox.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| salg − customers.edit | ✓ | ✓ | — | — | — | — | ✓ |
| salg − customers.emails.view | — | — | — | — | — | — | ✓ |
| bogholderi + inbox.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| bogholderi − customers.emails.view | — | — | — | ✓ | ✓ | ✓ | ✓ |
| bogholderi − incoming_invoices.view | ✓ | ✓ | — | — | ✓ | ✓ | ✓ |
| serviceleder − inbox.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| serviceleder − inbox.view − customers.emails.view | — | — | — | ✓ | ✓ | ✓ | ✓ |
| inaktiv (med inbox.view-grant), uden profil, anon | — | — | — | — | — | — | — |

own = kunde i montørens scope · hidden = fremmed kunde · unlinked = ukoblet · invoice = ukoblet kilde til leverandørfaktura
· case_* = ukoblet mail på montørens sag / fremmed sag / salgs D4-sag.
Før-matrix (staging 00186): bogholderi = own, hidden, invoice; montør = case_own. Prod-sti (00180): bogholderi = alt.

Bemærk: `serviceleder − inbox.view` ser stadig alt via gren 2–5 (har kunde-mail-, rette- og sagsnøglerne). For at fjerne
postkassen helt fra en medarbejder skal `customers.emails.view` også fratages (og ukoblede kræver desuden `customers.edit`).

## UI-regression (staging, kode uændret + 00246)

`npx tsx scripts/test-harness/ui-batches.ts …` (8 batches, 1543 s): **36/36 PASS**, 0 FAIL/timeout — alle UI-tests der
rører indbakke, kundekortets mails, ordre-Mails-fane, lead/kunde/sag fra mail, fakturakø og dashboards: U7, U8, U9, U11,
U12, U21, U27, U38, U53, U64, U68, U78, U92, U93, U98, U120–U123, U127, U129–U131, U133, U145, U148, U149, U158, U169,
U171, U172, U193, U198, U215, U223, U229. Gates: tsc 0, check:rls-matrix 0, check:rbac 0.

## Prod-plan (efter Henriks godkendelse — ingen kodeændring, så rækkefølge: MIGRATION → POST-CHECK)

1. `npx tsx scripts/prod-verify-00246.ts pre` (read-only) — 2026-11-03: 6/6, prod = 00180, fingeraftryk:
   incoming_emails 918 `08841c30…`, customers 120 `a43821d7…`, service_cases 8 `88067dd2…`, incoming_invoices 61
   `facf4eeb…`, email_messages 15 `7ebd1864…`, email_events 8 `33b2143c…`, sent_quotes 7 `5cdbbc89…`; katalog 114/273.
2. `00246` i APPROVED-listen (`scripts/prod-apply-migration.ts`) med Henriks citat → `--dry-run` → pre igen uændret.
3. Apply → `prod-verify-00246.ts post` (INFO-linjer = pre).
4. Rollback-only persona-bevis i prod (prod har kun aktive admin/montør → rolle-skift i transaktionen som for 00245).
5. Smoke: indbakke (admin), kundekort-mails, ordre-Mails-fane (montør), fakturakø.

Rollback: genskab 00180-politikken (tekst i migrationens hoved). Ingen data at gendanne.
