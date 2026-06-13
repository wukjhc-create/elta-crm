-- =====================================================================
-- 00141: Sprint Ø2 ERP — udstyr, certifikater, historik + time_logs-kobling
-- =====================================================================
--
-- FORMÅL
--   Gør medarbejdermodulet til et ERP-modul: udstyr, certifikater,
--   revisionsspor (events) og arkitektonisk kobling af overtidssatser til
--   time_logs.
--
-- SCOPE / GARANTIER
--   - 100% ADDITIV. Ingen DROP, ingen ændring af eksisterende kolonner/data.
--   - time_logs: tilføjer pay_rate_type (default 'normal') + employee_rate_id
--     (nullable FK → employee_overtime_rates). GENBRUGER eksisterende
--     snapshot-kolonner (cost_rate_snapshot/sale_rate_snapshot/sale_amount fra
--     Ø1.1/1.2) — INTET dobbelt snapshot-system. Trigger 00137 røres ikke.
--   - Nye tabeller: employee_equipment, employee_certificates, employee_events.
--   - RLS spejler employees/employee_compensation (admin-or-self read,
--     admin write). updated_at-trigger via invoices_set_updated_at.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS employee_events;
--   DROP TABLE IF EXISTS employee_certificates;
--   DROP TABLE IF EXISTS employee_equipment;
--   ALTER TABLE time_logs DROP COLUMN IF EXISTS pay_rate_type;
--   ALTER TABLE time_logs DROP COLUMN IF EXISTS employee_rate_id;
--   NOTIFY pgrst, 'reload schema';
-- =====================================================================

BEGIN;

-- ---------- 1. time_logs ↔ overtidssatser ----------
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS pay_rate_type text NOT NULL DEFAULT 'normal';
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS employee_rate_id uuid
  REFERENCES employee_overtime_rates(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_logs_pay_rate_type_chk') THEN
    ALTER TABLE time_logs ADD CONSTRAINT time_logs_pay_rate_type_chk
      CHECK (pay_rate_type IN ('normal','ot1','ot2','weekend','holiday','other'));
  END IF;
END $$;

COMMENT ON COLUMN time_logs.pay_rate_type IS
  'Satstype for timeregistreringen: normal|ot1|ot2|weekend|holiday|other. Default normal. Snapshot af kost/salg ligger fortsat i *_snapshot/sale_amount.';
COMMENT ON COLUMN time_logs.employee_rate_id IS
  'Valgfri reference til den anvendte employee_overtime_rates-række (revisionsspor). SET NULL ved sletning af satsen.';

CREATE INDEX IF NOT EXISTS idx_time_logs_employee_rate ON time_logs(employee_rate_id);

-- ---------- 2. employee_equipment ----------
CREATE TABLE IF NOT EXISTS employee_equipment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category        text NOT NULL DEFAULT 'andet',
  serial_number   text,
  asset_number    text,
  status          text NOT NULL DEFAULT 'udleveret',
  issued_date     date,
  returned_date   date,
  value_amount    numeric(12,2),
  next_service_date date,
  note            text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_equipment_category_chk CHECK (category IN
    ('bil','telefon','pc','værktøj','måleinstrument','nøgle','arbejdstøj','andet')),
  CONSTRAINT employee_equipment_status_chk CHECK (status IN
    ('udleveret','returneret','mistet','defekt','service'))
);
CREATE INDEX IF NOT EXISTS idx_employee_equipment_employee ON employee_equipment(employee_id);

-- ---------- 3. employee_certificates ----------
CREATE TABLE IF NOT EXISTS employee_certificates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name          text NOT NULL,
  category      text NOT NULL DEFAULT 'andet',
  issuer        text,
  issued_date   date,
  expires_date  date,
  document_path text,
  note          text,
  archived      boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_certificates_category_chk CHECK (category IN
    ('autorisation','kursus','lift','varmt_arbejde','førstehjælp','solcelle','batteri_inverter','elsikkerhed','andet'))
);
CREATE INDEX IF NOT EXISTS idx_employee_certificates_employee ON employee_certificates(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_certificates_expires ON employee_certificates(expires_date);

-- ---------- 4. employee_events (revisionsspor) ----------
CREATE TABLE IF NOT EXISTS employee_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  title        text NOT NULL,
  description  text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_events_employee ON employee_events(employee_id, created_at DESC);

-- ---------- 5. RLS (admin-or-self read, admin write) ----------
ALTER TABLE employee_equipment    ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_events       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['employee_equipment','employee_certificates','employee_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_admin_or_self" ON %I', tbl, tbl);
    EXECUTE format($p$CREATE POLICY "%s_select_admin_or_self" ON %I
      FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        OR EXISTS (SELECT 1 FROM employees e WHERE e.id = %I.employee_id AND e.profile_id = auth.uid())
      )$p$, tbl, tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write_admin" ON %I', tbl, tbl);
    EXECUTE format($p$CREATE POLICY "%s_write_admin" ON %I
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))$p$, tbl, tbl);
    EXECUTE format('GRANT ALL ON %I TO authenticated, service_role', tbl);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_employee_equipment_updated_at ON employee_equipment;
CREATE TRIGGER trg_employee_equipment_updated_at BEFORE UPDATE ON employee_equipment
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();
DROP TRIGGER IF EXISTS trg_employee_certificates_updated_at ON employee_certificates;
CREATE TRIGGER trg_employee_certificates_updated_at BEFORE UPDATE ON employee_certificates
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();

NOTIFY pgrst, 'reload schema';

COMMIT;
