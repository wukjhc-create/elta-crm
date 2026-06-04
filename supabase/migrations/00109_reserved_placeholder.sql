-- =====================================================
-- 00109: RESERVERET — NUMMER ALDRIG BRUGT
--
-- Dette nummer-slot blev oprindeligt reserveret til to forskellige
-- formaal der begge blev SKROPPET:
--
--   1. Sprint 7 RBAC: profiles.case_scope-kolonne
--      → Status: ikke gennemfoert. RBAC-foundation blev i stedet
--        landed som 00108_rbac_foundation.sql.
--      → Referencer i: SPRINT_7_RBAC_PERMISSIONS_ANALYSIS.md:199, 507
--
--   2. Sprint 8C-2: call_notes-tabel + communication-timeline
--      → Status: sprint skroppet. Tabellen findes ikke i prod og
--        koden refererer ikke til den.
--      → Referencer i: SPRINT_8C_2_CALL_NOTES_AND_COMMUNICATION_TIMELINE_PLAN.md:418, 441, 541
--
-- Denne placeholder forhindrer at nummer-slottet ved en fejl bruges
-- til en ny migration der konflikter med historikken.
-- Hvis du har en ny migration der skal koeres, vaelg et hoejere nummer
-- end den seneste eksisterende migration.
--
-- INGEN DDL. INGEN DML. INGEN side-effekter.
-- =====================================================

BEGIN;

-- No-op marker — registrerer migrationen i Supabase's history uden
-- at aendre database-state. SELECT WHERE FALSE returnerer 0 rows.
SELECT 1 WHERE FALSE;

COMMIT;
