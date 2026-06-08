-- =====================================================
-- 00129: Phase α.3 trin 2 — customer_documents anon lockdown
--
-- Drop'er to anon SELECT-policies + revoker alle anon-grants paa
-- customer_documents. Portal-flow bruger admin-client siden α.1 / 00122.
--
-- Anon-policies droppet:
--   - "Portal users can view their documents"  (cmd=SELECT, qual=true — wide open!)
--   - "anon_select_customer_documents"          (cmd=SELECT, qual=true — wide open!)
--
-- Begge policies havde qual=true, hvilket betyder anon med SELECT-grant
-- og bare et token-flow var i stand til at se ALLE dokumenter paa tvaers
-- af kunder. Det her er den klareste lockdown-vinding i hele α.3.
--
-- Kode-audit foer migration:
--   - getPortalDocuments (portal.ts) — admin (siden α.1)
--   - getConfirmationContext / submitConfirmation (document-confirmations.ts) — admin
--   - getPortalFuldmagter / submitSignedFuldmagt (fuldmagt.ts) — admin
--   - cron offer-reminders — refactoret til admin i denne commit
--   - besigtigelse.ts, customer-documents.ts, customer-flow.ts — authenticated
--
-- Authenticated employee + service-role policies bevares uberoert.
--
-- Idempotent. Ingen data-aendring.
-- =====================================================

BEGIN;

-- 1. Drop begge anon-SELECT-policies
DROP POLICY IF EXISTS "Portal users can view their documents" ON customer_documents;
DROP POLICY IF EXISTS "anon_select_customer_documents" ON customer_documents;

-- 2. Revoke alle anon-grants
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON customer_documents FROM anon;

COMMENT ON TABLE customer_documents IS
  'Phase alpha.3 trin 2 (00129): anon SELECT-policies + grants fjernet. Portal-flow (getPortalDocuments, getPortalFuldmagter, getConfirmationContext) bruger admin-client efter token-validering. Authenticated employee + service-role policies uberoert.';

NOTIFY pgrst, 'reload schema';

COMMIT;
