-- 00199 — UDKAST (BLOCKED_APPROVAL, Henrik) — IKKE kørt på staging eller prod.
--
-- Problem (kunde-/leads-review 2026-10-07, S1 datatab — latent): customers.created_by → profiles(id) er
-- ON DELETE CASCADE (00004), og profiles.id → auth.users er CASCADE. Slettes en bruger (fx i Supabase-dashboardet når
-- en medarbejder stopper), slettes ALLE kunder brugeren har oprettet — og alt der kaskaderer fra kunderne (portal,
-- dokumenter, opgaver, noter …). Prod read-only (scripts/prod-fk-cascade-from-profiles.ts): 109 kunder fordelt på 3
-- brugere; den største enkeltbruger har oprettet 101 (mail-automatikken bruger første admin). Ingen app-sti sletter
-- brugere i dag (kun dashboard/SQL). leads/offers/projects/service_cases/invoices har IKKE længere CASCADE.
--
-- Rettelse: created_by må være NULL og sættes til NULL ved brugersletning (kunden bevares).
-- Rollback: ALTER … SET NOT NULL kræver at ingen rækker har NULL; FK tilbage til CASCADE frarådes.

BEGIN;

ALTER TABLE public.customers ALTER COLUMN created_by DROP NOT NULL;

DO $$
DECLARE v_name text;
BEGIN
  SELECT c.conname INTO v_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.conrelid = 'public.customers'::regclass AND c.contype = 'f' AND a.attname = 'created_by';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.customers DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMIT;
