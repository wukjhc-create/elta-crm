-- =====================================================
-- Migration 00107: Sprint 6F-1 — invoice credit-note felter
--
-- Tilføjer felter til at oprette kreditnota mod en eksisterende
-- faktura uden at slette historik. Bygger oven på 6D-1's
-- invoice_type='credit' (allerede reserveret i CHECK siden mig 00105).
--
-- Designet:
--  - Kreditnota er en INVOICE-row med invoice_type='credit'.
--    Den får sit eget unikke fakturanummer i F-YYYY-NNNN-sekvensen
--    (dansk lov-krav).
--  - credit_of_invoice_id peger 1:1 fra kreditnotaen til original-
--    fakturaen. Service-laget skriver også en row til
--    invoice_predecessors (audit-trail i samme tabel som final-
--    fakturaers forgænger-relation, mig 00106) — det giver hurtig
--    lookup til både retning.
--  - voided_at/voided_by markerer at en original-faktura er FULDT
--    krediteret. Reminder-cron skal skippe disse i 6F-4.
--
-- ALL ADDITIVE — no DROP, no rename, no NOT NULL backfill, no data
-- transformation. Idempotent.
-- =====================================================

-- ---------- 1. credit_of_invoice_id ----------
-- 1:1 link fra kreditnota → original-faktura. NULL for alle ikke-credit
-- invoices (inkl. eksisterende). Når sat, må original IKKE slettes →
-- ON DELETE RESTRICT beskytter audit-trail.
--
-- En original kan have FLERE kreditnotaer pegende på sig (delvise
-- kreditnotaer over tid) — så feltet er IKKE unikt på sig selv.
-- Dobbelt-credit-guard ligger på service-niveau (sum af eksisterende
-- credits ≤ original.final_amount).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS credit_of_invoice_id UUID
    REFERENCES invoices(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_invoices_credit_of
  ON invoices(credit_of_invoice_id)
  WHERE credit_of_invoice_id IS NOT NULL;

-- ---------- 2. credit_reason ----------
-- Frit tekst-felt der vises på kreditnota-PDF og i UI som
-- revisor-spor ("Hvorfor blev denne faktura krediteret?").
-- TEXT (ikke VARCHAR) → ingen længdebegrænsning på DB-niveau.
-- Service-laget kan håndhæve max-længde (fx 1000) hvis ønsket.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS credit_reason TEXT;

-- ---------- 3. voided_at + voided_by ----------
-- Markør for at en original-faktura er fuldt krediteret.
-- Sættes af service når sum(kreditnotaer.final_amount) =
-- original.final_amount. Reminder-cron filtrerer på
-- voided_at IS NULL fra 6F-4.
--
-- Ikke en separat status-værdi — fakturaens status
-- (draft/sent/paid) repræsenterer stadig hvad der oprindeligt skete.
-- voided_at er en sekundær flag der lever ortogonalt på status.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_voided
  ON invoices(voided_at)
  WHERE voided_at IS NOT NULL;
