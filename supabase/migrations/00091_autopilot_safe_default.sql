-- =====================================================
-- Migration 00091: Production-hardening — autopilot dry_run by default.
--
-- Flip automation_rules.dry_run column default to TRUE so any new rule
-- starts in safe mode (logged but no side effects). Existing seeded
-- rules are also flipped to dry_run=TRUE — operators must explicitly
-- toggle them live from the UI before they fire real actions.
-- =====================================================

ALTER TABLE automation_rules
  ALTER COLUMN dry_run SET DEFAULT true;

-- Flip ALL existing rules to dry_run for the go-live cutover. Operators
-- enable each rule explicitly by setting dry_run=false.
UPDATE automation_rules
   SET dry_run = true
 WHERE dry_run = false;
