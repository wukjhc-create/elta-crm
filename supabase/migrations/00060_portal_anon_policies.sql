-- Migration: 00060_portal_anon_policies
-- Adds missing anon RLS policies for the customer portal to work without login.
-- The portal uses the Supabase anon key (no auth) with token-based validation.

-- 1. portal_access_tokens: anon needs UPDATE to track last_accessed_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can update portal token access time') THEN
    CREATE POLICY "Anon can update portal token access time"
      ON portal_access_tokens FOR UPDATE TO anon
      USING (is_active = true)
      WITH CHECK (is_active = true);
  END IF;
END $$;
GRANT UPDATE ON portal_access_tokens TO anon;

-- 2. offer_signatures: anon needs SELECT to display signature status on offers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can view offer signatures') THEN
    CREATE POLICY "Anon can view offer signatures"
      ON offer_signatures FOR SELECT TO anon
      USING (
        EXISTS (
          SELECT 1 FROM offers
          WHERE offers.id = offer_signatures.offer_id
            AND offers.status IN ('sent', 'viewed', 'accepted', 'rejected')
        )
      );
  END IF;
END $$;
GRANT SELECT ON offer_signatures TO anon;

-- 3. portal_messages: anon needs UPDATE to mark messages as read
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can update portal message read status') THEN
    CREATE POLICY "Anon can update portal message read status"
      ON portal_messages FOR UPDATE TO anon
      USING (sender_type = 'employee')
      WITH CHECK (sender_type = 'employee');
  END IF;
END $$;
GRANT UPDATE ON portal_messages TO anon;

-- 4. profiles: anon needs limited SELECT for portal message sender display
-- Only expose full_name and email (needed for employee name in chat)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can view basic profile info') THEN
    CREATE POLICY "Anon can view basic profile info"
      ON profiles FOR SELECT TO anon
      USING (true);
  END IF;
END $$;
GRANT SELECT (id, full_name, email) ON profiles TO anon;
