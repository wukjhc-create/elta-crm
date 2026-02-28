-- =====================================================
-- 00054: Add offer_id to customer_tasks
-- Links tasks to specific offers for direct navigation
-- =====================================================

ALTER TABLE customer_tasks
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES offers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_tasks_offer_id ON customer_tasks(offer_id)
  WHERE offer_id IS NOT NULL;
