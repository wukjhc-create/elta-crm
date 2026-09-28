-- =====================================================================
-- 00163 — Agent Core: DB-side capability-guard (P2-rest A)
--
-- Problem (docs/agent-capability-audit.md A1–A3): trg_agent_actions_enforce_approval brugte action-raekkens
-- egen side_effect_class. En raekke der fejlagtigt angav en lavere klasse, requires_approval=false eller en
-- forkert agent, kunne komme uden om approval paa DB-niveau. Executor lukker hullet i koden (2784b5d);
-- denne migration goer DB'en fail-closed uafhaengigt af koden.
--
--   1. public.agent_capabilities — spejl af capability-registeret (src/lib/agents/capability-registry.ts).
--      Nye capabilities kraever en migration med en raekke her (ellers afviser DB'en deres actions).
--   2. trg_agent_actions_capability_guard (BEFORE INSERT OR UPDATE paa agent_actions):
--        - ukendt capability                          -> afvist
--        - side_effect_class <> capabilityens          -> afvist
--        - requires_approval/min_approvals loesere     -> afvist
--        - runnets agent_type ikke tilladt             -> afvist
--        - capability aendret efter oprettelse         -> afvist
--        - overgang til executing/executed for ENHVER approval-capability uden gyldig approval -> afvist
--          (tidligere kun hard-blocked klasser)
--   Ingen data aendres. Eksisterende raekker valideres foerst ved naeste UPDATE.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_agent_actions_capability_guard ON public.agent_actions;
--   DROP FUNCTION IF EXISTS public.agent_actions_capability_guard();
--   DROP TABLE IF EXISTS public.agent_capabilities;
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_capabilities (
  key               text PRIMARY KEY,
  side_effect_class text NOT NULL CHECK (side_effect_class IN ('read','create','update','delete','send_external','push_external','finance')),
  requires_approval boolean NOT NULL,
  min_approvals     integer NOT NULL CHECK (min_approvals >= 1),
  agent_types       text[]  NOT NULL CHECK (cardinality(agent_types) >= 1),
  description       text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Samme regel som registerCapability(): kun rene laese-/udkast-capabilities maa undvaere approval,
  -- og hard-blocked klasser kraever det altid.
  CONSTRAINT agent_capabilities_approval_rule CHECK (side_effect_class = 'read' OR requires_approval)
);

INSERT INTO public.agent_capabilities (key, side_effect_class, requires_approval, min_approvals, agent_types, description) VALUES
  ('mail.draft_reply',              'read',          false, 1, ARRAY['mail'],     'Svar-udkast til indgaaende mail (sender aldrig)'),
  ('mail.link_customer',            'update',        true,  1, ARRAY['mail'],     'Kobl mail til eksisterende kunde'),
  ('case.propose_from_email',       'create',        true,  1, ARRAY['mail'],     'Sagsforslag fra mail'),
  ('mail.send_reply',               'send_external', true,  1, ARRAY['mail'],     'Send reviewet svar via Graph (hard-blocked)'),
  ('offer.propose_draft_from_case', 'create',        true,  1, ARRAY['offer'],    'Tomt tilbudsudkast fra sag'),
  ('followup.draft_offer_reminder', 'read',          false, 1, ARRAY['followup'], 'Paamindelses-udkast (sender aldrig)'),
  ('followup.create_task',          'create',        true,  1, ARRAY['followup'], 'Intern opfoelgningsopgave'),
  ('planning.propose_work_order',   'create',        true,  1, ARRAY['planning'], 'Intern arbejdsordre (planlaegning)')
ON CONFLICT (key) DO UPDATE SET
  side_effect_class = EXCLUDED.side_effect_class, requires_approval = EXCLUDED.requires_approval,
  min_approvals = EXCLUDED.min_approvals, agent_types = EXCLUDED.agent_types,
  description = EXCLUDED.description, updated_at = now();

ALTER TABLE public.agent_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_capabilities_select ON public.agent_capabilities;
CREATE POLICY agent_capabilities_select ON public.agent_capabilities FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.agent_capabilities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_capabilities TO authenticated;
GRANT ALL ON public.agent_capabilities TO service_role;

CREATE OR REPLACE FUNCTION public.agent_actions_capability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  cap   public.agent_capabilities%ROWTYPE;
  agent text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.capability IS DISTINCT FROM OLD.capability THEN
    RAISE EXCEPTION 'Agent Core: capability kan ikke aendres efter oprettelse (action %)', NEW.id USING ERRCODE = '42501';
  END IF;

  SELECT * INTO cap FROM public.agent_capabilities WHERE key = NEW.capability;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent Core: ukendt capability % (fail-closed)', NEW.capability USING ERRCODE = '42501';
  END IF;
  IF NEW.side_effect_class IS DISTINCT FROM cap.side_effect_class THEN
    RAISE EXCEPTION 'Agent Core: side_effect_class % matcher ikke capability % (%)', NEW.side_effect_class, cap.key, cap.side_effect_class
      USING ERRCODE = '42501';
  END IF;
  IF cap.requires_approval AND NOT NEW.requires_approval THEN
    RAISE EXCEPTION 'Agent Core: % kraever approval; requires_approval=false afvist', cap.key USING ERRCODE = '42501';
  END IF;
  IF NEW.min_approvals < cap.min_approvals THEN
    RAISE EXCEPTION 'Agent Core: % kraever mindst % approval(s)', cap.key, cap.min_approvals USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.run_id IS DISTINCT FROM OLD.run_id THEN
    SELECT r.agent_type INTO agent FROM public.agent_runs r WHERE r.id = NEW.run_id;
    IF agent IS NULL OR NOT (agent = ANY (cap.agent_types)) THEN
      RAISE EXCEPTION 'Agent Core: agent % maa ikke bruge capability %', coalesce(agent, '(ukendt run)'), cap.key USING ERRCODE = '42501';
    END IF;
  END IF;

  IF (cap.requires_approval OR NEW.requires_approval)
     AND NEW.status IN ('executing', 'executed')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('executing', 'executed')) THEN
    IF NOT public.agent_action_is_executable(NEW.id, NEW.min_approvals) THEN
      RAISE EXCEPTION 'Agent Core: % kan ikke udfoeres uden % gyldig(e) approval(s) (action %)', cap.key, NEW.min_approvals, NEW.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.agent_actions_capability_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_agent_actions_capability_guard ON public.agent_actions;
CREATE TRIGGER trg_agent_actions_capability_guard
  BEFORE INSERT OR UPDATE ON public.agent_actions
  FOR EACH ROW EXECUTE FUNCTION public.agent_actions_capability_guard();

NOTIFY pgrst, 'reload schema';

COMMIT;
