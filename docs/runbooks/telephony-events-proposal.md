# UDKAST — `telephony_events` (ikke nummereret, ikke kørt)

**Status:** forslag til Claude. Må ikke lægges i `supabase/migrations`, og må ikke køres på staging eller prod fra `grok-features`.

Claude tildeler migrationsnummeret (00244–00246 er allerede brugt som andre udkast). Denne fil anvender ingenting.

## Hvorfor

Webhook-ruten `POST /api/integrations/relatel/webhook` forstår en hændelse og svarer `202` med `persisted: false`. Den skriver ikke, fordi tabellen ikke findes. Idempotens er kun bevist mod `MemoryTelephonyStore`.

Når tabellen er godkendt og anvendt, kan en senere ændring lade ingest skrive. Indtil da skal routen blive ved med at svare `persisted: false`.

Webhooken må ikke sætte `customer_id`. Match bekræftes af et menneske. Et ubekræftet nummer forbliver `NULL`.

## Effekt

- Læs for `authenticated` efter kundescope.
- Ingen `anon`.
- Ingen `INSERT`/`UPDATE`/`DELETE` for `authenticated`. Kun `service_role`, og først når Claude har koblet ingest til.
- Ingen hemmeligheder i tabellen.
- Ingen åben `USING (true)`-læsning.

## SELECT_REPLACED

Tabellen er ny og indgår ikke i en RLS-wave. Den skal **ikke** føres ind i `scripts/rls/write-matrix.ts` `SELECT_REPLACED`, medmindre den samtidig lægges i en wave med `recreateOpenSelect`. En post uden wave gør matrix-tjekket skævt, og en åben SELECT ved siden af scope-politikken ville OR'e sig til fuld læsning.

## SQL (uført)

```sql
-- FORSLAG. Ikke kørt. Claude vælger nummer og gennemgår RLS før noget miljø.
BEGIN;

CREATE TABLE public.telephony_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  provider text NOT NULL CHECK (provider = 'relatel'),
  event_type text NOT NULL CHECK (event_type IN (
    'call.started', 'call.answered', 'call.missed', 'call.ended',
    'voicemail.created', 'sms.received', 'sms.sent'
  )),
  occurred_at timestamptz NOT NULL,
  direction text CHECK (direction IS NULL OR direction IN ('inbound', 'outbound')),
  from_number text,
  to_number text,
  external_id text NOT NULL,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  answered boolean,
  has_voicemail boolean NOT NULL DEFAULT false,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  service_case_id uuid REFERENCES public.service_cases(id) ON DELETE SET NULL,
  match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'unique', 'ambiguous', 'lead')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telephony_events_has_a_number CHECK (from_number IS NOT NULL OR to_number IS NOT NULL)
);

COMMENT ON COLUMN public.telephony_events.customer_id IS
  'Sættes ikke af webhooken. NULL indtil et menneske har bekræftet matchet.';

CREATE INDEX telephony_events_customer_occurred
  ON public.telephony_events (customer_id, occurred_at DESC);
CREATE INDEX telephony_events_unmatched
  ON public.telephony_events (occurred_at DESC)
  WHERE customer_id IS NULL;

ALTER TABLE public.telephony_events ENABLE ROW LEVEL SECURITY;

-- Alle ubekræftede numre (customer_id IS NULL) ses kun med customers.view.all.
-- En kendt kunde ses også, når kunden er i kalderens kundescope.
CREATE POLICY telephony_events_select_scope
  ON public.telephony_events
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('customers.view.all'))
    OR (
      customer_id IS NOT NULL
      AND customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
    )
  );

REVOKE ALL ON public.telephony_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.telephony_events TO authenticated;
GRANT ALL ON public.telephony_events TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
```

## Rollback (uført)

```sql
BEGIN;
DROP TABLE IF EXISTS public.telephony_events;
NOTIFY pgrst, 'reload schema';
COMMIT;
```

## Efter anvendelse

1. Behold `RELATEL_ENABLED` slået fra, indtil Henrik vil modtage hændelser.
2. Først derefter må webhook-routen kalde ingest med en Supabase-butik. Den må stadig ikke registrere en webhook hos Relatel, og den må stadig ikke ringe eller sende SMS.
3. `customer_id` udfyldes af en bekræftet CRM-handling, ikke af ingest.
