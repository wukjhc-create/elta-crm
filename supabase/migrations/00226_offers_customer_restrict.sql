-- =====================================================
-- Migration 00226: offers.customer_id ON DELETE CASCADE → RESTRICT (resten af 00191)
--
-- STATUS: UDKAST — kræver Henriks EKSPLICITTE godkendelse (branch offers-customer-restrict-00226). Ikke kørt i prod.
--
-- Baggrund: 00191 (branch fk-delete-safety, aldrig kørt) havde to dele. Delen customers.created_by → SET NULL er i prod
-- via 00199 (2026-10-07). Delen offers.customer_id → RESTRICT kom ALDRIG i prod (prod-fk-delete-rules 2026-10-15:
-- "offers.customer_id → customers: CASCADE"): sletning af en kunde direkte i databasen/dashboardet eller fra fremtidig
-- kode sletter stille alle kundens tilbud og — via offer_signatures CASCADE — de digitale underskrifter. Appen spærrer
-- sletning af kunder med tilbud (Q16, UI U135), men databasen gør ikke.
--
-- Ændring: kun FK-reglen. En kunde med tilbud kan ikke slettes (fejl 23503) — deaktivér i stedet.
-- Data: ingen rækker ændres. Lille tabel → kort lås.
-- Pre/post (read-only): npx tsx scripts/prod-fk-delete-rules.ts  (før CASCADE, efter RESTRICT)
-- Rollback:
--   ALTER TABLE public.offers DROP CONSTRAINT offers_customer_id_fkey,
--     ADD CONSTRAINT offers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
-- =====================================================

BEGIN;

ALTER TABLE public.offers
  DROP CONSTRAINT offers_customer_id_fkey,
  ADD CONSTRAINT offers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;

NOTIFY pgrst, 'reload schema';

COMMIT;
