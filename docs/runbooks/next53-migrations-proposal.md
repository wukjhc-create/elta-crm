# NEXT-53 migrationsforslag (finans-review 2026-10-20)

**Status:** BLOCKED_APPROVAL. Hvert nummer kræver sin egen godkendelse, og intet er kørt på staging eller prod.

Forløb pr. migration: CODE → TEST → PUSH → MIGRATION (staging, derefter prod) → POST-CHECK.

**Før hver migration:** verificér den aktuelle definition i prod read-only (`scripts/prod-fn-acl.ts` eller `pg_get_functiondef` / `pg_get_viewdef` via read-only-script). Funktionen kan være ændret siden 00080.

## 00263 — fakturanumre: dansk årsskifte og mere end 9.999 pr. år (FC-9 + FC-10 = TZ-5)

**Problem**

| Fund | Hvad sker der |
|---|---|
| FC-10 | `EXTRACT(YEAR FROM NOW())` regnes i databasens tidszone (UTC). En faktura oprettet 1/1 mellem kl. 00 og 01 dansk tid (02 om sommeren) får forrige års serie. |
| FC-9 | `LPAD(v_n::TEXT, 4, '0')` afkorter ved nummer 10.000: `LPAD('10000', 4)` giver `'1000'`, som er en dublet. Unikhedskravet får derefter alle nye fakturaer og kreditnotaer i året til at fejle. |

**SQL**

```sql
BEGIN;
CREATE OR REPLACE FUNCTION allocate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  -- FC-10: dansk kalenderår (ikke UTC)
  v_year INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Copenhagen'))::INTEGER;
  v_n    INTEGER;
BEGIN
  INSERT INTO invoice_number_counters(year, next_n) VALUES (v_year, 1) ON CONFLICT (year) DO NOTHING;
  SELECT next_n INTO v_n FROM invoice_number_counters WHERE year = v_year FOR UPDATE;
  UPDATE invoice_number_counters SET next_n = v_n + 1 WHERE year = v_year;
  -- FC-9: mindst 4 cifre, men aldrig afkortet
  RETURN 'F-' || v_year::TEXT || '-' || LPAD(v_n::TEXT, GREATEST(4, length(v_n::TEXT)), '0');
END;
$$;
-- ACL uændret: verificér at EXECUTE stadig er som før (se memory "supabase-function-acl")
COMMIT;
```

**Afhængighed:** bankmatchets regex `F-\d{4}-\d{4}` (`bank-payments.ts`) skal udvides til `F-\d{4}-\d{4,}` med ordgrænse. Det er en kodeændring, der laves sammen med migrationen.

| | |
|---|---|
| Ændring af eksisterende data | Ingen |
| Risiko | Lav. Eksisterende numre er uændrede. Funktionens signatur og ACL er uændrede. |
| Rollback | 00080-kroppen genskabes |
| Pre-check | Aktuel `pg_get_functiondef` = 00080-versionen |
| Post-check | `SELECT allocate_invoice_number()` i en transaktion med ROLLBACK på staging |

## 00264 — kundebetalingsoversigten (FC-7)

**Problem** i `v_customer_payment_summary` (bruges af den ugentlige betalingsrapport-mail og -CSV):
- Udestående og forfaldent lægger EUR og DKK sammen.
- `overdue_count` tæller `open_amount > 0`; rykkerne og overblikket bruger 0,50 kr som grænse.
- `paid_total` summerer `final_amount`, så en krediteret del tælles med som betalt.

**SQL (skitse — den fulde CREATE OR REPLACE VIEW skrives ud fra 00214)**
- Tilføj `AND COALESCE(i.currency, 'DKK') = 'DKK'` i FILTER på `outstanding_total`, `overdue_total`, `overdue_count` og `paid_total`.
- Ændr `o.open_amount > 0` til `o.open_amount >= 0.5` i `overdue_count` og `overdue_total`.
- Ændr `paid_total` til `SUM(COALESCE(NULLIF(i.amount_paid, 0), i.final_amount - <krediteret>))`. Det krediterede beløb fås fra samme LATERAL-join som `open_amount`.

| | |
|---|---|
| Ændring af eksisterende data | Ingen (view) |
| Risiko | Lav. Tallene i betalingsrapporten falder, hvor de før var for høje. |
| Rollback | 00214-viewet genskabes |
| Afhængighed | Ingen. CSV-kolonnerne er uændrede. |

## 00265: forfaldsdato på faktura fra tilbud i dansk dato (FIN2-10)

**Problem:**
- `create_invoice_from_offer` (00198) beregner forfaldet fra `CURRENT_DATE`, som er UTC.
- En faktura oprettet kl. 00–02 dansk tid får derfor forfald én dag for tidligt.
- `rebaseDueDateOnSend` regner betalingsbetingelserne ud fra den danske dato, så kunden får 13 dage i stedet for 14.
- Fejlen rammer først, når DF-1 (automatisk fakturering) er live.

**SQL (skitse):** i `create_invoice_from_offer` erstattes `CURRENT_DATE` med `(now() AT TIME ZONE 'Europe/Copenhagen')::date`. Resten af funktionen er uændret (CREATE OR REPLACE ud fra 00198).

| | |
|---|---|
| Ændring af eksisterende data | Ingen (funktion) |
| Risiko | Lav. Påvirker kun nye fakturaer oprettet mellem kl. 00 og 02. |
| Rollback | 00198-funktionen genskabes |
| Afhængighed | Ingen. Funktionens ACL bevares (REVOKE FROM PUBLIC, anon, authenticated som i 00198). |

## Bemærk

Begge er rene CREATE OR REPLACE. Ingen tabelændringer og ingen grants.
