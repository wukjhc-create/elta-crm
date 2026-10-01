-- =====================================================
-- Migration 00184: customer_documents — intern dokumenttype (ikke synlig i kundeportalen)
--
-- STATUS: FORBEREDT — IKKE KØRT (BLOCKED_APPROVAL: kræver Henriks godkendelse + produktbeslutning).
--
-- Baggrund (overnight 2026-10-01): fotos/PDF'er der uploades på sagens Dokumenter-fane
-- (uploadCaseDocument, G4) gemmes i customer_documents med document_type='other' — og
-- kundeportalen (getPortalDocuments) viser ALLE kundens customer_documents. Dvs. montørens
-- byggepladsfotos m.m. er synlige for kunden. UI'et siger det nu tydeligt, men der er ingen
-- måde at uploade internt på.
--
-- Ændring: udvid CHECK med 'internal'. Kode (efter migration): uploadCaseDocument får
-- valget "Del med kunden" (standard afgøres af Henrik), getPortalDocuments udelader
-- document_type='internal'. Ingen data ændres; eksisterende rækker uændret.
--
-- ROLLBACK:
--   ALTER TABLE public.customer_documents DROP CONSTRAINT IF EXISTS customer_documents_document_type_check;
--   ALTER TABLE public.customer_documents ADD CONSTRAINT customer_documents_document_type_check
--     CHECK (document_type IN ('quote', 'invoice', 'contract', 'other', 'besigtigelse'));
--   (fejler hvis der findes rækker med 'internal' — flyt dem først)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_documents_document_type_check'
      AND conrelid = 'public.customer_documents'::regclass
  ) THEN
    ALTER TABLE public.customer_documents DROP CONSTRAINT customer_documents_document_type_check;
  END IF;
END $$;

ALTER TABLE public.customer_documents
  ADD CONSTRAINT customer_documents_document_type_check
  CHECK (document_type IN ('quote', 'invoice', 'contract', 'other', 'besigtigelse', 'internal'));
