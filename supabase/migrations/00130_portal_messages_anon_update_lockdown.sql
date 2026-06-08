-- =====================================================
-- 00130: Phase α.3 trin 3 — portal_messages anon UPDATE lockdown
--
-- Drop'er den sidste anon-policy paa portal_messages og revoker alle
-- anon-grants. Tabellen var allerede lukket for anon SELECT/INSERT i
-- α.1 / 00122; kun read-status UPDATE manglede.
--
-- Drop'et policy:
--   "Anon can update portal message read status" (UPDATE, qual=sender_type='employee')
--
-- Sikkerhedsforbedring der ligger i koden (commit FOER denne migration):
--   markPortalMessagesAsRead bruger nu createAdminClient + eksplicit
--   customer_id-scope. Den gamle anon-policy havde KUN sender_type-tjek,
--   ikke customer_id-tjek — en kunde med vilkaarlige message-IDs kunne
--   markere andres employee-beskeder som laest.
--
-- Kode-audit:
--   - portal.ts getPortalMessages — admin (siden α.1)
--   - portal.ts sendPortalMessage — admin (siden α.1)
--   - portal.ts markPortalMessagesAsRead — admin + customer_id-scope (denne commit)
--   - portal.ts sendEmployeeMessage — authenticated
--   - portal.ts getUnreadPortalMessageCount — authenticated
--   - portal.ts getCustomerPortalMessages — authenticated
--   - portal.ts markCustomerMessagesAsRead — authenticated
--   - quote-generator.ts portal_messages INSERT — service-role (getServiceClient)
--
-- Idempotent. Ingen data-aendring. Authenticated + service-role
-- policies uberoert.
-- =====================================================

BEGIN;

DROP POLICY IF EXISTS "Anon can update portal message read status" ON portal_messages;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON portal_messages FROM anon;

COMMENT ON TABLE portal_messages IS
  'Phase alpha.3 trin 3 (00130): sidste anon-policy + grants fjernet. Alle portal-paths bruger admin-client efter token-validering + customer_id-scope.';

NOTIFY pgrst, 'reload schema';

COMMIT;
