-- =====================================================
-- MIGRATION 00006: Projects Module
-- Description: Tables for project management, tasks, and time tracking
-- =====================================================

-- Projects table
CREATE TABLE projects (
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

-- Create indexes for better query performance
CREATE INDEX idx_projects_customer_id ON projects(customer_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_priority ON projects(priority);
CREATE INDEX idx_projects_project_manager_id ON projects(project_manager_id);
CREATE INDEX idx_projects_project_number ON projects(project_number);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Project tasks
CREATE TABLE project_tasks (
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

-- Create indexes for project tasks
CREATE INDEX idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX idx_project_tasks_assigned_to ON project_tasks(assigned_to);
CREATE INDEX idx_project_tasks_status ON project_tasks(status);
CREATE INDEX idx_project_tasks_due_date ON project_tasks(due_date);
CREATE INDEX idx_project_tasks_position ON project_tasks(project_id, position);

-- Trigger to auto-update updated_at for tasks
CREATE TRIGGER update_project_tasks_updated_at
  BEFORE UPDATE ON project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Time tracking
CREATE TABLE time_entries (
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

-- Create indexes for time entries
CREATE INDEX idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX idx_time_entries_task_id ON time_entries(task_id);
CREATE INDEX idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX idx_time_entries_date ON time_entries(date DESC);

-- Trigger to auto-update updated_at for time entries
CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to generate next project number
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

-- Function to update project actual hours when time entries change
CREATE OR REPLACE FUNCTION update_project_actual_hours()
RETURNS TRIGGER AS $$
DECLARE
  project_total_hours DECIMAL(10, 2);
BEGIN
  -- Get the project_id
  IF TG_OP = 'DELETE' THEN
    -- Calculate total hours for the project
    SELECT COALESCE(SUM(hours), 0)
    INTO project_total_hours
    FROM time_entries
    WHERE project_id = OLD.project_id;

    -- Update the project
    UPDATE projects
    SET actual_hours = project_total_hours
    WHERE id = OLD.project_id;

    RETURN OLD;
  ELSE
    -- Calculate total hours for the project
    SELECT COALESCE(SUM(hours), 0)
    INTO project_total_hours
    FROM time_entries
    WHERE project_id = NEW.project_id;

    -- Update the project
    UPDATE projects
    SET actual_hours = project_total_hours
    WHERE id = NEW.project_id;

    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update project actual hours
CREATE TRIGGER update_project_actual_hours_trigger
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_project_actual_hours();

-- Function to update task actual hours when time entries change
CREATE OR REPLACE FUNCTION update_task_actual_hours()
RETURNS TRIGGER AS $$
DECLARE
  task_total_hours DECIMAL(10, 2);
BEGIN
  -- Get the task_id (skip if no task)
  IF TG_OP = 'DELETE' THEN
    IF OLD.task_id IS NOT NULL THEN
      SELECT COALESCE(SUM(hours), 0)
      INTO task_total_hours
      FROM time_entries
      WHERE task_id = OLD.task_id;

      UPDATE project_tasks
      SET actual_hours = task_total_hours
      WHERE id = OLD.task_id;
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.task_id IS NOT NULL THEN
      SELECT COALESCE(SUM(hours), 0)
      INTO task_total_hours
      FROM time_entries
      WHERE task_id = NEW.task_id;

      UPDATE project_tasks
      SET actual_hours = task_total_hours
      WHERE id = NEW.task_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update task actual hours
CREATE TRIGGER update_task_actual_hours_trigger
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_task_actual_hours();
