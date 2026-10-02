-- =====================================================
-- Migration 00184: customer_documents.visible_to_customer — sagsdokumenter interne som standard (D26)
--
-- STATUS: STAGING (Henrik 2026-10-02: "Casefotos/dokumenter skal være INTERNE som standard. Brugeren skal aktivt
-- vælge 'Del med kunde'. Implementér 00184 på STAGING. Ingen prod endnu.") — prod = BLOCKED_APPROVAL.
--
-- Baggrund: fotos/PDF'er uploadet på sagens Dokumenter-fane (uploadCaseDocument, G4) gemmes i customer_documents,
-- og kundeportalen (getPortalDocuments) + partnerportalen viste ALLE kundens customer_documents.
--
-- Ændring (expand — bagudkompatibel):
--   1. Ny kolonne visible_to_customer boolean NOT NULL DEFAULT true. Default TRUE bevarer adfærden for alle
--      eksisterende og øvrige indsættelser (tilbud, kontrakter, besigtigelsesrapporter — de ER ment til kunden).
--      uploadCaseDocument sætter eksplicit false, medmindre brugeren aktivt vælger "Del med kunde".
--   2. Backfill → false (interne): eksisterende sags-uploads (storage_path 'customer-documents/<kunde>/case-…') og
--      mail-vedhæftninger gemt som kundedokumenter (source_email_id — kan være fra tredjepart, fx leverandør).
--      Prod (read-only 2026-10-02): 0 sags-uploads + 3 mail-vedhæftninger bliver interne; 15 øvrige forbliver synlige.
--   3. Delvist indeks til portalens opslag (kun synlige).
-- Kode der læser/skriver kolonnen ligger på grenen d26-internal-case-docs og merges FØRST efter prod-migrationen
-- (push til main deployer prod — portal-forespørgslen ville ellers fejle uden kolonnen).
--
-- Ingen nye tabeller → ingen nye RLS-policies/GRANTs (kolonnen arver tabellens).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.idx_customer_documents_visible_customer;
--   ALTER TABLE public.customer_documents DROP COLUMN IF EXISTS visible_to_customer;
--   (koden fra grenen skal da også rulles tilbage)
-- =====================================================

ALTER TABLE public.customer_documents
  ADD COLUMN IF NOT EXISTS visible_to_customer boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.customer_documents.visible_to_customer IS
  'D26: vises i kunde-/partnerportal. Sagsuploads er interne (false) medmindre brugeren aktivt deler.';

UPDATE public.customer_documents
   SET visible_to_customer = false
 WHERE (storage_path LIKE 'customer-documents/%/case-%' OR source_email_id IS NOT NULL)
   AND visible_to_customer = true;

CREATE INDEX IF NOT EXISTS idx_customer_documents_visible_customer
  ON public.customer_documents (customer_id)
  WHERE visible_to_customer;
