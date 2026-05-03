-- =====================================================
-- Migration 00096: Employee management module (full)
--
-- Builds on the Phase 7/8 employees table by:
--  - extending it with personal/HR fields needed for a real CRM
--  - widening the role enum to the full Danish role set
--  - splitting compensation into its own 1:1 table (frequent edits, RLS)
--  - adding employee_compensation_history (append-only audit)
--  - tightening RLS so only admins can write, and employees can read
--    only their own row.
--
-- Backwards-compatible: existing employees columns (id, profile_id,
-- name, email, role, active, hourly_rate, cost_rate, created_at,
-- updated_at) preserved as-is. hourly_rate/cost_rate are kept as a
-- denormalised cache that mirrors employee_compensation (kept up to
-- date by trigger on compensation upsert) so the existing time_logs
-- cost_amount trigger keeps working unchanged.
-- =====================================================

-- ---------- 1. employees: extend with HR fields ----------

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_number   TEXT,
  ADD COLUMN IF NOT EXISTS first_name        TEXT,
  ADD COLUMN IF NOT EXISTS last_name         TEXT,
  ADD COLUMN IF NOT EXISTS address           TEXT,
  ADD COLUMN IF NOT EXISTS postal_code       TEXT,
  ADD COLUMN IF NOT EXISTS city              TEXT,
  ADD COLUMN IF NOT EXISTS phone             TEXT,
  ADD COLUMN IF NOT EXISTS hire_date         DATE,
  ADD COLUMN IF NOT EXISTS termination_date  DATE,
  ADD COLUMN IF NOT EXISTS notes             TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_employee_number
  ON employees(employee_number) WHERE employee_number IS NOT NULL;

-- Widen the role CHECK to the full set the spec calls out.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees
  ADD CONSTRAINT employees_role_check
  CHECK (role IN (
    'admin', 'electrician', 'installer',         -- legacy values kept for rows that already use them
    'elektriker', 'montør', 'lærling',
    'projektleder', 'kontor'
  ));

-- ---------- 2. employee_compensation (1:1 current rates) ----------

CREATE TABLE IF NOT EXISTS employee_compensation (
  employee_id          UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  hourly_wage          NUMERIC(10,2),     -- timeløn (sale-side base, what we pay employee per hour)
  internal_cost_rate   NUMERIC(10,2),     -- intern kostpris pr. time (loaded cost, used for profit calc)
  sales_rate           NUMERIC(10,2),     -- salgspris pr. time (what we charge customer)
  pension_pct          NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- pension %
  free_choice_pct      NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- fritvalg %
  vacation_pct         NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- feriepenge %
  sh_pct               NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- SH/søgnehelligdage %
  social_costs         NUMERIC(10,2) NOT NULL DEFAULT 0,   -- ATP/sociale omkostninger (DKK / hour)
  overhead_pct         NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- overhead %
  overtime_rate        NUMERIC(10,2),                       -- overtidssats (DKK / hour)
  mileage_rate         NUMERIC(10,2),                       -- kørselssats (DKK / km)
  -- Generated column: real hourly cost = hourly_wage × (1 + sum of percentages) + social_costs
  real_hourly_cost     NUMERIC(10,2) GENERATED ALWAYS AS (
    ROUND(
      (
        COALESCE(hourly_wage, 0) *
          (1 + (COALESCE(pension_pct,0) + COALESCE(free_choice_pct,0) + COALESCE(vacation_pct,0) + COALESCE(sh_pct,0) + COALESCE(overhead_pct,0)) / 100)
        + COALESCE(social_costs, 0)
      )::numeric, 2
    )
  ) STORED,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_compensation_real_cost
  ON employee_compensation(real_hourly_cost);

-- ---------- 3. employee_compensation_history (append-only audit) ----------

CREATE TABLE IF NOT EXISTS employee_compensation_history (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- snapshot of every field at the time of change
  hourly_wage          NUMERIC(10,2),
  internal_cost_rate   NUMERIC(10,2),
  sales_rate           NUMERIC(10,2),
  pension_pct          NUMERIC(5,2),
  free_choice_pct      NUMERIC(5,2),
  vacation_pct         NUMERIC(5,2),
  sh_pct               NUMERIC(5,2),
  social_costs         NUMERIC(10,2),
  overhead_pct         NUMERIC(5,2),
  overtime_rate        NUMERIC(10,2),
  mileage_rate         NUMERIC(10,2),
  real_hourly_cost     NUMERIC(10,2),
  effective_from       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  change_reason        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_comp_history_employee_time
  ON employee_compensation_history(employee_id, effective_from DESC);

-- ---------- 4. Sync trigger: keep employees.hourly_rate / cost_rate ----------
-- mirrors compensation values so existing time_logs.cost_amount trigger
-- (which reads employees.cost_rate at insert time) keeps working without
-- any code change on that side.

CREATE OR REPLACE FUNCTION trg_sync_employee_rates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE employees
     SET hourly_rate = COALESCE(NEW.sales_rate, NEW.hourly_wage),
         cost_rate   = COALESCE(NEW.internal_cost_rate, NEW.real_hourly_cost),
         updated_at  = NOW()
   WHERE id = NEW.employee_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_compensation_sync ON employee_compensation;
CREATE TRIGGER trg_employee_compensation_sync
  AFTER INSERT OR UPDATE ON employee_compensation
  FOR EACH ROW EXECUTE FUNCTION trg_sync_employee_rates();

-- ---------- 5. RLS: admin writes, self-read ----------
-- Drop the open Phase 7 policy and replace with role-aware ones.

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_compensation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_all_auth" ON employees;

-- Admin-or-self can read; admin-only can write.
CREATE POLICY "employees_select_admin_or_self" ON employees
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR profile_id = auth.uid()
  );

CREATE POLICY "employees_insert_admin" ON employees
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "employees_update_admin" ON employees
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "employees_delete_admin" ON employees
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "employee_compensation_select_admin_or_self" ON employee_compensation
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_compensation.employee_id AND e.profile_id = auth.uid())
  );

CREATE POLICY "employee_compensation_write_admin" ON employee_compensation
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "employee_compensation_history_select_admin" ON employee_compensation_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- service_role bypasses RLS; explicit grants for clarity.
GRANT ALL ON employees                       TO authenticated, service_role;
GRANT ALL ON employee_compensation           TO authenticated, service_role;
GRANT ALL ON employee_compensation_history   TO authenticated, service_role;

-- ---------- 6. updated_at triggers ----------
DROP TRIGGER IF EXISTS trg_employee_compensation_updated_at ON employee_compensation;
CREATE TRIGGER trg_employee_compensation_updated_at
  BEFORE UPDATE ON employee_compensation
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();
