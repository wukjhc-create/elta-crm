/**
 * Auto-setup API endpoint — creates missing database tables.
 *
 * Tries two methods:
 * 1. Supabase Management API (requires SUPABASE_ACCESS_TOKEN)
 * 2. Direct pg connection (requires DATABASE_URL)
 *
 * Usage: POST /api/admin/setup-db
 * Auth: Requires CRON_SECRET or authenticated admin
 */

import { NextResponse } from 'next/server'

const MIGRATIONS = [
  {
    name: '00051_sent_quotes',
    check_table: 'sent_quotes',
    sql: `
-- Sequence for quote reference numbers
CREATE SEQUENCE IF NOT EXISTS quote_ref_seq START 1;

-- Main table
CREATE TABLE IF NOT EXISTS sent_quotes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_reference text NOT NULL UNIQUE,
  template_type text NOT NULL CHECK (template_type IN ('sales', 'installation')),
  customer_email text NOT NULL,
  customer_name text,
  customer_company text,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  incoming_email_id uuid REFERENCES incoming_emails(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  solar_data jsonb,
  notes text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_percentage numeric(5,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_percentage numeric(5,2) NOT NULL DEFAULT 25,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  validity_days integer NOT NULL DEFAULT 30,
  valid_until date,
  pdf_storage_path text,
  pdf_public_url text,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sent_quotes_customer_email ON sent_quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_sent_quotes_customer_id ON sent_quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_sent_quotes_created_at ON sent_quotes(created_at DESC);

ALTER TABLE sent_quotes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sent_quotes' AND policyname = 'Authenticated users can view sent quotes') THEN
    CREATE POLICY "Authenticated users can view sent quotes" ON sent_quotes FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sent_quotes' AND policyname = 'Authenticated users can insert sent quotes') THEN
    CREATE POLICY "Authenticated users can insert sent quotes" ON sent_quotes FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sent_quotes' AND policyname = 'Service role full access sent quotes') THEN
    CREATE POLICY "Service role full access sent quotes" ON sent_quotes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT ON sent_quotes TO authenticated;
GRANT ALL ON sent_quotes TO service_role;
    `.trim(),
  },
  {
    name: '00052_customer_documents',
    check_table: 'customer_documents',
    sql: `
CREATE TABLE IF NOT EXISTS customer_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  document_type text NOT NULL DEFAULT 'quote' CHECK (document_type IN ('quote', 'invoice', 'contract', 'other')),
  file_url text NOT NULL,
  storage_path text,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  file_size integer,
  sent_quote_id uuid REFERENCES sent_quotes(id) ON DELETE SET NULL,
  offer_id uuid REFERENCES offers(id) ON DELETE SET NULL,
  shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON customer_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_created_at ON customer_documents(created_at DESC);

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_documents' AND policyname = 'Authenticated users can manage customer documents') THEN
    CREATE POLICY "Authenticated users can manage customer documents" ON customer_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_documents' AND policyname = 'Portal users can view their documents') THEN
    CREATE POLICY "Portal users can view their documents" ON customer_documents FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_documents' AND policyname = 'Service role full access customer documents') THEN
    CREATE POLICY "Service role full access customer documents" ON customer_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON customer_documents TO authenticated;
GRANT SELECT ON customer_documents TO anon;
GRANT ALL ON customer_documents TO service_role;
    `.trim(),
  },
  {
    name: '00053_customer_tasks',
    check_table: 'customer_tasks',
    sql: `
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

CREATE INDEX IF NOT EXISTS idx_customer_tasks_customer_id ON customer_tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tasks_assigned_to ON customer_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_customer_tasks_status ON customer_tasks(status);
CREATE INDEX IF NOT EXISTS idx_customer_tasks_due_date ON customer_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_customer_tasks_reminder_at ON customer_tasks(reminder_at)
  WHERE status != 'done' AND reminder_at IS NOT NULL;

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
    `.trim(),
  },
]

function getProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  // Extract project ref from https://abcdef.supabase.co
  const match = url.match(/https?:\/\/([^.]+)\.supabase\.co/)
  return match?.[1] || null
}

async function runSqlViaManagementApi(sql: string): Promise<{ success: boolean; error?: string }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const ref = getProjectRef()

  if (!token || !ref) {
    return { success: false, error: 'SUPABASE_ACCESS_TOKEN eller projekt-ref mangler' }
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { success: false, error: `Management API fejl (${res.status}): ${text}` }
  }

  return { success: true }
}

async function runSqlViaDatabaseUrl(sql: string): Promise<{ success: boolean; error?: string }> {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    return { success: false, error: 'DATABASE_URL mangler' }
  }

  try {
    // Dynamic import of postgres package (if installed)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const postgres = (await import(/* webpackIgnore: true */ 'postgres' as string)).default
    const sql_client = (postgres as any)(dbUrl, { max: 1 })
    await sql_client.unsafe(sql)
    await sql_client.end()
    return { success: true }
  } catch (e: any) {
    // If postgres package not installed
    if (e?.code === 'MODULE_NOT_FOUND' || e?.code === 'ERR_MODULE_NOT_FOUND') {
      return { success: false, error: 'postgres pakke er ikke installeret — brug SUPABASE_ACCESS_TOKEN i stedet' }
    }
    return { success: false, error: e?.message || 'Database fejl' }
  }
}

async function checkTableExists(tableName: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false

  const res = await fetch(`${url}/rest/v1/${tableName}?select=id&limit=1`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
  })

  // 200 = table exists, 404 or other = doesn't exist
  return res.ok
}

export async function POST(request: Request) {
  // Auth check
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Also allow if called from server-side (no auth needed for internal calls)
    const { headers } = request
    const isInternal = headers.get('x-internal-call') === 'true'
    if (!isInternal) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const results: { migration: string; status: string; error?: string }[] = []

  for (const migration of MIGRATIONS) {
    // Check if table already exists
    const exists = await checkTableExists(migration.check_table)
    if (exists) {
      results.push({ migration: migration.name, status: 'already_exists' })
      continue
    }

    // Try Management API first
    let result = await runSqlViaManagementApi(migration.sql)

    // Fall back to direct database connection
    if (!result.success) {
      result = await runSqlViaDatabaseUrl(migration.sql)
    }

    results.push({
      migration: migration.name,
      status: result.success ? 'created' : 'failed',
      error: result.error,
    })
  }

  // Also try to reload PostgREST schema cache
  const ref = getProjectRef()
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (ref && token) {
    try {
      await fetch(`https://api.supabase.com/v1/projects/${ref}/pgsodium`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      })
    } catch {
      // Non-critical
    }
  }

  const allOk = results.every((r) => r.status === 'already_exists' || r.status === 'created')

  return NextResponse.json({
    success: allOk,
    results,
    hint: allOk
      ? 'Alle tabeller er klar!'
      : 'Tilføj SUPABASE_ACCESS_TOKEN (fra supabase.com/dashboard/account/tokens) eller DATABASE_URL til env vars for auto-setup.',
  })
}

// Allow GET for easy browser testing
export async function GET(request: Request) {
  // Check tables only (no modifications)
  const tables = ['sent_quotes', 'customer_documents', 'customer_tasks']
  const status: Record<string, boolean> = {}

  for (const table of tables) {
    status[table] = await checkTableExists(table)
  }

  return NextResponse.json({ tables: status })
}
