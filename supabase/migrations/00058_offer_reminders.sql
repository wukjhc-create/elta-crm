-- =====================================================
-- Migration 00058: Offer reminders & follow-up system
-- =====================================================

-- Add reminder tracking to offers
ALTER TABLE offers ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMPTZ;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- Add reminder settings to company_settings
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT true;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_interval_days INTEGER DEFAULT 3;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_max_count INTEGER DEFAULT 3;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS reminder_email_subject TEXT DEFAULT 'Påmindelse: Dit tilbud fra Elta Solar';

-- Index for cron job efficiency
CREATE INDEX IF NOT EXISTS idx_offers_reminder_pending
  ON offers (status, last_reminder_sent, sent_at)
  WHERE status IN ('sent', 'viewed');
