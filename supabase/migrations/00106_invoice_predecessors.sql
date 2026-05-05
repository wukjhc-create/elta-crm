-- =====================================================
-- Migration 00106: Sprint 6D-1 — invoice_predecessors junction
--
-- En slutfaktura kan fratrække flere forgængere (forskud + rater)
-- på samme sag. Mange-til-mange relation → junction-tabel.
--
-- Hvorfor IKKE en single parent_invoice_id:
--  - Slutfaktura kan henvise til 2 forskud + 3 rater = 5 forgængere
--  - Operatør skal kunne se hver fratrukket faktura som egen linje
--    på slutfakturaens PDF
--  - parent_invoice_id (FK 1:1) ville begrænse os til kæder
--
-- ALL ADDITIVE — ny tabel. Idempotent.
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_predecessors (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  /* "Barnet" — slutfakturaen der fratrækker forgængeren. */
  invoice_id             UUID NOT NULL
                         REFERENCES invoices(id) ON DELETE CASCADE,

  /* "Forælderen" — en deposit/progress på samme sag.
     ON DELETE RESTRICT: kan IKKE slette en faktura der er fratrukket
     på en slutfaktura. Beskytter audit-trail mod utilsigtet sletning. */
  predecessor_invoice_id UUID NOT NULL
                         REFERENCES invoices(id) ON DELETE RESTRICT,

  /* Snapshot af forgængerens total_amount på det tidspunkt slutfakturaen
     blev oprettet. Hvis forgængeren senere ændres (status/payment), så
     ændres deduction_amount IKKE — slutfakturaen er frosset. */
  deduction_amount       NUMERIC(12,2) NOT NULL,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Indexes ----------

CREATE INDEX IF NOT EXISTS idx_invoice_predecessors_invoice
  ON invoice_predecessors(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_predecessors_predecessor
  ON invoice_predecessors(predecessor_invoice_id);

-- Idempotency: en forgænger kan kun fratrækkes ÉN gang fra samme
-- slutfaktura. (Hvis vi vil fratrække forgængeren på forskellige
-- slutfakturaer på forskellige sager kan vi det stadig — kun
-- (invoice_id, predecessor_invoice_id) er unique).
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_predecessors
  ON invoice_predecessors(invoice_id, predecessor_invoice_id);

-- ---------- RLS + grants (matches eksisterende invoices/invoice_lines pattern) ----------

ALTER TABLE invoice_predecessors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_predecessors_all_auth" ON invoice_predecessors;
CREATE POLICY "invoice_predecessors_all_auth"
  ON invoice_predecessors FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT ALL ON invoice_predecessors TO authenticated, service_role;
