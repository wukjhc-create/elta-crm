-- =====================================================
-- 00053: Customer Tasks (Opgaver knyttet til kunder)
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date timestamptz,
  reminder_at timestamptz,
  snoozed_until timestamptz,
  completed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_tasks_customer_id ON customer_tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tasks_assigned_to ON customer_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_customer_tasks_status ON customer_tasks(status);
CREATE INDEX IF NOT EXISTS idx_customer_tasks_due_date ON customer_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_customer_tasks_reminder_at ON customer_tasks(reminder_at)
  WHERE status != 'done' AND reminder_at IS NOT NULL;

-- RLS
ALTER TABLE customer_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_tasks' AND policyname = 'Authenticated users can manage customer tasks') THEN
    CREATE POLICY "Authenticated users can manage customer tasks" ON customer_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_tasks' AND policyname = 'Service role full access customer tasks') THEN
    CREATE POLICY "Service role full access customer tasks" ON customer_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON customer_tasks TO authenticated;
GRANT ALL ON customer_tasks TO service_role;
