-- =====================================================
-- MIGRATION 00048: Notification Preferences
-- Description: Add notification_preferences JSONB to profiles
-- =====================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT NULL;

COMMENT ON COLUMN profiles.notification_preferences IS 'User notification preferences stored as JSON: { "new_lead": { "email": true, "push": true }, ... }';
