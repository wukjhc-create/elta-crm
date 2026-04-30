-- =====================================================
-- Migration 00086: Employees, work orders, time logs (Phase 7)
--
-- NOTE: Legacy `time_entries` table (project-based hour-card) is left
-- intact since reports/projects modules depend on it (0 rows currently
-- but referenced from code). New work-order timer flow lives in
-- `time_logs` to avoid schema collision.
-- =====================================================

-- ---------- 1. employees ----------
CREATE TABLE IF NOT EXISTS employees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'electrician'
              CHECK (role IN ('admin','electrician','installer')),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_employees_profile ON employees(profile_id);

-- ---------- 2. work_orders ----------
CREATE TABLE IF NOT EXISTS work_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID REFERENCES service_cases(id) ON DELETE SET NULL,
  customer_id           UUID REFERENCES customers(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  status                TEXT NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned','in_progress','done','cancelled')),
  scheduled_date        DATE,
  assigned_employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_status     ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_assignee   ON work_orders(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_case       ON work_orders(case_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_scheduled  ON work_orders(scheduled_date);

-- ---------- 3. time_logs ----------
CREATE TABLE IF NOT EXISTS time_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ,
  -- Auto-computed: NULL while timer is running, hours after stop.
  hours           NUMERIC(10,2) GENERATED ALWAYS AS (
                    CASE
                      WHEN end_time IS NOT NULL
                        THEN ROUND((EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)::numeric, 2)
                      ELSE NULL
                    END
                  ) STORED,
  description     TEXT,
  billable        BOOLEAN NOT NULL DEFAULT true,
  invoice_line_id UUID,                                -- set when this log has been billed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time IS NULL OR end_time >= start_time)
);

-- Safety invariant: at most one running timer per employee.
-- Partial unique index — only enforces when end_time IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_logs_one_active_per_employee
  ON time_logs(employee_id)
  WHERE end_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_logs_employee_time ON time_logs(employee_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_time_logs_work_order    ON time_logs(work_order_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_billable_open
  ON time_logs(work_order_id)
  WHERE billable = true AND invoice_line_id IS NULL AND end_time IS NOT NULL;

-- ---------- RLS + grants ----------
ALTER TABLE employees   ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_all_auth"   ON employees;
DROP POLICY IF EXISTS "work_orders_all_auth" ON work_orders;
DROP POLICY IF EXISTS "time_logs_all_auth"   ON time_logs;

CREATE POLICY "employees_all_auth"   ON employees   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "work_orders_all_auth" ON work_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "time_logs_all_auth"   ON time_logs   FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON employees   TO authenticated, service_role;
GRANT ALL ON work_orders TO authenticated, service_role;
GRANT ALL ON time_logs   TO authenticated, service_role;

-- ---------- updated_at triggers (re-uses helper from 00080) ----------
DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();

DROP TRIGGER IF EXISTS trg_work_orders_updated_at ON work_orders;
CREATE TRIGGER trg_work_orders_updated_at BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();
