# Forslag 00257–00262: migrationer fra review-bølge NEXT-45/46 (AI, auth, samtidighed, sletning)

**Status:** BLOCKED_APPROVAL. Ingen af dem er kørt. Hver kræver sin egen godkendelse (nummer, formål, risiko,
pre-/post-tjek).

Den kompatible kode er allerede pushet. Den rækkefølge, vi bruger: kode → test → push → migration → post-tjek.

**Kilde:** `docs/AUTONOMOUS_BACKLOG.md` NEXT-45/46. Definitionerne er læst fra repoet.

**Før kørsel:** bekræft mod prod read-only med `prod-db-audit` / `prod-fn-def` / `pg_constraint`. Migration 00199
viser, at prod kan afvige fra filerne.

---

## 00257 — `calculation_feedback`: kun admin/serviceleder skriver (AI-2)

**Fund (00178):** INSERT er tilladt for `admin, serviceleder, montør`. Feedback styrer kalibreringen af basistider og
risikobuffer. Koden kræver nu `projects.edit` (admin/serviceleder), og migrationen er det andet værn.

```sql
BEGIN;
DROP POLICY IF EXISTS calculation_feedback_insert_role ON public.calculation_feedback;
CREATE POLICY calculation_feedback_insert_role ON public.calculation_feedback FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
COMMIT;
```

- **Risiko:** lav. Montører har ingen app-vej til feedback.
- **Pre-tjek:** antal rækker oprettet af montører (aggregat).
- **Post-tjek:** `check:rls-matrix`; persona-probe: montør INSERT → 42501.

## 00258 — Sessioner tilbagekaldes ved deaktivering (AS-3)

**Fund:** deaktivering banner brugeren, men eksisterende sessioner virker til token-refresh. Koden afviser nu
deaktiverede i `requireAuth` og rollegaterne. PostgREST/Realtime med gyldigt token er dækket af 00252
(`user_role()`) og denne migration.

```sql
BEGIN;
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = auth, public AS $$
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
$$;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;
COMMIT;
```

Koden kalder funktionen fra `setProfileLoginActive(…, false)` med admin-klienten. Den kodeændring laves først efter
migrationen.

- **Risiko:** middel. `auth`-skemaet er Supabase-internt, så kolonnetyperne skal bekræftes:
  `refresh_tokens.user_id` er varchar i nogle versioner.
- **Post-tjek:** deaktivér en testbruger, og bekræft at refresh mislykkes.

## 00259 — `document_confirmations`: bekræftelser overlever ikke dokumentsletning (DL-1)

**Fund:** `customer_document_id … ON DELETE CASCADE` (00120:49). Koden blokerer nu sletning af dokumenter med
bekræftelser. RESTRICT er værn nr. 2.

```sql
BEGIN;
ALTER TABLE public.document_confirmations DROP CONSTRAINT document_confirmations_customer_document_id_fkey;
ALTER TABLE public.document_confirmations ADD CONSTRAINT document_confirmations_customer_document_id_fkey
  FOREIGN KEY (customer_document_id) REFERENCES public.customer_documents(id) ON DELETE RESTRICT;
COMMIT;
```

- **Risiko:** lav. Constraint-navnet skal bekræftes i prod.
- **Post-tjek:** sletning af et dokument med en bekræftelse → 23503.

## 00260 — `incoming_invoices.supplier_id` RESTRICT (DL-3)

**Fund:** `ON DELETE SET NULL` (00094:30). En slettet leverandør tog bogførte fakturaer ud af dublet-indekset
`uq_incoming_invoices_supplier_number`. Koden blokerer nu sletningen.

```sql
BEGIN;
ALTER TABLE public.incoming_invoices DROP CONSTRAINT incoming_invoices_supplier_id_fkey;
ALTER TABLE public.incoming_invoices ADD CONSTRAINT incoming_invoices_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;
COMMIT;
```

- **Risiko:** lav. Bekræft constraint-navnet.
- Overvej det samme for `supplier_products.supplier_id`. CASCADE af prishistorik er en BESLUTNING.

## 00261 — Intet nyt arbejde på en lukket sag (RC-3)

**Fund:** koden har nu compare-and-set plus genlæsning ved lukning/jobstart. Oprettelse af job/timer under en lukning er
stadig læs-så-skriv. Triggeren er værn nr. 2.

```sql
BEGIN;
CREATE OR REPLACE FUNCTION public.reject_work_on_closed_case() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case uuid; v_status text;
BEGIN
  IF TG_TABLE_NAME = 'work_orders' THEN
    v_case := NEW.case_id;
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status IN ('cancelled', 'done') THEN RETURN NEW; END IF; -- afslutning/annullering er altid tilladt
  ELSE
    SELECT wo.case_id INTO v_case FROM work_orders wo WHERE wo.id = NEW.work_order_id;
    IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF; -- kun nye timer
  END IF;
  IF v_case IS NULL THEN RETURN NEW; END IF;
  SELECT status INTO v_status FROM service_cases WHERE id = v_case FOR SHARE;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'Sagen er lukket' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reject_work_on_closed_case() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_work_orders_closed_case BEFORE INSERT OR UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.reject_work_on_closed_case();
CREATE TRIGGER trg_time_logs_closed_case BEFORE INSERT ON public.time_logs
  FOR EACH ROW EXECUTE FUNCTION public.reject_work_on_closed_case();
COMMIT;
```

- **Risiko:** middel. Harness-/backfill-scripts, der skriver på lukkede sager, fejler.
- **Pre-tjek:** antal job/timer oprettet på lukkede sager de sidste 90 dage.

## 00262 — Unik tråd pr. tilbud (RC-4, valgfri)

Koden ser nu på alle tilbuddets tråde.

**Rækkefølge:** dubletter skal ryddes, før indekset kan oprettes. Pre-tjek:

```sql
SELECT offer_id, count(*) FROM email_threads WHERE offer_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
```

Oprettelse af indekset:

```sql
CREATE UNIQUE INDEX uq_email_threads_offer_id ON public.email_threads(offer_id) WHERE offer_id IS NOT NULL;
```

---

## Beslutninger fra samme bølger (ingen migration)

- **AI-1:** auto-kobling af mails via telefon/navn i brødteksten. Behold? Eller kun afsender-/kontaktmail?
- **AI-4:** databehandleraftale (DPA) / zero-retention hos OpenAI.
- **AS-2:** grænse pr. IP for kontaktformularen (kræver tabel eller KV) og/eller Turnstile. Skal en ubekræftet e-mail
  kunne koble et lead til en eksisterende kunde?
- **AS-4:** Supabase "Secure password change" (re-autentificering ved skift af adgangskode).
- **DL-5:** fakturanummer tildeles ved kladde (huller ved sletning). Skal det i stedet tildeles ved afsendelse?
- **DL-6:** GDPR-anonymisering af kunder med historik.
