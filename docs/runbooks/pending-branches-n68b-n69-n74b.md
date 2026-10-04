# Klar til godkendelse: N68b, N69, N74b (2026-10-04)

Fire ændringer er færdige på hver sin branch, men **ikke merget** — de ændrer forretningsadfærd eller kræver en
migration. Alle er bygget oven på `main`; tsc/check:rbac/check:rls-matrix er grønne på hver branch.

| Branch | Hvad | Prod-fund | Kræver |
|---|---|---|---|
| `n68b-skip-private-mail-ingest` (3d39496) | Mail → leverandørfaktura: privat-/gratis-mail **uden** faktura-bilag og **uden** "faktura/invoice/regning/kreditnota" i emnet bliver ikke til en leverandørfaktura (`skipped: private_mail_no_invoice`) | 13 af 36 åbne "fakturaer" er kundemails/ansøgninger; 11 af 19 afviste ligeså | Henriks OK (ændrer indtaget) |
| `n74b-no-auto-customer-from-suppliers` (7e74a08) | Mail-automatikken opretter/matcher **ingen** kunde, når afsenderdomænet tilhører en kendt leverandør (website/kontakt-mail) eller er eltasolar.dk — mailen står som uidentificeret | 92 af 107 kunder er auto-oprettet; flere fra leverandørsignaturer (dccenergi ×4 …) | Henriks OK (ændrer automatik) |
| `admin-alert-recipients-auth-email` (ca6a8a7) | Admin-alarmer (e-conomic ikke sat op, bankimport forældet m.fl.) sendes til aktive admins' login-e-mail, når `profiles.email` er tom | `no_recipients` hver dag — alarmerne når ingen (profiles.email tom for alle 3 admins; ADMIN_ALERT_EMAIL ikke sat) | Henriks OK (aktiverer daglige interne alarmmails) — alternativt sæt ADMIN_ALERT_EMAIL i Vercel |
| `n69-mark-thread-answered` (cb1ab0c) | Knap "Besvaret uden for CRM" på mails; tråden ud af "Kræver svar", indtil kunden skriver igen. Migration **00187**: `incoming_emails.responded_at` + `responded_by` | 117 tråde "kræver svar", 95 ældre end 30 dage — svar sendes fra personlige postkasser, som ikke synkes | Henriks OK + migration (staging → prod) |

## Anbefalet rækkefølge
1. **N74b** og **N68b** (ingen migration): merge til main → Vercel deployer. Ingen data ændres; kun fremtidige mails.
2. **N69**: kør 00187 på staging, e2e, derefter prod med pre/post (samme mønster som 00185).

## N69 — migration 00187
SQL og rollback står i `supabase/migrations/00187_incoming_emails_responded.sql` på branchen:
```sql
ALTER TABLE public.incoming_emails
  ADD COLUMN IF NOT EXISTS responded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS responded_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;
```
Rollback: `ALTER TABLE public.incoming_emails DROP COLUMN IF EXISTS responded_by, DROP COLUMN IF EXISTS responded_at;`

Ingen nye RLS-politikker: skrives af server-action (inbox.view) via brugerens klient under de eksisterende
incoming_emails-politikker (samme vej som `is_read`/`is_archived`); `GRANT ALL … TO authenticated` findes (00049).

Prod-kørsel (efter godkendelse og grøn staging):
```
npm run prod:apply-migration -- 00187 --approved-by-henrik
```
(kræver allowlist-linje i `scripts/prod-apply-migration.ts` — tilføjes først ved godkendelsen).

## Verifikation efter merge
- N68b: næste mail fra gmail uden bilag/faktura-emne → intet i Leverandørfakturaer; `incoming_invoice`-ingest-log
  viser `skipped=private_mail_no_invoice`. Rigtige fakturaer (PDF eller "faktura" i emnet) indtages som før.
- N74b: intelligence-loggen viser `Afsender er leverandør (<domæne>) — ingen automatisk kunde (N74b)`; nye kunder
  fra leverandørdomæner ophører (kundelistens filter "Oprettet fra mail").
- N69: "Besvaret uden for CRM" på en koblet mail → cockpittets "Mails kræver svar" falder; ny kundemail i tråden →
  tråden tilbage.

## Oprydning af eksisterende data (separat beslutning)
Ingen af branchene ændrer eksisterende kunder/fakturaer. Oprydning sker manuelt med de nye værktøjer:
kundelistens "Oprettet fra mail" (+ masse-deaktivering), leverandørfakturaernes "Ikke en faktura?" + "Ikke en faktura".

## Lokale worktrees (udvikler-maskinen)
Branchene er bygget i worktrees `C:\Dev\elta-n68b`, `C:\Dev\elta-n69`, `C:\Dev\elta-n74b`, `C:\Dev\elta-alerts`, hver med en
**junction** `node_modules` → `C:\Dev\elta-crm
ode_modules`. Fjern junctionen FØR worktreen slettes — ellers kan
oprydningen følge junctionen og slette hovedrepoets node_modules:
```
cmd /c rmdir C:\Dev\elta-n69\node_modules
git worktree remove C:/Dev/elta-n69
```
