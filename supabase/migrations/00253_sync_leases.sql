-- =====================================================================
-- 00253: kørsels-lease for baggrundsjob (Stage A — mail-sync hvert 5. minut)
-- Runbook: docs/runbooks/STAGE_A_EMAIL_INGEST_PREFLIGHT.md (§ cron/overlap).
--
-- Mail-sync'en har ingen kørsels-lås. Prod-kørsler tager p50 75 s, p95 128 s, max 241 s (maxDuration 300 s); med
-- "*/5 * * * *" (og manuel "Hent nye") kan to kørsler overlappe og begge behandle samme ubehandlede mail (dobbelte
-- AI-kald, mulige dublet-kunder). Indsættelse (graph_message_id UNIQUE) og henvendelser (reception_ingest) er allerede
-- idempotente — denne lease forhindrer selve overlappet.
--
--  * public.sync_leases(name PK, holder, acquired_at, expires_at) — RLS slået til, INGEN politikker, ingen tabel-grants
--    til nogen API-rolle (heller ikke service_role): kun via funktionerne.
--  * sync_lease_acquire(name, ttl_seconds) → holder-uuid eller NULL (optaget). Atomisk (INSERT … ON CONFLICT … WHERE
--    expires_at < now()); en udløbet lease (fx kørsel dræbt ved timeout) overtages. TTL 30–3600 s.
--  * sync_lease_release(name, holder) → true kun for indehaveren.
--  * SECURITY DEFINER, fast search_path, EXECUTE kun service_role.
--
-- Rollback (docs/runbooks/sql/00253_rollback.sql):
--   DROP FUNCTION IF EXISTS public.sync_lease_release(text, uuid);
--   DROP FUNCTION IF EXISTS public.sync_lease_acquire(text, integer);
--   DROP TABLE IF EXISTS public.sync_leases;
-- Koden tåler at 00253 mangler (kører som i dag uden lås og logger en advarsel).
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.sync_leases (
  name        TEXT PRIMARY KEY CHECK (name ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  holder      UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.sync_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sync_leases FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE public.sync_leases IS 'Kørsels-leases for baggrundsjob (fx email-sync). Kun via sync_lease_acquire/sync_lease_release (service_role).';

CREATE OR REPLACE FUNCTION public.sync_lease_acquire(p_name text, p_ttl_seconds integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_holder uuid := gen_random_uuid();
  v_got uuid;
BEGIN
  IF p_name IS NULL OR p_name !~ '^[a-z0-9][a-z0-9_-]{0,62}$' THEN
    RAISE EXCEPTION 'ugyldigt lease-navn' USING ERRCODE = '22023';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 30 OR p_ttl_seconds > 3600 THEN
    RAISE EXCEPTION 'lease-TTL skal være 30–3600 sekunder' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.sync_leases (name, holder, acquired_at, expires_at)
  VALUES (p_name, v_holder, now(), now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (name) DO UPDATE
    SET holder = EXCLUDED.holder, acquired_at = EXCLUDED.acquired_at, expires_at = EXCLUDED.expires_at
    WHERE public.sync_leases.expires_at < now()
  RETURNING holder INTO v_got;
  RETURN v_got; -- NULL = en anden kørsel holder en gyldig lease
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lease_release(p_name text, p_holder uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.sync_leases WHERE name = p_name AND holder = p_holder;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_lease_acquire(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_lease_release(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lease_acquire(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_lease_release(text, uuid) TO service_role;

COMMIT;
