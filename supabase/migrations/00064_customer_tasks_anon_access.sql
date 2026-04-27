-- =====================================================
-- 00064: Grant anon access to customer_tasks for portal
-- =====================================================

-- Portal uses createAnonClient() — needs SELECT, INSERT, UPDATE on customer_tasks
GRANT SELECT, INSERT, UPDATE ON customer_tasks TO anon;

-- RLS policy: anon can read/write tasks for portal customers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_tasks' AND policyname = 'Anon portal access customer tasks') THEN
    CREATE POLICY "Anon portal access customer tasks" ON customer_tasks FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
