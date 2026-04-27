-- =====================================================
-- 00063: Enable Supabase Realtime on key tables
-- =====================================================

-- Enable realtime for offers (economic dashboard, offer tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE offers;

-- Enable realtime for customer_tasks (task board, customer profile)
ALTER PUBLICATION supabase_realtime ADD TABLE customer_tasks;

-- Enable realtime for customers (customer list, dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE customers;

-- Enable realtime for incoming_emails (mail inbox live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE incoming_emails;

-- Enable realtime for portal_messages (chat)
ALTER PUBLICATION supabase_realtime ADD TABLE portal_messages;
