# T-5: dublet-mail ved oprettelse af kunder — design + migrationsforslag

**Status:** 2026-10-16. Koddelen (uden migration) er SAFE og bygges i en separat wave (Henrik: "GØR DEN I SEPARAT WAVE").
DB-constraint (00237-forslag nedenfor) = **BLOCKED_APPROVAL**.

## Fund
- `customers.email TEXT NOT NULL` med kun et almindeligt btree-indeks (00004). Ingen unik regel på mail.
- "Ingen mail" gemmes som `''`; auto-oprettede kunder har pladsholderen `auto+<nr>@elta-crm.local` (email-intelligence).
- Dublet-tjekket for brugeroprettede kunder sker KUN i klienten (`checkDuplicateCustomer` fra customer-form og
  customer-create-dialog). Samtidige brugere eller direkte kald opretter dubletter.

## Kaldere af `insertCustomerWithRetry`
| Kalder | Opslag før insert | Ved dublet |
|---|---|---|
| `createCustomer` (customers.ts) | ingen på serveren | dansk fejl + "Opret alligevel" |
| `quickCreateCustomer` (customers.ts) | ingen på serveren | dansk fejl + "Opret alligevel" |
| webformular `api/public/contact` | ilike + escapeLike | kobl (findes) |
| `create-from-email.ts` | ilike + escapeLike | kobl (findes) |
| CSV-import `customer-import.ts` | sæt + ilike genkontrol | spring over (findes) |
| `createCustomerFromEmail` (incoming-emails.ts) | ilike (afsender ikke normaliseret) | kobl |
| lead → kunde (leads.ts) | ilike + lås på lead | kobl (findes) |
| tilbud (offers.ts ~402) | `.eq('email', …)` — store/små bogstaver, ingen trim; `maybeSingle` fejler ved >1 → NY dublet | kobl |
| email-intelligence | ilike; gemmer rå `fallbackEmail` | kobl |

Harness-fixtures: kun `email: ''`-kunder deler værdi (direkte admin-insert); U27 forventer allerede én kunde ved to
leads med samme mail.

## Design (uden migration)
1. `src/lib/customers/customer-email.ts`: `normalizeCustomerEmail` (trim + små bogstaver), `isPlaceholderEmail`
   (`''`, uden `@`, `@elta-crm.local`), `findCustomerByEmail(supabase, email, { excludeId? })`.
2. `insertCustomerWithRetry`: normalisér mailen; uden `allowDuplicateEmail` → find eksisterende → returnér fejlkode
   `DUPLICATE_EMAIL` (med den eksisterende kunde) uden insert. Pladsholdere tæller aldrig som dublet.
3. `createCustomer`/`quickCreateCustomer`: dansk fejl "Der findes allerede en kunde med e-mailen …"; UI'ets
   "Opret alligevel" sender `allow_duplicate_email` (eneste override). UI-tjekket forbliver kun bekvemmelighed.
4. Tilbud: `findCustomerByEmail` + kobl (i stedet for `.eq` + `maybeSingle`). Mail-afsender og email-intelligence
   normaliserer før insert.
5. Race (uden indeks): insert → genopslag; findes en ÆLDRE række med samme normaliserede mail (og intet override),
   slettes den netop indsatte og den ældre returneres/kobles. Fuld garanti kræver indekset nedenfor.

## [MIGRATION] 00237 — BLOCKED_APPROVAL
Pre-check i prod (kun SELECT):
```sql
select lower(trim(email)) e, count(*) from customers
where trim(email) <> '' and email !~* '@elta-crm\.local$'
group by 1 having count(*) > 1;
```
Dubletter skal ryddes/flettes først (fælles bogholder-mail kan være legitim → override). Derefter:
```sql
CREATE UNIQUE INDEX CONCURRENTLY uq_customers_email_norm
  ON customers (lower(btrim(email)))
  WHERE btrim(email) <> '' AND email !~* '@elta-crm\.local$'
    AND NOT coalesce((custom_fields->>'allow_duplicate_email')::boolean, false);
```
Override gemmes som `custom_fields.allow_duplicate_email = true`. 23505 fra dette indeks må ikke genforsøges af
`insertCustomerWithRetry` (prædikatet matcher kun `customer_number`) og mappes til `DUPLICATE_EMAIL`.
Rækkefølge (procesregel): kode der tåler begge tilstande → push → migration efter godkendelse → post-check → DB-audit.
