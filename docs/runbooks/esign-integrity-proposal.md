# Forslag: bevisintegritet for accept, fuldmagt og bekræftelser (ES-1 / ES-4 / ES-10)

**Status:** BLOCKED_APPROVAL. Hver migration skal godkendes særskilt (nummer, formål, risiko og pre/post-tjek).
Intet er kørt på staging eller prod.
**Kilde:** e-sign-review 2026-10-17 (NEXT-40 i `docs/AUTONOMOUS_BACKLOG.md`).
**Rækkefølge:** CODE → TEST → PUSH (kompatibel kode) → MIGRATION → POST-CHECK.

## 00248 — et accepteret tilbud er endeligt i databasen (ES-1, S2)

**Fund:** 00215 låser indhold og beløb på tilbud, der ikke er kladder. Status-kolonnen selv er derimod ikke låst, og RLS
(00170) lader admin, serviceleder og salg opdatere `offers`. Med egen JWT via REST kan man derfor:
1. sætte `accepted` → `draft`,
2. ændre linjer og priser,
3. sætte status tilbage til `accepted`.

Underskriften (`offer_signatures`) peger så på indhold, kunden aldrig har set.

**App-kompatibilitet:** appen har ingen overgang ud af `accepted` (`updateOfferStatus`). Portal-accept kører med
service-role og er derfor uberørt.

```sql
BEGIN;
-- 1) accepted er endeligt for direkte skrivninger med rollen 'authenticated' (som 00215: service_role og
--    trigger-opdateringer er uændrede)
CREATE OR REPLACE FUNCTION public.offers_accepted_final_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'accepted' AND NEW.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Et accepteret tilbud er endeligt — opret et nyt tilbud' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_offers_accepted_final_guard ON public.offers;
CREATE TRIGGER trg_offers_accepted_final_guard
  BEFORE UPDATE OF status ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.offers_accepted_final_guard();

-- 2) beviset bindes til det underskrevne: beløb + sha256 af kundevendt hoved og linjer (sættes af portal-accept)
ALTER TABLE public.offer_signatures
  ADD COLUMN IF NOT EXISTS signed_final_amount numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS content_sha256 text NULL,
  ADD COLUMN IF NOT EXISTS signer_user_agent text NULL;
REVOKE ALL ON FUNCTION public.offers_accepted_final_guard() FROM PUBLIC, anon, authenticated;
COMMIT;
```

- **Risiko:** lav. Ingen dataændring, og de nye kolonner er nullable.
  - Kan et accepteret tilbud ikke længere sættes til kladde via REST, er det tilsigtet.
- **Pre-tjek (prod read-only):**
  - antal accepterede tilbud;
  - antal `status_change`-aktiviteter fra `accepted` til en anden status (bør være 0).
- **Post-tjek:**
  - staging-persona salg: `PATCH offers SET status='draft'` på et accepteret tilbud giver 42501;
  - portal-accept virker (U10).
- **Opfølgende kode (efter migrationen):** `acceptOffer` gemmer `signed_final_amount`, `content_sha256` (samme hoved- og
  linjefelter som `SNAPSHOT_HEADER`/`SNAPSHOT_LINES`) og user agent.
- **Rollback:** `DROP TRIGGER trg_offers_accepted_final_guard ON public.offers;`. Kolonnerne kan blive stående.

## 00249 — underskrevet fuldmagt kan ikke ændres eller læses via REST (ES-4, S2)

**Fund:** SELECT på `customer_documents` er `USING (true)` for alle indloggede brugere. Den underskrevne fuldmagt ligger
i `description` (JSON) med `foedselsdato_cvr`, `signature_data`, `signer_name`, `signed_at`, `signer_ip` og
`signer_user_agent`. UPDATE er tilladt for montør, salg og serviceleder.

Appen saniterer alle læsninger (`safeDocumentDescription`, ST-1, SEC2-1), men REST gør ikke. En montør kan derfor læse
CPR-numre og ændre eller forfalske beviset.

**Anbefalet løsning (2 trin):**
- **(a)** Trigger: rækker med `type='fuldmagt'` og `status='signed'` kan ikke opdateres eller slettes af `authenticated`.
- **(b)** Følsomme felter flyttes til en separat tabel, som kun læses med admin-klienten bag `customers.emails.view`.
  - Det kræver kodeændringer i `fuldmagt.ts`, `customer-documents.ts` og portalen.
  - Det giver en datamigration (eksisterende rækker), så det bør være et eget forslag.

```sql
-- (a) — lille og sikker
BEGIN;
CREATE OR REPLACE FUNCTION public.customer_documents_signed_fuldmagt_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d jsonb;
BEGIN
  IF pg_trigger_depth() > 1 OR current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  BEGIN d := OLD.description::jsonb; EXCEPTION WHEN others THEN RETURN COALESCE(NEW, OLD); END;
  IF d->>'type' = 'fuldmagt' AND d->>'status' = 'signed' THEN
    RAISE EXCEPTION 'En underskrevet fuldmagt kan ikke ændres eller slettes' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_customer_documents_signed_fuldmagt_guard ON public.customer_documents;
CREATE TRIGGER trg_customer_documents_signed_fuldmagt_guard
  BEFORE UPDATE OR DELETE ON public.customer_documents
  FOR EACH ROW EXECUTE FUNCTION public.customer_documents_signed_fuldmagt_guard();
REVOKE ALL ON FUNCTION public.customer_documents_signed_fuldmagt_guard() FROM PUBLIC, anon, authenticated;
COMMIT;
```

- **Risiko:** lav. Al legitim fuldmagt-skrivning kører med service-role (portal-underskrift og claim).
  - Kontrollér før kørsel: `grep "customer_documents" src | update` med bruger-klient på fuldmagter.
  - 00242-forslaget (`customer_documents`-trigger på følsomme kolonner) bør samkøres eller sammenlægges med dette.
- **Pre-tjek:** antal underskrevne fuldmagter (aggregat).
- **Post-tjek:**
  - staging-persona montør: PATCH på en underskrevet fuldmagt giver 42501;
  - `fuldmagt-sign-race-check` og `partner-fuldmagt-leak-check` er grønne.
- **Rollback:** `DROP TRIGGER trg_customer_documents_signed_fuldmagt_guard ON public.customer_documents;`.

## 00250 — dokumentbekræftelser bindes til filens indhold (ES-10, S3)

**Fund:** en bekræftelse peger kun på `customer_document_id`. Filens `storage_path`/`file_url` kan ændres bagefter, og
så "bekræfter" kunden en anden fil.

```sql
BEGIN;
ALTER TABLE public.document_confirmations
  ADD COLUMN IF NOT EXISTS confirmed_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS confirmed_sha256 text NULL;
COMMIT;
```

- **Opfølgende kode:**
  - `submitConfirmation` gemmer stien og sha256 af filen ved bekræftelsen (læst med service-klienten).
  - 00249 (a) udvides, så rækker med en bekræftelse ikke kan få ny `storage_path`.
- **Risiko:** ingen (nullable kolonner).
- **Rollback:** drop kolonnerne.
