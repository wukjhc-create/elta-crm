-- =====================================================
-- Migration 00105: Sprint 6D-1 — invoices multi-stage felter
--
-- Tilføjer felter der gør det muligt at fakturere én sag i flere
-- stadier (forskud / rate / slutfaktura) i stedet for kun én "fuld
-- faktura" per sag (Sprint 6B's flow).
--
-- Alle eksisterende fakturaer får automatisk invoice_type='standard'
-- + amount_basis='lines' + is_final_invoice=false via DEFAULT-værdier.
-- Backwards-compat: Sprint 6B's createInvoiceDraftFromCase fortsætter
-- uden ændring — den skriver bare standard-værdierne.
--
-- ALL ADDITIVE — no DROP, no rename, no NOT NULL backfill, no data
-- transformation. Idempotent.
-- =====================================================

-- ---------- 1. invoice_type ----------
-- Hvad slags faktura er det her?
--   'standard' — Sprint 6B's flow: én faktura, alle valgte source-rows
--   'deposit'  — forskud (a conto FØR forbrug; procent af kontraktsum)
--   'progress' — ratefaktura (a conto UNDER forbrug; procent ELLER
--                konkrete source-rows)
--   'final'    — slutfaktura (alle resterende source-rows MINUS
--                tidligere deposit/progress fakturaer som fradrag)
--   'credit'   — kreditnota — RESERVERET, ikke implementeret i 6D
--                (placeret i CHECK så schema-skift ikke kræves senere)

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (invoice_type IN ('standard','deposit','progress','final','credit'));

-- ---------- 2. billing_percentage ----------
-- Procent (0.0–100.0) af amount_basis_value, ELLER NULL.
-- NULL = beløbet kommer fra invoice_lines (Sprint 6B-flow).
-- Fyldt = procent-baseret deposit/progress.
-- Eksklusiv konstellation:
--   * standard / final → forventet NULL (beløb fra linjer)
--   * deposit          → forventet udfyldt (beløb fra procent)
--   * progress         → kan være enten (operatør vælger procent ELLER linjer)
-- Konstellationen håndhæves IKKE på DB-niveau (giver fleksibilitet
-- til kombinations-fakturaer senere); service-laget validerer.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS billing_percentage NUMERIC(5,2)
    CHECK (
      billing_percentage IS NULL
      OR (billing_percentage > 0 AND billing_percentage <= 100)
    );

-- ---------- 3. amount_basis ----------
-- Hvilket grundlag procenten beregnes af.
--   'contract_sum' → service_cases.contract_sum (oprindelig tilbudt)
--   'revised_sum'  → service_cases.revised_sum  (efter ændringsbestillinger)
--   'lines'        → ingen procent-spil; beløb summeres fra invoice_lines
-- Default 'lines' så eksisterende rows og Sprint 6B's flow uændret.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_basis TEXT NOT NULL DEFAULT 'lines'
    CHECK (amount_basis IN ('contract_sum','revised_sum','lines'));

-- ---------- 4. amount_basis_value ----------
-- Snapshot af basis-beløbet på faktura-tidspunkt. Frosset.
-- Selv hvis service_cases.contract_sum ændrer sig senere, kan vi
-- regenerere PDF'en med nøjagtigt samme tal som blev sendt.
-- NULL når amount_basis = 'lines' (procent ikke i spil).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_basis_value NUMERIC(12,2);

-- ---------- 5. stage_label ----------
-- Synlig label på PDF + UI. Operatør-styret eller auto-foreslået.
-- Eksempler:
--   'Forskud'                 (deposit)
--   'Rate 2 af 3'             (progress)
--   'Slutfaktura'             (final)
--   NULL                      (standard — ingen særlig label)

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS stage_label TEXT;

-- ---------- 6. is_final_invoice ----------
-- Boolean for slutfaktura. Bruges som UNIQUE-grundlag (én slut pr.
-- sag — håndhævet af partial unique index nedenfor) og som filter
-- på Økonomi-tab + e-conomic mapping senere.
-- Default false → eksisterende rows kommer ind som ikke-slut.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS is_final_invoice BOOLEAN NOT NULL DEFAULT false;

-- ---------- 7. INDEXES ----------

-- Højst én slutfaktura pr. sag — DB håndhæver det.
-- Partial index: kun rækker hvor is_final_invoice=true tæller med.
-- Eksisterende rows (alle false) udelades af indexet → ingen kollision.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_one_final_per_case
  ON invoices(case_id)
  WHERE is_final_invoice = true AND case_id IS NOT NULL;

-- Lookup: alle deposit/progress på en sag — bruges af slutfaktura-
-- beregning ("hvilke forgængere skal fratrækkes?") + Økonomi-tab
-- ("hvad er allerede faktureret som forskud/rate?").
-- Partial: vi springer 'standard'/'final'/'credit' over fordi de
-- ikke er forgængere.
CREATE INDEX IF NOT EXISTS idx_invoices_case_stage
  ON invoices(case_id, invoice_type)
  WHERE case_id IS NOT NULL
    AND invoice_type IN ('deposit','progress');
