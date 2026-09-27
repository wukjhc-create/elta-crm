-- =====================================================================
-- 00159: offers.source_case_id — tilbud udarbejdet ud fra en sag
-- =====================================================================
-- FORMÅL
--   Eksplicit, FK-sikret kobling "dette tilbud blev udarbejdet ud fra sag X"
--   (sag -> tilbud). Erstatter notes-markoeren '[agent-action:<id>]' som
--   dedup-noegle for Agent Core's offer.propose_draft_from_case.
--
--   Retningerne der allerede findes, og som IKKE maa forveksles:
--     service_cases.source_offer_id  : sagen blev oprettet ud fra tilbuddet
--     offers.converted_case_id       : tilbuddet blev konverteret til sagen
--   source_case_id er den tredje, modsatte relation og genbruger ingen af dem.
--
-- UNIKHED / IDEMPOTENS
--   Hoejst ÉT aabent tilbudsFORSLAG (is_proposal = true) pr. sag:
--     UNIQUE (source_case_id) WHERE source_case_id IS NOT NULL AND is_proposal
--   Almindelige tilbud (is_proposal = false, fx efter "promote" eller manuelt
--   oprettede) maa gerne vaere flere pr. sag (revisioner/alternativer) — normal
--   drift brydes derfor ikke. DB-indexet garanterer at samtidige agent-
--   udfoerelser ikke kan lave to forslag for samme sag.
--
-- BAGUDKOMPATIBEL
--   Additiv, nullable kolonne + partial indexes. Ingen eksisterende kode
--   laeser/skriver kolonnen; eksisterende inserts er uaendrede.
--
-- BACKFILL — KUN DETERMINISTISK, INGEN GAET
--   Saettes KUN for tilbud der er oprettet af en UDFOERT agent-action
--   offer.propose_draft_from_case, hvor actionens result.offer_id er praecis
--   dette tilbud og payload.case_id er en eksisterende sag. Ingen udledning fra
--   titel/notes/source_offer_id/converted_case_id. I production forventes 0
--   raekker (ingen agent har vaeret aktiveret).
--
-- ROLLBACK
--   BEGIN;
--   DROP INDEX IF EXISTS public.uq_offers_open_proposal_per_source_case;
--   DROP INDEX IF EXISTS public.idx_offers_source_case_id;
--   ALTER TABLE public.offers DROP COLUMN IF EXISTS source_case_id;
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--   (Kode der skriver source_case_id skal rulles tilbage FOERST.)
--
-- KOER IKKE MOD PRODUCTION uden eksplicit approval. Staging: npm run harness:migrate-staging -- 00159
-- =====================================================================

BEGIN;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS source_case_id UUID REFERENCES public.service_cases(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.offers.source_case_id IS
  '00159 — sagen tilbuddet blev udarbejdet ud fra (sag -> tilbud). Ikke det samme som converted_case_id (tilbud -> sag) eller service_cases.source_offer_id.';

CREATE INDEX IF NOT EXISTS idx_offers_source_case_id
  ON public.offers (source_case_id)
  WHERE source_case_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_offers_open_proposal_per_source_case
  ON public.offers (source_case_id)
  WHERE source_case_id IS NOT NULL AND is_proposal = true;

-- Deterministisk backfill (se header). Et tilbud faar kun en vaerdi hvis praecis
-- én udfoert action peger paa det; kun ét aabent forslag pr. sag (aeldste vinder,
-- resten efterlades NULL i stedet for at gaette).
WITH src AS (
  SELECT (a.result->>'offer_id')::uuid AS offer_id,
         (a.payload->>'case_id')::uuid AS case_id,
         a.executed_at
  FROM public.agent_actions a
  WHERE a.capability = 'offer.propose_draft_from_case'
    AND a.status = 'executed'
    AND a.result ? 'offer_id'
    AND a.payload ? 'case_id'
),
unambiguous AS (
  SELECT s.offer_id, s.case_id, s.executed_at
  FROM src s
  WHERE (SELECT count(*) FROM src s2 WHERE s2.offer_id = s.offer_id) = 1
),
ranked AS (
  SELECT u.offer_id, u.case_id,
         row_number() OVER (PARTITION BY u.case_id, o.is_proposal ORDER BY u.executed_at, u.offer_id) AS rn
  FROM unambiguous u
  JOIN public.offers o ON o.id = u.offer_id
  JOIN public.service_cases c ON c.id = u.case_id
  WHERE o.source_case_id IS NULL
)
UPDATE public.offers o
SET source_case_id = r.case_id
FROM ranked r
WHERE o.id = r.offer_id
  AND (r.rn = 1 OR o.is_proposal = false);

NOTIFY pgrst, 'reload schema';

COMMIT;
