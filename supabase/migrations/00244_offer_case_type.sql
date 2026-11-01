-- =====================================================================
-- 00244: eksplicit sagstype på tilbud — sagen fra tilbuddet arver typen (solar → solcelle-tjekliste, installation → el)
-- Runbook: docs/runbooks/offer-case-type-proposal.md. Godkendt af Henrik 2026-11-01 til STAGING; PROD kræver særskilt
-- godkendelse. Additiv og nullable: ingen default, ingen backfill, ingen RLS-/ACL-ændring (kolonnen følger offers-politikkerne).
-- Historiske tilbud (NULL) giver en el-installationssag som før (lib/offers/case-type serviceCaseTypeForOffer).
-- Rollback: ALTER TABLE public.offers DROP COLUMN case_type;  (koden falder tilbage til installation)
-- =====================================================================
BEGIN;

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS case_type TEXT;

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_case_type_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_case_type_check
  CHECK (case_type IS NULL OR case_type IN ('solar', 'installation'));

COMMENT ON COLUMN public.offers.case_type IS
  'Tilsigtet sagstype (solar = Solceller/batteri, installation = Elinstallation/service). Sagen fra tilbuddet arver typen; NULL = ikke valgt (historisk) → installation.';

COMMIT;
