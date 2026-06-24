-- =====================================================================
-- 00152: Partner-portal — partner_access_tokens
-- =====================================================================
--
-- FORMÅL (Fase 1, partner-portal)
--   En samarbejdspartner (fx Watt) er ofte den BETALENDE part på en sag
--   (service_cases.payer_customer_id), mens slutkunden får arbejdet udført.
--   Denne tabel giver partneren token-gated selvbetjeningsadgang til at se
--   ALLE sager hvor de er payer + hente kunde-vendt dokumentation.
--
-- DESIGN-BESLUTNINGER (bekræftet med bruger)
--   - Adgang = token-tilstedeværelse. Ingen is_partner-flag på customers;
--     en kunde bliver "partner med portaladgang" når der oprettes et token.
--   - SEPARAT tabel (ikke en scope-kolonne på portal_access_tokens) → ren
--     sikkerheds-isolation. Kundeportalen forbliver 100% urørt.
--   - partner_customer_id peger på partnerens egen customers-række; portalen
--     lister sager hvor service_cases.payer_customer_id = partner_customer_id.
--
-- SIKKERHED
--   - Spejler portal_access_tokens (migration 00009) 1:1 i felter.
--   - INGEN anon-policy fra dag 1 (lærdom fra α-hærdningen 00126/00127/00131).
--     Token-validering sker UDELUKKENDE via service-role admin-client i app-laget
--     (validatePartnerToken), aldrig via anon-RLS.
--   - authenticated (intern medarbejder) kan administrere tokens.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.partner_access_tokens;
--   NOTIFY pgrst, 'reload schema';
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS partner_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (spejler portal_access_tokens)
CREATE INDEX IF NOT EXISTS idx_partner_access_tokens_partner_customer_id
  ON partner_access_tokens(partner_customer_id);
CREATE INDEX IF NOT EXISTS idx_partner_access_tokens_token
  ON partner_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_partner_access_tokens_is_active
  ON partner_access_tokens(is_active);

-- RLS: authenticated administrerer; service_role bruges af token-validering.
-- INGEN anon-policy — partner-validering går aldrig via anon.
ALTER TABLE partner_access_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'partner_access_tokens' AND policyname = 'Authenticated users can manage partner tokens') THEN
    CREATE POLICY "Authenticated users can manage partner tokens" ON partner_access_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'partner_access_tokens' AND policyname = 'Service role full access partner tokens') THEN
    CREATE POLICY "Service role full access partner tokens" ON partner_access_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON partner_access_tokens TO authenticated;
GRANT ALL ON partner_access_tokens TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
