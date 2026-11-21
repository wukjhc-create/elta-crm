-- Rollback af 00253 (sync_leases + funktioner). Koden tåler at de mangler: mail-sync kører uden kørsels-lås (som før
-- 00253) og logger en advarsel. Ved "*/5 * * * *" bør cron'en da sættes tilbage til daglig, før rollback.
BEGIN;
DROP FUNCTION IF EXISTS public.sync_lease_release(text, uuid);
DROP FUNCTION IF EXISTS public.sync_lease_acquire(text, integer);
DROP TABLE IF EXISTS public.sync_leases;
COMMIT;
