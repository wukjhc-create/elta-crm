# 00245 — customer_notes efter nutidens rettighedsmodel

**Status:** anvendt på STAGING 2026-11-02 (Henrik: "STAGING ONLY FIRST"). **PROD kræver Henriks særskilte godkendelse.**
Fil: `supabase/migrations/00245_customer_notes_effective_permissions.sql`

## Hvorfor ikke 00196

00196 (kun staging) oprettede `customer_notes` med `customer_notes_select USING (true)` og rå rolle-skrivning
(`user_role() IN (...)`). 00241 strammede læsningen på staging, men kørte i prod mens tabellen ikke fandtes — så 00196 i
prod nu ville genskabe den brede læsning, og intet ville rette den. 00245 opretter tabellen hvis den mangler og erstatter
ALLE politikker på den med de fire nedenfor — uanset udgangspunkt.

## Regler (præcise politikker)

| Handling | Politik | Betingelse |
|---|---|---|
| SELECT | `customer_notes_select_scope` | `user_has_permission('customers.view.all')` ELLER `customer_id = ANY(my_customer_scope_ids())` (= 00241) |
| INSERT | `customer_notes_insert_scope` | `customers.edit` OG `created_by = auth.uid()` OG `source = 'manual'` OG kunden i læse-scope (view.all ELLER `my_customer_scope_ids()`) |
| UPDATE | `customer_notes_update_scope` | USING og WITH CHECK: `customers.edit` OG (egen note ELLER `customers.notes.manage`) OG kunden i læse-scope. Kolonne-grant: kun `content` |
| DELETE | `customer_notes_delete_scope` | `customers.edit` OG (egen note ELLER `customers.notes.manage`) OG kunden i læse-scope |

- Ny rettighed **`customers.notes.manage`** (standard admin + serviceleder): ret/slet ANDRES noter. Erstatter 00196's rå
  "admin/serviceleder"-gren med en effektiv rettighed, der kan tildeles/fratages pr. medarbejder. Ingen rå rolle-bypass.
- Inaktiv profil / manglende profil: `user_has_permission` = false og `my_customer_scope_ids()` = `{}` → intet.
- Grants: `REVOKE ALL FROM PUBLIC, anon, authenticated` → authenticated `SELECT, INSERT, DELETE` + `UPDATE (content)`;
  service_role `ALL` (assistent/Telegram skriver med `source` assistant/telegram via service-role).
- `case_notes.source` tilføjes kun hvis den mangler (prod): `text NOT NULL DEFAULT 'manual'` + CHECK. Eksisterende
  case_notes-rækker læses som `manual`; intet andet i kunde-/sags-data ændres.
- Adfærdsændringer i forhold til 00196 (bevidste): en note kan ikke længere flyttes til en anden kunde eller få ny
  forfatter (kun `content`); `source` kan ikke sættes af brugersessioner; egen note kræver nu `customers.edit` og at
  kunden stadig er i scope for at rette/slette (før: altid egen note).

## Staging-bevis (2026-11-02)

- Fingeraftryk før/efter apply (`cli.ts notes-00245-state`): customer_notes 0 rækker (md5 `d41d8cd9…` før = efter);
  case_notes 16 rækker, md5 `ccc929afe9e7366ea8c3a365d99c332c` før = efter. Politikker: 00196-skrivning + 00241-SELECT →
  præcis de fire `_scope`. Tabel-grants authenticated: `DELETE, INSERT, SELECT`; kolonne-UPDATE: kun `content`.
- Persona-matrix (`cli.ts notes-00245-probe`, rollback-only, 45/45 — inkl. service_role og fingeraftryk): A = staging som anvendt, B = prod-stien (tabel,
  `case_notes.source` og nøglen fjernet i transaktionen → 00245-kroppen igen), C = idempotens. A og B identiske:

