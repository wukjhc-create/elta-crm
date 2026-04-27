-- =====================================================
-- Migration 00070: Email threading columns
-- Adds internet_message_id, in_reply_to, references
-- for proper reply matching via RFC 2822 headers.
-- =====================================================

-- Add threading columns to incoming_emails
ALTER TABLE incoming_emails
  ADD COLUMN IF NOT EXISTS internet_message_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS "references" TEXT;

-- Index for fast reply matching by internet_message_id
CREATE INDEX IF NOT EXISTS idx_incoming_emails_internet_message_id
  ON incoming_emails (internet_message_id)
  WHERE internet_message_id IS NOT NULL;

-- Index for conversation grouping
CREATE INDEX IF NOT EXISTS idx_incoming_emails_conversation_id
  ON incoming_emails (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- Index for in_reply_to matching
CREATE INDEX IF NOT EXISTS idx_incoming_emails_in_reply_to
  ON incoming_emails (in_reply_to)
  WHERE in_reply_to IS NOT NULL;
