-- =====================================================
-- Migration 00061: Complete portal anon access
-- Ensures ALL tables needed by the portal have proper
-- anon RLS policies and GRANT statements.
-- Applied via Supabase Management API on 2026-03-18.
-- =====================================================

-- 1. OFFERS: anon SELECT + UPDATE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offers' AND policyname='Anon can view sent/viewed/accepted/rejected offers') THEN
    CREATE POLICY "Anon can view sent/viewed/accepted/rejected offers"
      ON offers FOR SELECT TO anon
      USING (status IN ('sent', 'viewed', 'accepted', 'rejected'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offers' AND policyname='Anon can update sent/viewed offers') THEN
    CREATE POLICY "Anon can update sent/viewed offers"
      ON offers FOR UPDATE TO anon
      USING (status IN ('sent', 'viewed'))
      WITH CHECK (status IN ('viewed', 'accepted', 'rejected'));
  END IF;
END $$;

GRANT SELECT, UPDATE ON offers TO anon;

-- 2. OFFER_LINE_ITEMS: anon SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offer_line_items' AND policyname='Anon can view offer line items') THEN
    CREATE POLICY "Anon can view offer line items"
      ON offer_line_items FOR SELECT TO anon
      USING (EXISTS (
        SELECT 1 FROM offers
        WHERE offers.id = offer_line_items.offer_id
        AND offers.status IN ('sent', 'viewed', 'accepted', 'rejected')
      ));
  END IF;
END $$;

GRANT SELECT ON offer_line_items TO anon;

-- 3. CUSTOMERS: anon SELECT (via offers + portal tokens)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='Anon can view customers linked to visible offers') THEN
    CREATE POLICY "Anon can view customers linked to visible offers"
      ON customers FOR SELECT TO anon
      USING (EXISTS (
        SELECT 1 FROM offers
        WHERE offers.customer_id = customers.id
        AND offers.status IN ('sent', 'viewed', 'accepted', 'rejected')
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='Anon can view customers with portal tokens') THEN
    CREATE POLICY "Anon can view customers with portal tokens"
      ON customers FOR SELECT TO anon
      USING (EXISTS (
        SELECT 1 FROM portal_access_tokens
        WHERE portal_access_tokens.customer_id = customers.id
        AND portal_access_tokens.is_active = true
      ));
  END IF;
END $$;

GRANT SELECT ON customers TO anon;

-- 4. PORTAL_ACCESS_TOKENS: anon SELECT + UPDATE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_access_tokens' AND policyname='Anyone can validate tokens') THEN
    CREATE POLICY "Anyone can validate tokens"
      ON portal_access_tokens FOR SELECT TO anon
      USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_access_tokens' AND policyname='Anon can update portal token access time') THEN
    CREATE POLICY "Anon can update portal token access time"
      ON portal_access_tokens FOR UPDATE TO anon
      USING (is_active = true)
      WITH CHECK (is_active = true);
  END IF;
END $$;

GRANT SELECT, UPDATE ON portal_access_tokens TO anon;

-- 5. OFFER_SIGNATURES: anon SELECT + INSERT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offer_signatures' AND policyname='Anyone can create signatures') THEN
    CREATE POLICY "Anyone can create signatures"
      ON offer_signatures FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offer_signatures' AND policyname='Anon can view offer signatures') THEN
    CREATE POLICY "Anon can view offer signatures"
      ON offer_signatures FOR SELECT TO anon
      USING (EXISTS (
        SELECT 1 FROM offers
        WHERE offers.id = offer_signatures.offer_id
        AND offers.status IN ('sent', 'viewed', 'accepted', 'rejected')
      ));
  END IF;
END $$;

GRANT SELECT, INSERT ON offer_signatures TO anon;

-- 6. PORTAL_MESSAGES: anon SELECT + INSERT + UPDATE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_messages' AND policyname='Portal users can view their messages') THEN
    CREATE POLICY "Portal users can view their messages"
      ON portal_messages FOR SELECT TO anon
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_messages' AND policyname='Portal users can create messages') THEN
    CREATE POLICY "Portal users can create messages"
      ON portal_messages FOR INSERT TO anon
      WITH CHECK (sender_type = 'customer');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portal_messages' AND policyname='Anon can update portal message read status') THEN
    CREATE POLICY "Anon can update portal message read status"
      ON portal_messages FOR UPDATE TO anon
      USING (sender_type = 'employee')
      WITH CHECK (sender_type = 'employee');
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON portal_messages TO anon;

-- 7. OFFER_ACTIVITIES: anon INSERT (portal activity logging)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offer_activities' AND policyname='Anon can log portal activities') THEN
    CREATE POLICY "Anon can log portal activities"
      ON offer_activities FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT ON offer_activities TO anon;

-- 8. PROFILES: anon SELECT (limited)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Anon can view basic profile info') THEN
    CREATE POLICY "Anon can view basic profile info"
      ON profiles FOR SELECT TO anon
      USING (true);
  END IF;
END $$;

GRANT SELECT (id, full_name, email) ON profiles TO anon;

-- 9. COMPANY_SETTINGS: anon SELECT (for PDF generation)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_settings' AND policyname='Anon can view company settings') THEN
    CREATE POLICY "Anon can view company settings"
      ON company_settings FOR SELECT TO anon
      USING (true);
  END IF;
END $$;

GRANT SELECT ON company_settings TO anon;

-- 10. CUSTOMER_DOCUMENTS: anon SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customer_documents' AND policyname='Anon can view customer documents') THEN
    CREATE POLICY "Anon can view customer documents"
      ON customer_documents FOR SELECT TO anon
      USING (true);
  END IF;
END $$;

GRANT SELECT ON customer_documents TO anon;
