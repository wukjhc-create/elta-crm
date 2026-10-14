-- 00215: "kun kladder kan redigeres" og "kun kladder/afviste kan slettes" håndhæves også i databasen.
-- Tilbuds-review 2026-10-09 (#4, S2): låsen findes kun i appen (lib/offers/edit-lock.ts). RLS (00170) lader
-- admin/serviceleder/salg opdatere tilbud og linjer uanset status. Med egen JWT via REST kunne salg ændre linjerne på et
-- ACCEPTERET tilbud (totals-triggeren genberegner final_amount → faktura fra tilbud fakturerer det ændrede, ikke det
-- underskrevne) eller sætte is_proposal=true og slette et underskrevet tilbud (offer_signatures slettes kaskade).
--
-- Kun for rollen 'authenticated' og kun direkte skrivninger (pg_trigger_depth() = 1): service_role (cron, portal-accept,
-- konvertering) og interne trigger-opdateringer (totals fra linjer) er uændrede. Appen er kompatibel: alle redigerende
-- actions kræver allerede kladde; deleteOffer kræver kladde/afvist (2026-10-09). Interne noter (notes), status-skift,
-- påmindelser, parti-roller og converted_case_id er IKKE omfattet. Ingen dataændring.
-- Bevidst triggere (ikke politikker) — politikkerne genereres af RLS-matricen (00170).

BEGIN;

-- 1. Tilbudslinjer: kun på kladder
CREATE OR REPLACE FUNCTION public.offer_line_items_draft_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF pg_trigger_depth() > 1 OR current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status INTO v_status FROM public.offers WHERE id = OLD.offer_id;
    -- NULL = tilbuddet findes ikke længere (kaskadesletning af en kladde/afvist) → tilladt
    IF v_status IS NOT NULL AND v_status <> 'draft' THEN
      RAISE EXCEPTION 'Tilbuddet er ikke en kladde — linjer kan ikke ændres' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT status INTO v_status FROM public.offers WHERE id = NEW.offer_id;
    IF v_status IS NOT NULL AND v_status <> 'draft' THEN
      RAISE EXCEPTION 'Tilbuddet er ikke en kladde — linjer kan ikke ændres' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_line_items_draft_guard ON public.offer_line_items;
CREATE TRIGGER trg_offer_line_items_draft_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.offer_line_items
  FOR EACH ROW EXECUTE FUNCTION public.offer_line_items_draft_guard();

-- 2. Tilbud: beløb/rabat/moms/kunde/indhold kun på kladder; is_proposal kan ikke sættes tilbage til true
CREATE OR REPLACE FUNCTION public.offers_draft_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status NOT IN ('draft', 'rejected') THEN
      RAISE EXCEPTION 'Kun kladder og afviste tilbud kan slettes' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_proposal = false AND NEW.is_proposal = true THEN
    RAISE EXCEPTION 'Et tilbud kan ikke gøres til forslag igen' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'draft' AND (
       NEW.customer_id, NEW.title, NEW.description, NEW.scope, NEW.terms_and_conditions,
       NEW.discount_percentage, NEW.tax_percentage,
       NEW.total_amount, NEW.discount_amount, NEW.tax_amount, NEW.final_amount
     ) IS DISTINCT FROM (
       OLD.customer_id, OLD.title, OLD.description, OLD.scope, OLD.terms_and_conditions,
       OLD.discount_percentage, OLD.tax_percentage,
       OLD.total_amount, OLD.discount_amount, OLD.tax_amount, OLD.final_amount
     ) THEN
    RAISE EXCEPTION 'Tilbuddet er ikke en kladde — indhold og priser kan ikke ændres' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offers_draft_lock_guard ON public.offers;
CREATE TRIGGER trg_offers_draft_lock_guard
  BEFORE UPDATE OR DELETE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.offers_draft_lock_guard();

COMMIT;
