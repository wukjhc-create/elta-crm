-- =====================================================
-- MIGRATION 00007: Row Level Security (RLS) Policies
-- Description: Security policies for all tables
-- =====================================================

-- Enable RLS on all tables
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

-- =====================================================
-- Profiles Policies
-- =====================================================

CREATE POLICY "Users can view all active profiles"
  ON profiles FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can do everything on profiles"
  ON profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Leads Policies
-- =====================================================

CREATE POLICY "Users can view leads assigned to them or created by them"
  ON leads FOR SELECT
  USING (
    assigned_to = auth.uid() OR
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can create leads"
  ON leads FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update leads assigned to them"
  ON leads FOR UPDATE
  USING (
    assigned_to = auth.uid() OR
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete leads"
  ON leads FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Lead Activities Policies
-- =====================================================

CREATE POLICY "Users can view activities for their leads"
  ON lead_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE id = lead_activities.lead_id AND (
        assigned_to = auth.uid() OR
        created_by = auth.uid()
      )
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can create activities for their leads"
  ON lead_activities FOR INSERT
  WITH CHECK (
    performed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM leads
      WHERE id = lead_activities.lead_id AND (
        assigned_to = auth.uid() OR
        created_by = auth.uid()
      )
    )
  );

-- =====================================================
-- Messages Policies
-- =====================================================

CREATE POLICY "Users can view their messages"
  ON messages FOR SELECT
  USING (
    to_user_id = auth.uid() OR
    from_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "Users can update their received messages"
  ON messages FOR UPDATE
  USING (to_user_id = auth.uid());

CREATE POLICY "Admins can delete messages"
  ON messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Offers Policies
-- =====================================================

CREATE POLICY "Users can view offers they created or for their leads/customers"
  ON offers FOR SELECT
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM leads
      WHERE id = offers.lead_id AND assigned_to = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can create offers"
  ON offers FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their offers"
  ON offers FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete offers"
  ON offers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Offer Line Items Policies
-- =====================================================

CREATE POLICY "Users can view line items for offers they can view"
  ON offer_line_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE id = offer_line_items.offer_id AND (
        created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Users can manage line items for their offers"
  ON offer_line_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE id = offer_line_items.offer_id AND created_by = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Customers Policies
-- =====================================================

CREATE POLICY "All authenticated users can view active customers"
  ON customers FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can create customers"
  ON customers FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users and admins can update customers"
  ON customers FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete customers"
  ON customers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Customer Contacts Policies
-- =====================================================

CREATE POLICY "Users can view contacts for customers they can view"
  ON customer_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE id = customer_contacts.customer_id AND is_active = true
    )
  );

CREATE POLICY "Users can manage customer contacts"
  ON customer_contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE id = customer_contacts.customer_id
    )
  );

-- =====================================================
-- Projects Policies
-- =====================================================

CREATE POLICY "Users can view projects they're involved in"
  ON projects FOR SELECT
  USING (
    project_manager_id = auth.uid() OR
    auth.uid() = ANY(assigned_technicians) OR
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Project managers and admins can create projects"
  ON projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'user')
    )
  );

CREATE POLICY "Project managers and admins can update projects"
  ON projects FOR UPDATE
  USING (
    project_manager_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete projects"
  ON projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Project Tasks Policies
-- =====================================================

CREATE POLICY "Users can view tasks for projects they're involved in"
  ON project_tasks FOR SELECT
  USING (
    assigned_to = auth.uid() OR
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_tasks.project_id AND (
        project_manager_id = auth.uid() OR
        auth.uid() = ANY(assigned_technicians)
      )
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Project members can manage tasks"
  ON project_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE id = project_tasks.project_id AND (
        project_manager_id = auth.uid() OR
        auth.uid() = ANY(assigned_technicians) OR
        created_by = auth.uid()
      )
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Time Entries Policies
-- =====================================================

CREATE POLICY "Users can view their own time entries"
  ON time_entries FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM projects
      WHERE id = time_entries.project_id AND project_manager_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can create their own time entries"
  ON time_entries FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own time entries"
  ON time_entries FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins and project managers can delete time entries"
  ON time_entries FOR DELETE
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM projects
      WHERE id = time_entries.project_id AND project_manager_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
