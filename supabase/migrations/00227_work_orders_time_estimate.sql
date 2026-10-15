-- =====================================================
-- Migration 00227: tidspunkt og estimeret varighed på arbejdsordrer (planlægning, fokus E)
--
-- STATUS: GODKENDT af Henrik 2026-10-15 ("00227 GODKENDT TIL PROD").
--
-- Ændring: to valgfrie kolonner. Ingen backfill/gæt på eksisterende rækker (NULL = heldag/ukendt varighed som i dag).
--   start_time       time          — lokal tid (Europe/Copenhagen) på scheduled_date
--   estimated_hours  numeric(5,2)  — 0 < x <= 24
-- RLS: kolonner på eksisterende tabel → eksisterende politikker gælder.
-- Pre/post: npx tsx scripts/prod-check-00227.ts (kolonner + work_orders-checksum uændret)
-- Rollback:
--   ALTER TABLE public.work_orders DROP COLUMN IF EXISTS start_time, DROP COLUMN IF EXISTS estimated_hours;
-- =====================================================

BEGIN;

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS estimated_hours numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_estimated_hours_check') THEN
    ALTER TABLE public.work_orders
      ADD CONSTRAINT work_orders_estimated_hours_check CHECK (estimated_hours IS NULL OR (estimated_hours > 0 AND estimated_hours <= 24));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
