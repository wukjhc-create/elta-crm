-- =====================================================================
-- 00156: Agent Core — Fase 1 skema
-- =====================================================================
-- Se docs/agent-core-architecture.md.
--
-- Principper haandhaevet paa DB-niveau:
--   * Alle agenter disabled by default; safety_mode='suggest'.
--   * Hard-blocked side effects (send_external, push_external, finance,
--     delete) kan ALDRIG naa approved/executing/executed uden gyldig(e)
--     menneskelig(e) approval(s) NU — haandhaevet af trigger, der ogsaa
--     gaelder service_role (som bypasser RLS).
--   * RLS = admin-only laesning i Fase 1 (aabnes senere additivt).
--   * Approvals er immutable append-only events; effektiv beslutning =
--     seneste pr. distinkt approver; nyere rejection blokerer; udloebne
--     approvals taeller ikke; samme bruger taeller kun én gang.
--   * Dual approval kan aktiveres senere via agent_actions.min_approvals
--     (default 1) uden skema-redesign.
--
-- INGEN forretningsdata, INGEN agent-aktivering, INGEN aendring af
-- AUTO_CREATE_CASES_ENABLED (bor i env, ikke her).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. agent_runs
-- ---------------------------------------------------------------------
CREATE TABLE public.agent_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type    text NOT NULL CHECK (agent_type IN
                  ('mail','offer','planning','purchase','followup','economy','director')),
  trigger       text NOT NULL CHECK (trigger IN ('cron','manual','event','user')),
  triggered_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN
                  ('pending','running','awaiting_approval','completed','failed','cancelled')),
  safety_mode   text NOT NULL DEFAULT 'suggest' CHECK (safety_mode IN ('suggest','approve','auto')),
  dry_run       boolean NOT NULL DEFAULT false,
  input_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary       text,
  model         text,
  tokens_used   integer NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  error         text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.agent_runs IS 'En agent-koersel. safety_mode: suggest|approve|auto (auto aldrig for hard-blocked klasser).';

-- ---------------------------------------------------------------------
-- 2. agent_tasks  (UNIQUE(id,run_id) som composite-FK-maal + UNIQUE(run_id,seq))
-- ---------------------------------------------------------------------
CREATE TABLE public.agent_tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  seq                integer NOT NULL DEFAULT 0,
  kind               text NOT NULL,
  title              text NOT NULL,
  rationale          text,
  confidence         numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  target_entity_type text,
  target_entity_id   uuid,
  status             text NOT NULL DEFAULT 'proposed' CHECK (status IN
                       ('proposed','approved','rejected','executed','skipped','failed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_tasks_id_run_uq  UNIQUE (id, run_id),
  CONSTRAINT agent_tasks_run_seq_uq UNIQUE (run_id, seq)
);
COMMENT ON TABLE public.agent_tasks IS 'Paataenkt arbejdsenhed i en run. rationale = hvorfor agenten foreslaar den.';

-- ---------------------------------------------------------------------
-- 3. agent_actions  (composite FK sikrer task_id + run_id hoerer sammen)
-- ---------------------------------------------------------------------
CREATE TABLE public.agent_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL,
  run_id            uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  action_type       text NOT NULL,
  capability        text NOT NULL,
  side_effect_class text NOT NULL CHECK (side_effect_class IN
                      ('read','create','update','delete','send_external','push_external','finance')),
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_approval boolean NOT NULL DEFAULT true,
  min_approvals     integer NOT NULL DEFAULT 1 CHECK (min_approvals >= 1),
  idempotency_key   text NOT NULL UNIQUE,
  status            text NOT NULL DEFAULT 'planned' CHECK (status IN
                      ('planned','awaiting_approval','approved','rejected','executing','executed','failed','rolled_back')),
  result            jsonb,
  error             text,
  executed_at       timestamptz,
  executed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_actions_executed_fields CHECK (status <> 'executed' OR executed_at IS NOT NULL),
  -- Fysisk garanti: action.task_id OG action.run_id peger paa samme task/run.
  CONSTRAINT agent_actions_task_run_fk
    FOREIGN KEY (task_id, run_id) REFERENCES public.agent_tasks(id, run_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.agent_actions IS 'Konkret side-effekt en task vil udfoere. Kun Executor (service_role) udfoerer; agenten skriver kun raekker.';

-- ---------------------------------------------------------------------
-- 4. agent_action_approvals  (immutable append-only event-log)
-- ---------------------------------------------------------------------
CREATE TABLE public.agent_action_approvals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id  uuid NOT NULL REFERENCES public.agent_actions(id) ON DELETE CASCADE,
  decision   text NOT NULL CHECK (decision IN ('approved','rejected','escalated')),
  decided_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now(),
  reason     text,
  channel    text NOT NULL DEFAULT 'ui' CHECK (channel IN ('ui','email')),
  expires_at timestamptz
);
COMMENT ON TABLE public.agent_action_approvals IS 'Immutable godkendelses-events, altid knyttet til bruger (decided_by, RESTRICT). Effektiv beslutning = seneste pr. approver.';

-- ---------------------------------------------------------------------
-- 5. agent_configs  (requires_approval_for: superset AND subset af gyldige klasser)
-- ---------------------------------------------------------------------
CREATE TABLE public.agent_configs (
  agent_type            text PRIMARY KEY CHECK (agent_type IN
                          ('mail','offer','planning','purchase','followup','economy','director')),
  enabled               boolean NOT NULL DEFAULT false,
  safety_mode           text NOT NULL DEFAULT 'suggest' CHECK (safety_mode IN ('suggest','approve','auto')),
  allowed_action_types  text[] NOT NULL DEFAULT '{}',
  requires_approval_for text[] NOT NULL
                          DEFAULT ARRAY['send_external','push_external','finance','delete']::text[],
  max_actions_per_run   integer NOT NULL DEFAULT 25     CHECK (max_actions_per_run >= 0),
  daily_token_budget    integer NOT NULL DEFAULT 100000 CHECK (daily_token_budget >= 0),
  daily_action_budget   integer NOT NULL DEFAULT 200    CHECK (daily_action_budget >= 0),
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_configs_hardblock_superset CHECK (
    requires_approval_for @> ARRAY['send_external','push_external','finance','delete']::text[]),
  CONSTRAINT agent_configs_valid_classes_subset CHECK (
    requires_approval_for <@ ARRAY['read','create','update','delete','send_external','push_external','finance']::text[])
);
COMMENT ON TABLE public.agent_configs IS 'Scope & safety pr. agenttype. Disabled by default. requires_approval_for skal altid indeholde de 4 hard-blockede klasser og kun gyldige klasser.';

-- ---------------------------------------------------------------------
-- 6. Helper-funktioner
-- ---------------------------------------------------------------------
-- Admin-tjek (SECURITY DEFINER: laeser egen profil uanset RLS; kun auth.uid()).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = 'admin');
$$;