| Persona | ser (i scope / fremmed) | opret egen kunde / fremmed | slet egen / andens / fremmed | ret andens |
|---|---|---|---|---|
| admin, serviceleder | begge | ok / ok | 1 / 1 / 1 | 1 |
| salg | begge | ok / ok | 1 / 0 / 0 | 0 |
| bogholderi | begge | afvist / afvist | 0 / 0 / 0 | 0 |
| montør | kun i scope | afvist / afvist | 0 / 0 / 0 | 0 |
| montør + customers.edit | kun i scope | ok / afvist | 1 / 0 / 0 | 0 |
| montør + customers.view.all | begge | afvist / afvist | 0 / 0 / 0 | 0 |
| montør + edit + notes.manage | kun i scope | ok / afvist | 1 / 1 / 0 | 1 |
| salg − customers.edit | begge | afvist / afvist | 0 / 0 / 0 | 0 |
| salg + notes.manage | begge | ok / ok | 1 / 1 / 1 | 1 |
| serviceleder − notes.manage | begge | ok / ok | 1 / 0 / 0 | 0 |
| inaktiv (med edit-grant), uden profil, anon | intet | afvist | 0 (anon: 42501) | 0 |

  Plus for alle: ingen kan oprette i en andens navn; `source` ≠ manual afvises; en note kan ikke flyttes til en anden
  kunde (42501); B: præcis fire politikker uden `USING (true)`/`user_role()`, anon/PUBLIC 0 grants, case_notes 16/16 =
  manual; oprydning 0 testkunder; state identisk før/efter prøven. service_role: læser 2/2, opretter med
  source=assistant på fremmed kunde, flytter og sletter (1/1). customers/service_cases/case_notes (uden source)
  md5 identiske før/efter 00245-kroppen i B (prod-stien) og C (eksisterende tabel); staging i dag: customers
  `115f886576b04c92a03b8c91a098fd52`, service_cases `7fe5ddef7c2f91d574a71ebac06ac1bc`.
- Rettighedskatalog (`cli.ts mp-00238-check`, 16/16): 114 nøgler / 273 rolle-par = permissions.ts; 5 roller × 114
  nøgler 0 afvigelser (testens faste 267 rolle-par var forældet siden 00240 — beregnes nu fra permissions.ts).
- UI (staging, kode + 00245): U257, U142, U11, U188, U196, U25, U132, U133, U215, U200, U40, U229, U166, U61, U52 PASS.

## Kode (code-only, kan ligge i prod før migrationen)

`lib/notes/customer-notes-availability.ts`: manglende tabel (PGRST205/42P01) = `unavailable` (skjult, ingen advarsel);
anden fejl = `error`. Tidslinjen viser ikke "noter kunne ikke læses" når tabellen mangler; mailkort og opkaldskort viser
kun en aktiv note-knap når noter er `available` og brugeren har `customers.edit`; `createCustomerNote` returnerer en
eksplicit fejl i stedet for en falsk succes. Noteloggens `canDelete` bruger `customers.notes.manage` (ikke rå rolle).
Appens rettigheder kommer fra `permissions.ts` + overrides, så nøglen virker i appen før migrationen; prod-paritetstjek
af `permission_catalog` (mp-00238) viser én nøgle forskel indtil 00245 er anvendt.

## Prod (kræver godkendelse)

Rækkefølge: CODE → TEST → PUSH (allerede kompatibel) → `npx tsx scripts/prod-verify-00245.ts pre` →
`npx tsx scripts/prod-apply-migration.ts 00245 --approved-by-henrik` (efter tilføjelse til APPROVED) →
`npx tsx scripts/prod-verify-00245.ts post` → read-only smoke. Prod før (2026-11-02, read-only): customer_notes findes
ikke, `case_notes.source` mangler, 2 case_notes (md5 uden source `f312d79c1fd26494e2d4e420f19f5bda`), nøglen findes ikke;
customers 120 (`a43821d799b105daca8e4f93d81dc35e`), service_cases 8 (`88067dd2c28a5cb52d4b4e3e9a0b4633`).
Kompatibel kode i prod: `1b002ce4` (2026-11-02). Efter 00245 i prod skal `scripts/prod-apply-migration.ts` APPROVED have
`'00245'`, og prod-paritetstjek af kataloget (mp-00238) viser 114/273 som staging.
Risiko: lav — ny tom tabel, ny kolonne med konstant standard (metadata-ændring), ny nøgle; ingen eksisterende politik på
andre tabeller ændres. Rollback i bunden af migrationsfilen.
