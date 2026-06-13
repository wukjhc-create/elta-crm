-- =====================================================================
-- 00140: Sprint Ø2.4 + Ø2.6 — medarbejdertype + flere overtidssatser
-- =====================================================================
--
-- FORMÅL
--   Ø2.4: ansættelsestype pr. medarbejder (timelønnet/funktionær/lærling/
--         ekstern).
--   Ø2.6: flere overtidssatser pr. medarbejder (Normal/OT50/OT100/Weekend/
--         Helligdag/Rådighed), hver med navn, kode, multiplikator, kost- og
--         salgspris, aktiv-flag og sortering.
--
-- SCOPE / GARANTIER
--   - ADDITIV. employees.employment_type tilføjes (nullable, CHECK), ingen
--     eksisterende rækker ændres (forbliver NULL = "ikke angivet").
--   - NY tabel employee_overtime_rates. Eksisterende
--     employee_compensation.overtime_rate RØRES IKKE (legacy/fallback bevares).
--   - INGEN ændring af time_logs eller dens kost-/salgsberegning. Satserne
--     er endnu IKKE wired ind i timeregistrering — kun datamodel + admin.
--   - RLS spejler employee_compensation (admin-or-self read, admin write).
--
-- ROLLBACK
--   DROP TABLE IF EXISTS employee_overtime_rates;
--   ALTER TABLE employees DROP COLUMN IF EXISTS employment_type;
--   NOTIFY pgrst, 'reload schema';
-- =====================================================================

BEGIN;

-- ---------- Ø2.4: medarbejdertype ----------
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_employment_type_chk'
  ) THEN
    ALTER TABLE employees ADD CONSTRAINT employees_employment_type_chk
      CHECK (employment_type IS NULL OR employment_type IN
        ('timelønnet','funktionær','lærling','ekstern'));
  END IF;
END $$;

COMMENT ON COLUMN employees.employment_type IS
  'Ansættelsestype: timelønnet|funktionær|lærling|ekstern. NULL = ikke angivet. Påvirker ikke autorisation.';

-- ---------- Ø2.6: overtidssatser ----------
CREATE TABLE IF NOT EXISTS employee_overtime_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text NOT NULL,
  multiplier  numeric(6,3) NOT NULL DEFAULT 1.0,
  cost_rate   numeric(10,2),
  sale_rate   numeric(10,2),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, code)
);

CREATE INDEX IF NOT EXISTS idx_eot_rates_employee ON employee_overtime_rates(employee_id);

ALTER TABLE employee_overtime_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eot_select_admin_or_self" ON employee_overtime_rates;
CREATE POLICY "eot_select_admin_or_self" ON employee_overtime_rates
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_overtime_rates.employee_id AND e.profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "eot_write_admin" ON employee_overtime_rates;
CREATE POLICY "eot_write_admin" ON employee_overtime_rates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

GRANT ALL ON employee_overtime_rates TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_eot_rates_updated_at ON employee_overtime_rates;
CREATE TRIGGER trg_eot_rates_updated_at
  BEFORE UPDATE ON employee_overtime_rates
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();

NOTIFY pgrst, 'reload schema';

COMMIT;
