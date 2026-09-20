-- =====================================================================
-- 00158: agent_actions.status += 'needs_verification'
-- =====================================================================
-- FORMÅL
--   Tilfoej status 'needs_verification' til agent_actions, saa Executor kan
--   markere et UVIST transport-resultat (fx Microsoft Graph-timeout hvor vi
--   ikke sikkert ved om mailen blev sendt). Saadanne actions retryes ALDRIG
--   automatisk — de kraever menneskelig kontrol.
--
--   NOEDVENDIG FOER foerste LIVE send_external (mail.send_reply). Uden denne
--   vil et uncertain-udfald forsoege at saette en status som CHECK afviser.
--
-- SCOPE: kun CHECK-udvidelse paa status. Ingen data-aendring, ingen RLS/grant.
--
-- KOER IKKE uden separat approval (falder sammen med LIVE-send-gaten).
--
-- ROLLBACK:
--   ALTER TABLE public.agent_actions DROP CONSTRAINT agent_actions_status_check;
--   ALTER TABLE public.agent_actions ADD CONSTRAINT agent_actions_status_check
--     CHECK (status IN ('planned','awaiting_approval','approved','rejected',
--                       'executing','executed','failed','rolled_back'));
--   (Forudsaetter at ingen raekker har status='needs_verification'.)
-- =====================================================================

BEGIN;

ALTER TABLE public.agent_actions DROP CONSTRAINT IF EXISTS agent_actions_status_check;
ALTER TABLE public.agent_actions ADD CONSTRAINT agent_actions_status_check
  CHECK (status IN (
    'planned','awaiting_approval','approved','rejected',
    'executing','executed','failed','rolled_back','needs_verification'
  ));

COMMIT;
