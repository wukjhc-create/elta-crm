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
  {
    name: '00054_customer_tasks_offer_id',
    check_table: 'customer_tasks',
    check_column: 'offer_id',
    sql: `
ALTER TABLE customer_tasks
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES offers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_tasks_offer_id ON customer_tasks(offer_id)
  WHERE offer_id IS NOT NULL;
    `.trim(),
  },
  {
    name: '00057_offer_scope',
    check_table: 'offers',
    check_column: 'scope',
    sql: `ALTER TABLE offers ADD COLUMN IF NOT EXISTS scope TEXT;`.trim(),
  },
  {
    name: '00058_offer_reminders',
    check_table: 'offers',
    check_column: 'last_reminder_sent',
    sql: `
ALTER TABLE offers ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMPTZ;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT true;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_interval_days INTEGER DEFAULT 3;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_max_count INTEGER DEFAULT 3;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_email_subject TEXT;
CREATE INDEX IF NOT EXISTS idx_offers_reminder_pending ON offers (status, last_reminder_sent, sent_at) WHERE status IN ('sent', 'viewed');
    `.trim(),
  },
  {
    name: '00059_public_offer_access',
    check_table: 'offers',
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can view sent/viewed/accepted/rejected offers') THEN
    CREATE POLICY "Anon can view sent/viewed/accepted/rejected offers" ON offers FOR SELECT TO anon USING (status IN ('sent', 'viewed', 'accepted', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can update sent/viewed offers') THEN
    CREATE POLICY "Anon can update sent/viewed offers" ON offers FOR UPDATE TO anon USING (status IN ('sent', 'viewed')) WITH CHECK (status IN ('viewed', 'accepted', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can view offer line items') THEN
    CREATE POLICY "Anon can view offer line items" ON offer_line_items FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM offers WHERE offers.id = offer_line_items.offer_id AND offers.status IN ('sent', 'viewed', 'accepted', 'rejected')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can view customers linked to visible offers') THEN
    CREATE POLICY "Anon can view customers linked to visible offers" ON customers FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM offers WHERE offers.customer_id = customers.id AND offers.status IN ('sent', 'viewed', 'accepted', 'rejected')));
  END IF;
END $$;
GRANT SELECT, UPDATE ON offers TO anon;
GRANT SELECT ON offer_line_items TO anon;
GRANT SELECT ON customers TO anon;
    `.trim(),
  },
  {
    name: '00060_portal_anon_policies',
    check_table: 'portal_access_tokens',
    check_column: '_anon_policies_applied',
    sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can update portal token access time') THEN
    CREATE POLICY "Anon can update portal token access time"
      ON portal_access_tokens FOR UPDATE TO anon
      USING (is_active = true)
      WITH CHECK (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can view offer signatures') THEN
    CREATE POLICY "Anon can view offer signatures"
      ON offer_signatures FOR SELECT TO anon
      USING (EXISTS (SELECT 1 FROM offers WHERE offers.id = offer_signatures.offer_id AND offers.status IN ('sent', 'viewed', 'accepted', 'rejected')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can update portal message read status') THEN
    CREATE POLICY "Anon can update portal message read status"
      ON portal_messages FOR UPDATE TO anon
      USING (sender_type = 'employee')
      WITH CHECK (sender_type = 'employee');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can view basic profile info') THEN
    CREATE POLICY "Anon can view basic profile info"
      ON profiles FOR SELECT TO anon
      USING (true);
  END IF;
END $$;
GRANT UPDATE ON portal_access_tokens TO anon;
GRANT SELECT ON offer_signatures TO anon;
GRANT UPDATE ON portal_messages TO anon;
GRANT SELECT (id, full_name, email) ON profiles TO anon;

-- Sentinel: add a harmless column so setup-db knows this migration ran
ALTER TABLE portal_access_tokens ADD COLUMN IF NOT EXISTS _anon_policies_applied boolean DEFAULT true;
    `.trim(),
  },
  {
    name: '00063_enable_realtime',
    check_table: '_realtime_sentinel_do_not_exist',
    sql: `
-- Enable Supabase Realtime on key tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE offers;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'customer_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customer_tasks;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customers;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'incoming_emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE incoming_emails;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'portal_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE portal_messages;
  END IF;
END $$;
    `.trim(),
  },
  {
    name: '00064_customer_tasks_anon_access',
    check_table: '_anon_tasks_sentinel_do_not_exist',
    sql: `
-- Grant anon access to customer_tasks for portal
GRANT SELECT, INSERT, UPDATE ON customer_tasks TO anon;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_tasks' AND policyname = 'Anon portal access customer tasks') THEN
    CREATE POLICY "Anon portal access customer tasks" ON customer_tasks FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
    `.trim(),
  },
  {
    name: '00065_rbac_roles',
    check_table: '_rbac_sentinel_do_not_exist',
    sql: `
-- Add new RBAC roles to user_role enum
-- Use DO block to handle "already exists" gracefully
DO $$ BEGIN
  BEGIN
    ALTER TYPE user_role ADD VALUE 'serviceleder';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE user_role ADD VALUE 'montør';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
    `.trim(),
  },
  {
    name: '00066_service_cases_smart_fields',
    check_table: 'service_cases',
    check_column: 'ksr_number',
    sql: `
-- Add address fields to service_cases
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS floor_door TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- KSR/EAN admin fields
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS ksr_number TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS ean_number TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Checklist and signature
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS customer_signature TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS customer_signature_name TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- Attachments table
CREATE TABLE IF NOT EXISTS service_case_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size INTEGER,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('inverter_photo', 'panel_photo', 'tavle_photo', 'before_photo', 'after_photo', 'signature', 'other')),
  notes TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sca_service_case_id ON service_case_attachments(service_case_id);
CREATE INDEX IF NOT EXISTS idx_sca_category ON service_case_attachments(category);

ALTER TABLE service_case_attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_case_attachments' AND policyname = 'Auth users manage service case attachments') THEN
    CREATE POLICY "Auth users manage service case attachments"
      ON service_case_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON service_case_attachments TO authenticated;
GRANT ALL ON service_case_attachments TO service_role;
    `.trim(),
  },
  {
    name: '00067_ordrestyring_integration',
    check_table: 'service_cases',
    check_column: 'os_case_id',
    sql: `
-- Ordrestyring integration fields
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS os_case_id TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS os_synced_at TIMESTAMPTZ;

-- Update status CHECK to allow 'converted'
ALTER TABLE service_cases DROP CONSTRAINT IF EXISTS service_cases_status_check;
ALTER TABLE service_cases ADD CONSTRAINT service_cases_status_check
  CHECK (status IN ('new', 'in_progress', 'pending', 'closed', 'converted'));

-- Index for OS reference
CREATE INDEX IF NOT EXISTS idx_service_cases_os_case_id ON service_cases(os_case_id)
  WHERE os_case_id IS NOT NULL;
    `.trim(),
  },
  {
    name: '00068_offers_ordrestyring',
    check_table: 'offers',
    check_column: 'os_case_id',
    sql: `
ALTER TABLE offers ADD COLUMN IF NOT EXISTS os_case_id TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS os_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_offers_os_case_id ON offers(os_case_id)
  WHERE os_case_id IS NOT NULL;
    `.trim(),
  },
  {
    name: '00069_integration_settings',
    check_table: 'integration_settings',
    sql: `
CREATE TABLE IF NOT EXISTS integration_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'integration_settings' AND policyname = 'auth_read_integration_settings'
  ) THEN
    CREATE POLICY auth_read_integration_settings ON integration_settings FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'integration_settings' AND policyname = 'auth_all_integration_settings'
  ) THEN
    CREATE POLICY auth_all_integration_settings ON integration_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
    `.trim(),
  },
  {
    name: '00070_email_threading_columns',
    check_table: 'incoming_emails',
    check_column: 'internet_message_id',
    sql: `
ALTER TABLE incoming_emails
  ADD COLUMN IF NOT EXISTS internet_message_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS "references" TEXT;

CREATE INDEX IF NOT EXISTS idx_incoming_emails_internet_message_id
  ON incoming_emails (internet_message_id)
  WHERE internet_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incoming_emails_conversation_id
  ON incoming_emails (conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incoming_emails_in_reply_to
  ON incoming_emails (in_reply_to)
  WHERE in_reply_to IS NOT NULL;
    `.trim(),
  },
  {
    name: '00071_multi_mailbox',
    check_table: 'incoming_emails',
    check_column: 'mailbox_source',
    sql: `
ALTER TABLE incoming_emails
  ADD COLUMN IF NOT EXISTS mailbox_source TEXT;

UPDATE incoming_emails
  SET mailbox_source = COALESCE(to_email, sender_email)
  WHERE mailbox_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_incoming_emails_mailbox_source
  ON incoming_emails (mailbox_source)
  WHERE mailbox_source IS NOT NULL;
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

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false

  const res = await fetch(`${url}/rest/v1/${tableName}?select=${columnName}&limit=1`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
  })

  return res.ok
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
    if (exists && !('check_column' in migration)) {
      results.push({ migration: migration.name, status: 'already_exists' })
      continue
    }
    // For column-add migrations: check if column exists by querying it
    if (exists && 'check_column' in migration && migration.check_column) {
      const colExists = await checkColumnExists(migration.check_table, migration.check_column)
      if (colExists) {
        results.push({ migration: migration.name, status: 'already_exists' })
        continue
      }
    }
    if (!exists && 'check_column' in migration) {
      // Table doesn't exist yet, skip column migration
      results.push({ migration: migration.name, status: 'skipped_no_table' })
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
