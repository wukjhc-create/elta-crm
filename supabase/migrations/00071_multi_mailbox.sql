-- =====================================================
-- Migration 00071: Multi-mailbox support
-- Adds mailbox_source column so each email is tagged
-- with which CRM mailbox it arrived at / was sent from.
-- =====================================================

ALTER TABLE incoming_emails
  ADD COLUMN IF NOT EXISTS mailbox_source TEXT;

-- Back-fill existing rows from to_email (for inbound) or sender_email (for outbound)
UPDATE incoming_emails
  SET mailbox_source = COALESCE(to_email, sender_email)
  WHERE mailbox_source IS NULL;

-- Index for filtering by mailbox
CREATE INDEX IF NOT EXISTS idx_incoming_emails_mailbox_source
  ON incoming_emails (mailbox_source)
  WHERE mailbox_source IS NOT NULL;
