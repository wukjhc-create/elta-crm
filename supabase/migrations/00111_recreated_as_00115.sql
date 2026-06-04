-- =====================================================
-- 00111: PLACEHOLDER — INDHOLD RECREATED I 00115
--
-- Det oprindelige 00111 indeholdt site-felter paa service_cases
-- (Sprint 8G "betalende kunde vs. leveringskunde"):
--
--   - service_cases.site_customer_id  UUID FK customers(id) ON DELETE SET NULL
--   - service_cases.site_contact_id   UUID FK customer_contacts(id) ON DELETE SET NULL
--   - idx_service_cases_site_customer_id (partial WHERE NOT NULL)
--   - idx_service_cases_site_contact_id (partial WHERE NOT NULL)
--
-- Filen blev aldrig committed til repoet, men kolonnerne kom i prod
-- via en ad-hoc migration der ikke blev tjekket ind.
--
-- Sprint 10B verificerede prod-schema via scripts/inspect-10b-schema.mjs
-- og recreated migrationen idempotent som:
--
--   supabase/migrations/00115_recover_site_fields.sql
--
-- Denne placeholder bevarer nummer-raekkefoelgen og dokumenterer
-- historikken for fremtidige reviewere.
--
-- Hvis du leder efter site-felter-schemaet     → se 00115.
-- Hvis du leder efter sagspartner-modellen     → se 00112 (parties),
--                                                  00118 (offers),
--                                                  00119 (invoices).
-- Hvis du leder efter dokument-bekraeftelser   → se 00120 (Phase B1).
-- Hvis du leder efter struktureret rejection   → se 00121 (Phase 12A).
--
-- INGEN DDL. INGEN DML. INGEN side-effekter.
-- =====================================================

BEGIN;

-- No-op marker — registrerer migrationen i Supabase's history uden
-- at aendre database-state. SELECT WHERE FALSE returnerer 0 rows.
SELECT 1 WHERE FALSE;

COMMIT;
