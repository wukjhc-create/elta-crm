-- 00191 — Sletning må aldrig fjerne kundedata/underskrifter som sideeffekt (sags-review Q16, 2026-10-05)
--
-- Prod-definitioner (read-only 2026-10-05):
--   customers_created_by_fkey  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE  (created_by NOT NULL)
--   offers_customer_id_fkey    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
--
-- Problem:
--   * Slettes en tidligere medarbejders bruger (fx i Supabase-dashboardet; profiles følger auth.users), slettes ALLE
--     kunder vedkommende oprettede — og via offers-kaskaden deres tilbud, underskrifter, portal-links og dokumenter.
--   * Slettes en kunde, forsvinder tilbud og underskrifter stille (app'en spærrer nu dette siden Q16, men databasen
--     gør ikke — fx sletning direkte i dashboardet eller fremtidig kode).
--
-- Ny model:
--   * customers.created_by → ON DELETE SET NULL (kolonnen tillader NULL; kunden bevares, "oprettet af" bliver tom)
--   * offers.customer_id   → ON DELETE RESTRICT (en kunde med tilbud kan ikke slettes — deaktivér i stedet)
--
-- Prod før: ingen data ændres; kun FK-regler. Små tabeller (107 kunder, 15 tilbud) → kort lås.
-- OBS staging: harness-oprydning skal slette tilbud FØR kunder (tjekkes ved staging-kørsel: fuld regression).
--
-- Rollback:
--   ALTER TABLE public.offers DROP CONSTRAINT offers_customer_id_fkey,
--     ADD CONSTRAINT offers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
--   ALTER TABLE public.customers DROP CONSTRAINT customers_created_by_fkey,
--     ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
--   (NOT NULL på customers.created_by kan kun genindføres hvis ingen rækker har NULL)

BEGIN;

ALTER TABLE public.customers ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.customers
  DROP CONSTRAINT customers_created_by_fkey,
  ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.offers
  DROP CONSTRAINT offers_customer_id_fkey,
  ADD CONSTRAINT offers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verifikation: npx tsx scripts/prod-fk-delete-rules.ts → customers.created_by: SET NULL, offers.customer_id: RESTRICT