-- Effektive approvals: distinkt approver -> seneste beslutning.
CREATE OR REPLACE FUNCTION public.agent_action_effective_approvals(p_action_id uuid)
RETURNS TABLE(approved_count integer, rejected_exists boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (decided_by) decided_by, decision, expires_at
    FROM public.agent_action_approvals
    WHERE action_id = p_action_id
    ORDER BY decided_by, decided_at DESC, id DESC
  )
  SELECT
    COALESCE(count(*) FILTER (
      WHERE decision = 'approved' AND (expires_at IS NULL OR expires_at > now())), 0)::int,
    COALESCE(bool_or(decision = 'rejected'), false)
  FROM latest;
$$;

-- Er action udfoerbar NU: nok gyldige distinkte approvals og ingen staaende rejection.
CREATE OR REPLACE FUNCTION public.agent_action_is_executable(p_action_id uuid, p_min integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ea.approved_count >= GREATEST(p_min, 1) AND NOT ea.rejected_exists
  FROM public.agent_action_effective_approvals(p_action_id) ea;
$$;

-- Trigger: approvals er append-only (UPDATE blokeret for alle, ogsaa service_role).
CREATE OR REPLACE FUNCTION public.agent_approvals_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'agent_action_approvals er append-only; UPDATE ikke tilladt'
    USING ERRCODE = '42501';
END;
$function$;

-- Trigger: hard-block execute-guard (gaelder ogsaa service_role, som bypasser RLS).
CREATE OR REPLACE FUNCTION public.agent_enforce_approval_before_execute()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $function$
BEGIN
  IF NEW.side_effect_class IN ('send_external','push_external','finance','delete')
     AND NEW.status IN ('approved','executing','executed')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('approved','executing','executed')) THEN
    IF NOT public.agent_action_is_executable(NEW.id, NEW.min_approvals) THEN
      RAISE EXCEPTION
        'Agent Core: % kraever mindst % gyldig(e) distinkt(e) approval(s) og ingen staaende rejection (action %)',
        NEW.side_effect_class, NEW.min_approvals, NEW.id
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 6b. Function privileges — fjern implicit PUBLIC/anon EXECUTE, giv kun det noedvendige
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_admin()                                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_action_effective_approvals(uuid)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_action_is_executable(uuid, integer)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_approvals_immutable()                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_enforce_approval_before_execute()      FROM PUBLIC;

