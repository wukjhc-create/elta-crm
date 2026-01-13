-- =====================================================
-- Seed Data for Elta CRM
-- Description: Sample data for testing and development
-- =====================================================

-- Note: Before running this, you need to manually create users in Supabase Auth
-- Then update the UUIDs below with the actual user IDs from auth.users

-- Example profiles (replace UUIDs with actual auth.users IDs)
-- INSERT INTO profiles (id, email, full_name, role, phone, department, is_active)
-- VALUES
--   ('00000000-0000-0000-0000-000000000001', 'admin@elta.dk', 'Admin Bruger', 'admin', '+45 12345678', 'Administration', true),
--   ('00000000-0000-0000-0000-000000000002', 'user@elta.dk', 'Normal Bruger', 'user', '+45 23456789', 'Salg', true),
--   ('00000000-0000-0000-0000-000000000003', 'tekniker@elta.dk', 'Tekniker Bruger', 'technician', '+45 34567890', 'Teknik', true);

-- Sample customers
-- INSERT INTO customers (customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, created_by)
-- VALUES
--   ('C000001', 'Acme Corporation', 'John Doe', 'john@acme.dk', '+45 11111111', 'Hovedgade 1', 'København', '1000', '00000000-0000-0000-0000-000000000001'),
--   ('C000002', 'Tech Solutions ApS', 'Jane Smith', 'jane@techsolutions.dk', '+45 22222222', 'Teknologivej 10', 'Aarhus', '8000', '00000000-0000-0000-0000-000000000002'),
--   ('C000003', 'Nordic Builders', 'Lars Nielsen', 'lars@nordicbuilders.dk', '+45 33333333', 'Byggervej 5', 'Odense', '5000', '00000000-0000-0000-0000-000000000001');

-- Sample leads
-- INSERT INTO leads (company_name, contact_person, email, phone, status, source, value, probability, expected_close_date, notes, assigned_to, created_by)
-- VALUES
--   ('Potential Client A', 'Anna Hansen', 'anna@potential-a.dk', '+45 44444444', 'new', 'website', 50000.00, 20, CURRENT_DATE + INTERVAL '30 days', 'Lead fra hjemmeside kontaktformular', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
--   ('Future Corp', 'Peter Andersen', 'peter@futurecorp.dk', '+45 55555555', 'contacted', 'referral', 75000.00, 40, CURRENT_DATE + INTERVAL '45 days', 'Henvist fra eksisterende kunde', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
--   ('Big Company Ltd', 'Maria Jensen', 'maria@bigcompany.dk', '+45 66666666', 'qualified', 'phone', 120000.00, 60, CURRENT_DATE + INTERVAL '60 days', 'Stort projekt - meget interesseret', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');

-- You can add more seed data as needed for:
-- - customer_contacts
-- - offers and offer_line_items
-- - projects, project_tasks, and time_entries
-- - messages
-- - lead_activities

-- =====================================================
-- How to use this file:
-- =====================================================
-- 1. Create test users in Supabase Auth dashboard first
-- 2. Get their UUIDs from the auth.users table
-- 3. Replace the placeholder UUIDs above with real ones
-- 4. Uncomment the INSERT statements
-- 5. Run this file in Supabase SQL Editor
-- =====================================================
