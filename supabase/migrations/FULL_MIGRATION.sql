-- =====================================================
-- COMPLETE DATABASE MIGRATION FOR ELTA CRM
-- Run this entire file in Supabase SQL Editor
-- =====================================================

-- STEP 1: Extensions and Types
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'user', 'technician');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_source AS ENUM ('website', 'referral', 'email', 'phone', 'social', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE offer_status AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE project_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE message_status AS ENUM ('unread', 'read', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM ('email', 'sms', 'internal', 'note');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 2: Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'user',
  phone TEXT,
  department TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- STEP 3: Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status lead_status NOT NULL DEFAULT 'new',
  source lead_source NOT NULL DEFAULT 'other',
  value DECIMAL(12, 2),
  probability INTEGER CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_company_name ON leads(company_name);

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_performed_by ON lead_activities(performed_by);

-- STEP 4: Customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_number TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  mobile TEXT,
  website TEXT,
  vat_number TEXT,
  billing_address TEXT,
  billing_city TEXT,
  billing_postal_code TEXT,
  billing_country TEXT DEFAULT 'Danmark',
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_postal_code TEXT,
  shipping_country TEXT DEFAULT 'Danmark',
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_customer_number ON customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_name);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_is_primary ON customer_contacts(is_primary);

DROP TRIGGER IF EXISTS update_customer_contacts_updated_at ON customer_contacts;
CREATE TRIGGER update_customer_contacts_updated_at
  BEFORE UPDATE ON customer_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  new_number TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(customer_number FROM 2) AS INTEGER)), 0) + 1
  INTO next_num
  FROM customers
  WHERE customer_number ~ '^C[0-9]+$';
  new_number := 'C' || LPAD(next_num::TEXT, 6, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- STEP 5: Offers
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status offer_status NOT NULL DEFAULT 'draft',
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  tax_percentage DECIMAL(5, 2) DEFAULT 25.0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  final_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'DKK',
  valid_until DATE,
  terms_and_conditions TEXT,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offers_customer_id ON offers(customer_id);
CREATE INDEX IF NOT EXISTS idx_offers_lead_id ON offers(lead_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_offer_number ON offers(offer_number);
CREATE INDEX IF NOT EXISTS idx_offers_created_by ON offers(created_by);

DROP TRIGGER IF EXISTS update_offers_updated_at ON offers;
CREATE TRIGGER update_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS offer_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'stk',
  unit_price DECIMAL(12, 2) NOT NULL,
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_line_items_offer_id ON offer_line_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_line_items_position ON offer_line_items(offer_id, position);

CREATE OR REPLACE FUNCTION generate_offer_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  new_number TEXT;
  current_year TEXT;
BEGIN
  current_year := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(offer_number FROM 10) AS INTEGER)), 0) + 1
  INTO next_num
  FROM offers
  WHERE offer_number LIKE 'TILBUD-' || current_year || '-%';
  new_number := 'TILBUD-' || current_year || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_line_item_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total = NEW.quantity * NEW.unit_price * (1 - NEW.discount_percentage / 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_line_item_total_trigger ON offer_line_items;
CREATE TRIGGER calculate_line_item_total_trigger
  BEFORE INSERT OR UPDATE ON offer_line_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_line_item_total();

CREATE OR REPLACE FUNCTION update_offer_totals()
RETURNS TRIGGER AS $$
DECLARE
  offer_total DECIMAL(12, 2);
  offer_record RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO offer_record FROM offers WHERE id = OLD.offer_id;
  ELSE
    SELECT * INTO offer_record FROM offers WHERE id = NEW.offer_id;
  END IF;
  SELECT COALESCE(SUM(total), 0) INTO offer_total FROM offer_line_items WHERE offer_id = offer_record.id;
  UPDATE offers SET
    total_amount = offer_total,
    discount_amount = offer_total * (discount_percentage / 100),
    tax_amount = (offer_total - (offer_total * discount_percentage / 100)) * (tax_percentage / 100),
    final_amount = (offer_total - (offer_total * discount_percentage / 100)) + ((offer_total - (offer_total * discount_percentage / 100)) * (tax_percentage / 100))
  WHERE id = offer_record.id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_offer_totals_trigger ON offer_line_items;
CREATE TRIGGER update_offer_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON offer_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_offer_totals();

-- STEP 6: Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status project_status NOT NULL DEFAULT 'planning',
  priority project_priority NOT NULL DEFAULT 'medium',
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  estimated_hours DECIMAL(10, 2),
  actual_hours DECIMAL(10, 2) DEFAULT 0,
  budget DECIMAL(12, 2),
  actual_cost DECIMAL(12, 2) DEFAULT 0,
  project_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_technicians UUID[] DEFAULT '{}',
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority);
CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id ON projects(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_project_number ON projects(project_number);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority project_priority NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  estimated_hours DECIMAL(10, 2),
  actual_hours DECIMAL(10, 2) DEFAULT 0,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  position INTEGER,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_to ON project_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_due_date ON project_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_project_tasks_position ON project_tasks(project_id, position);

DROP TRIGGER IF EXISTS update_project_tasks_updated_at ON project_tasks;
CREATE TRIGGER update_project_tasks_updated_at
  BEFORE UPDATE ON project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT,
  hours DECIMAL(10, 2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  billable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date DESC);

DROP TRIGGER IF EXISTS update_time_entries_updated_at ON time_entries;
CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION generate_project_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  new_number TEXT;
  current_year TEXT;
BEGIN
  current_year := TO_CHAR(NOW(), 'YY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(project_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_num
  FROM projects
  WHERE project_number LIKE 'P' || current_year || '%';
  new_number := 'P' || current_year || LPAD(next_num::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_project_actual_hours()
RETURNS TRIGGER AS $$
DECLARE
  project_total_hours DECIMAL(10, 2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(SUM(hours), 0) INTO project_total_hours FROM time_entries WHERE project_id = OLD.project_id;
    UPDATE projects SET actual_hours = project_total_hours WHERE id = OLD.project_id;
    RETURN OLD;
  ELSE
    SELECT COALESCE(SUM(hours), 0) INTO project_total_hours FROM time_entries WHERE project_id = NEW.project_id;
    UPDATE projects SET actual_hours = project_total_hours WHERE id = NEW.project_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_project_actual_hours_trigger ON time_entries;
CREATE TRIGGER update_project_actual_hours_trigger
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_project_actual_hours();

CREATE OR REPLACE FUNCTION update_task_actual_hours()
RETURNS TRIGGER AS $$
DECLARE
  task_total_hours DECIMAL(10, 2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.task_id IS NOT NULL THEN
      SELECT COALESCE(SUM(hours), 0) INTO task_total_hours FROM time_entries WHERE task_id = OLD.task_id;
      UPDATE project_tasks SET actual_hours = task_total_hours WHERE id = OLD.task_id;
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.task_id IS NOT NULL THEN
      SELECT COALESCE(SUM(hours), 0) INTO task_total_hours FROM time_entries WHERE task_id = NEW.task_id;
      UPDATE project_tasks SET actual_hours = task_total_hours WHERE id = NEW.task_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_task_actual_hours_trigger ON time_entries;
CREATE TRIGGER update_task_actual_hours_trigger
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_task_actual_hours();

-- STEP 7: Messages (after customers and projects exist)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  message_type message_type NOT NULL DEFAULT 'internal',
  status message_status NOT NULL DEFAULT 'unread',
  from_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  from_email TEXT,
  from_name TEXT,
  to_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  to_email TEXT,
  cc TEXT[],
  bcc TEXT[],
  reply_to UUID REFERENCES messages(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]',
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_to_user_id ON messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_from_user_id ON messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_customer_id ON messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to);

CREATE OR REPLACE FUNCTION update_message_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.read_at IS NOT NULL AND OLD.read_at IS NULL THEN
    NEW.status = 'read';
  END IF;
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    NEW.status = 'archived';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_message_status_trigger ON messages;
CREATE TRIGGER update_message_status_trigger
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_message_status();

-- STEP 8: Calculator Templates
CREATE TABLE IF NOT EXISTS calculator_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calculator_templates_created_by ON calculator_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_calculator_templates_is_default ON calculator_templates(is_default);

DROP TRIGGER IF EXISTS update_calculator_templates_updated_at ON calculator_templates;
CREATE TRIGGER update_calculator_templates_updated_at
  BEFORE UPDATE ON calculator_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- STEP 9: Portal Tables
CREATE TABLE IF NOT EXISTS portal_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_customer_id ON portal_access_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_token ON portal_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_email ON portal_access_tokens(email);
CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_is_active ON portal_access_tokens(is_active);

CREATE TABLE IF NOT EXISTS portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'employee')),
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sender_name TEXT,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_messages_customer_id ON portal_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_messages_offer_id ON portal_messages(offer_id);
CREATE INDEX IF NOT EXISTS idx_portal_messages_sender_type ON portal_messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_portal_messages_created_at ON portal_messages(created_at DESC);

CREATE TABLE IF NOT EXISTS offer_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_ip TEXT,
  signature_data TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(offer_id)
);

CREATE INDEX IF NOT EXISTS idx_offer_signatures_offer_id ON offer_signatures(offer_id);

-- STEP 10: Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculator_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_signatures ENABLE ROW LEVEL SECURITY;

-- STEP 11: RLS Policies

-- Profiles
DROP POLICY IF EXISTS "Users can view all active profiles" ON profiles;
CREATE POLICY "Users can view all active profiles" ON profiles FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Leads
DROP POLICY IF EXISTS "Users can view leads" ON leads;
CREATE POLICY "Users can view leads" ON leads FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create leads" ON leads;
CREATE POLICY "Users can create leads" ON leads FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can update leads" ON leads;
CREATE POLICY "Users can update leads" ON leads FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can delete leads" ON leads;
CREATE POLICY "Users can delete leads" ON leads FOR DELETE TO authenticated USING (true);

-- Lead Activities
DROP POLICY IF EXISTS "Users can view lead activities" ON lead_activities;
CREATE POLICY "Users can view lead activities" ON lead_activities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create lead activities" ON lead_activities;
CREATE POLICY "Users can create lead activities" ON lead_activities FOR INSERT TO authenticated WITH CHECK (true);

-- Messages
DROP POLICY IF EXISTS "Users can view messages" ON messages;
CREATE POLICY "Users can view messages" ON messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages FOR INSERT TO authenticated WITH CHECK (from_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update messages" ON messages;
CREATE POLICY "Users can update messages" ON messages FOR UPDATE TO authenticated USING (to_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete messages" ON messages;
CREATE POLICY "Users can delete messages" ON messages FOR DELETE TO authenticated USING (true);

-- Offers
DROP POLICY IF EXISTS "Users can view offers" ON offers;
CREATE POLICY "Users can view offers" ON offers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create offers" ON offers;
CREATE POLICY "Users can create offers" ON offers FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can update offers" ON offers;
CREATE POLICY "Users can update offers" ON offers FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can delete offers" ON offers;
CREATE POLICY "Users can delete offers" ON offers FOR DELETE TO authenticated USING (true);

-- Offer Line Items
DROP POLICY IF EXISTS "Users can manage line items" ON offer_line_items;
CREATE POLICY "Users can manage line items" ON offer_line_items FOR ALL TO authenticated USING (true);

-- Customers
DROP POLICY IF EXISTS "Users can view customers" ON customers;
CREATE POLICY "Users can view customers" ON customers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create customers" ON customers;
CREATE POLICY "Users can create customers" ON customers FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can update customers" ON customers;
CREATE POLICY "Users can update customers" ON customers FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can delete customers" ON customers;
CREATE POLICY "Users can delete customers" ON customers FOR DELETE TO authenticated USING (true);

-- Customer Contacts
DROP POLICY IF EXISTS "Users can manage customer contacts" ON customer_contacts;
CREATE POLICY "Users can manage customer contacts" ON customer_contacts FOR ALL TO authenticated USING (true);

-- Projects
DROP POLICY IF EXISTS "Users can view projects" ON projects;
CREATE POLICY "Users can view projects" ON projects FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create projects" ON projects;
CREATE POLICY "Users can create projects" ON projects FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update projects" ON projects;
CREATE POLICY "Users can update projects" ON projects FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can delete projects" ON projects;
CREATE POLICY "Users can delete projects" ON projects FOR DELETE TO authenticated USING (true);

-- Project Tasks
DROP POLICY IF EXISTS "Users can manage project tasks" ON project_tasks;
CREATE POLICY "Users can manage project tasks" ON project_tasks FOR ALL TO authenticated USING (true);

-- Time Entries
DROP POLICY IF EXISTS "Users can manage time entries" ON time_entries;
CREATE POLICY "Users can manage time entries" ON time_entries FOR ALL TO authenticated USING (true);

-- Calculator Templates
DROP POLICY IF EXISTS "Users can view all templates" ON calculator_templates;
CREATE POLICY "Users can view all templates" ON calculator_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create templates" ON calculator_templates;
CREATE POLICY "Users can create templates" ON calculator_templates FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update templates" ON calculator_templates;
CREATE POLICY "Users can update templates" ON calculator_templates FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can delete templates" ON calculator_templates;
CREATE POLICY "Users can delete templates" ON calculator_templates FOR DELETE TO authenticated USING (true);

-- Portal Access Tokens
DROP POLICY IF EXISTS "Employees can view portal tokens" ON portal_access_tokens;
CREATE POLICY "Employees can view portal tokens" ON portal_access_tokens FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Employees can create portal tokens" ON portal_access_tokens;
CREATE POLICY "Employees can create portal tokens" ON portal_access_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Employees can update portal tokens" ON portal_access_tokens;
CREATE POLICY "Employees can update portal tokens" ON portal_access_tokens FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Employees can delete portal tokens" ON portal_access_tokens;
CREATE POLICY "Employees can delete portal tokens" ON portal_access_tokens FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can validate tokens" ON portal_access_tokens;
CREATE POLICY "Anyone can validate tokens" ON portal_access_tokens FOR SELECT TO anon USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Portal Messages
DROP POLICY IF EXISTS "Employees can view portal messages" ON portal_messages;
CREATE POLICY "Employees can view portal messages" ON portal_messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Employees can create portal messages" ON portal_messages;
CREATE POLICY "Employees can create portal messages" ON portal_messages FOR INSERT TO authenticated WITH CHECK (sender_type = 'employee' AND sender_id = auth.uid());

DROP POLICY IF EXISTS "Employees can update portal messages" ON portal_messages;
CREATE POLICY "Employees can update portal messages" ON portal_messages FOR UPDATE TO authenticated USING (sender_type = 'employee' AND sender_id = auth.uid());

DROP POLICY IF EXISTS "Portal users can view their messages" ON portal_messages;
CREATE POLICY "Portal users can view their messages" ON portal_messages FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Portal users can create messages" ON portal_messages;
CREATE POLICY "Portal users can create messages" ON portal_messages FOR INSERT TO anon WITH CHECK (sender_type = 'customer');

-- Offer Signatures
DROP POLICY IF EXISTS "Employees can view signatures" ON offer_signatures;
CREATE POLICY "Employees can view signatures" ON offer_signatures FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can create signatures" ON offer_signatures;
CREATE POLICY "Anyone can create signatures" ON offer_signatures FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can create signatures" ON offer_signatures;
CREATE POLICY "Authenticated can create signatures" ON offer_signatures FOR INSERT TO authenticated WITH CHECK (true);

-- STEP 12: Grant permissions
GRANT SELECT ON portal_access_tokens TO anon;
GRANT SELECT, INSERT ON portal_messages TO anon;
GRANT SELECT, INSERT ON offer_signatures TO anon;

GRANT ALL ON portal_access_tokens TO authenticated;
GRANT ALL ON portal_messages TO authenticated;
GRANT ALL ON offer_signatures TO authenticated;

-- DONE!
SELECT 'Migration completed successfully!' as status;