-- Eksplicit ingen anon EXECUTE (defensivt — PUBLIC-revoke daekker allerede).
REVOKE EXECUTE ON FUNCTION public.is_admin()                                FROM anon;
REVOKE EXECUTE ON FUNCTION public.agent_action_effective_approvals(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.agent_action_is_executable(uuid, integer) FROM anon;

-- Praecise grants:
--  * is_admin(): bruges i RLS-policies (evalueres som authenticated) + server-side.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
--  * approval-helpers: kun Executor (service_role). Ikke authenticated, ikke anon.
GRANT EXECUTE ON FUNCTION public.agent_action_effective_approvals(uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_action_is_executable(uuid, integer) TO service_role;
--  * Trigger-funktioner faar INGEN direkte EXECUTE-grant (kaldes kun af triggeren).

-- ---------------------------------------------------------------------
-- 7. Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_agent_runs_updated    BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agent_tasks_updated   BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agent_actions_updated BEFORE UPDATE ON public.agent_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agent_configs_updated BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_agent_approvals_immutable BEFORE UPDATE ON public.agent_action_approvals
  FOR EACH ROW EXECUTE FUNCTION public.agent_approvals_immutable();

CREATE TRIGGER trg_agent_actions_enforce_approval BEFORE INSERT OR UPDATE ON public.agent_actions
  FOR EACH ROW EXECUTE FUNCTION public.agent_enforce_approval_before_execute();

-- ---------------------------------------------------------------------
-- 8. Indexes
-- ---------------------------------------------------------------------
CREATE INDEX idx_agent_runs_status      ON public.agent_runs(status);
CREATE INDEX idx_agent_runs_type        ON public.agent_runs(agent_type);
CREATE INDEX idx_agent_runs_created     ON public.agent_runs(created_at DESC);
CREATE INDEX idx_agent_tasks_run        ON public.agent_tasks(run_id);
CREATE INDEX idx_agent_tasks_status     ON public.agent_tasks(status);
CREATE INDEX idx_agent_actions_task     ON public.agent_actions(task_id);
CREATE INDEX idx_agent_actions_run      ON public.agent_actions(run_id);
CREATE INDEX idx_agent_actions_status   ON public.agent_actions(status);
CREATE INDEX idx_agent_actions_awaiting ON public.agent_actions(status) WHERE status = 'awaiting_approval';
-- Matcher DISTINCT ON (decided_by) ... ORDER BY decided_by, decided_at DESC, id DESC pr. action.
CREATE INDEX idx_agent_approvals_latest ON public.agent_action_approvals(action_id, decided_by, decided_at DESC, id DESC);

-- ---------------------------------------------------------------------
-- 9. RLS  (admin-only laesning i Fase 1)
-- ---------------------------------------------------------------------
ALTER TABLE public.agent_runs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_action_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_configs          ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_runs_select    ON public.agent_runs             FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY agent_tasks_select   ON public.agent_tasks            FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY agent_actions_select ON public.agent_actions          FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY agent_appr_select    ON public.agent_action_approvals FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY agent_configs_select ON public.agent_configs          FOR SELECT TO authenticated USING (public.is_admin());

-- Approvals: kun admin, kun egne (attribution). Executor (service_role) LAESER kun.
CREATE POLICY agent_appr_insert ON public.agent_action_approvals
  FOR INSERT TO authenticated
  WITH CHECK (decided_by = auth.uid() AND public.is_admin());

-- Configs: kun admin maa oprette/aendre.
CREATE POLICY agent_configs_admin_update ON public.agent_configs
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY agent_configs_admin_insert ON public.agent_configs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Ingen INSERT/UPDATE/DELETE-policies for authenticated paa runs/tasks/actions:
-- orkestrering sker udelukkende server-side via service_role.

-- ---------------------------------------------------------------------
-- 10. Table GRANTS  (ingen anon-adgang)
-- ---------------------------------------------------------------------
REVOKE ALL ON public.agent_runs, public.agent_tasks, public.agent_actions,
              public.agent_action_approvals, public.agent_configs FROM anon;

GRANT SELECT ON public.agent_runs, public.agent_tasks, public.agent_actions,
                public.agent_action_approvals, public.agent_configs TO authenticated;
GRANT INSERT ON public.agent_action_approvals TO authenticated;   -- RLS: admin + egne
GRANT INSERT, UPDATE ON public.agent_configs TO authenticated;     -- RLS: admin

GRANT ALL ON public.agent_runs, public.agent_tasks, public.agent_actions,
             public.agent_action_approvals, public.agent_configs TO service_role;

-- ---------------------------------------------------------------------
-- 11. Seed: alle 7 agenttyper DISABLED, suggest-mode
-- ---------------------------------------------------------------------
INSERT INTO public.agent_configs (agent_type) VALUES
  ('mail'),('offer'),('planning'),('purchase'),('followup'),('economy'),('director')
ON CONFLICT (agent_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
