-- =====================================================================
-- 00157: Agent Core — grant-hardening (least privilege)
-- =====================================================================
-- BAGGRUND
--   Post-verifikation af 00156 viste at Supabase's default-privilegier
--   (pg_default_acl) tildeler `authenticated` ALLE table-privilegier paa
--   nye public-tabeller OG EXECUTE paa nye funktioner — tildelt SPECIFIKT
--   til rollen `authenticated` (ikke via PUBLIC), saa 00156's
--   `REVOKE ... FROM PUBLIC` ramte det ikke.
--
--   Funktionelt haandhaever RLS + triggers + CHECKs stadig modellen
--   (non-admin kan intet via RLS; hard-block/approval via trigger). MEN:
--     - TRUNCATE gates IKKE af RLS -> table-TRUNCATE-grant til authenticated
--       er et reelt least-privilege-brud.
--     - approval-helperne boer vaere service_role-only.
--
--   Denne migration STRAMMER kun privilegier (REVOKE + praecise GRANTs).
--   INGEN skema-aendring, INGEN data-aendring, INGEN RLS-policy-aendring.
--   Additiv og sikker; ingen destruktiv effekt.
--
-- ROLLBACK (hvis noedvendigt)
--   Ikke relevant som data-rollback. For at gendanne bred adgang:
--   GRANT ALL ON <tabeller> TO authenticated;  (frarådes)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tabeller: nulstil authenticated til den tiltaenkte minimale model
-- ---------------------------------------------------------------------
REVOKE ALL ON public.agent_runs, public.agent_tasks, public.agent_actions,
              public.agent_action_approvals, public.agent_configs
  FROM authenticated;

-- Kun SELECT (RLS gater til admin) paa alle 5:
GRANT SELECT ON public.agent_runs, public.agent_tasks, public.agent_actions,
                public.agent_action_approvals, public.agent_configs
  TO authenticated;

-- Approvals: authenticated maa INSERT (RLS: admin + kun egne):
GRANT INSERT ON public.agent_action_approvals TO authenticated;

-- Configs: authenticated maa INSERT/UPDATE (RLS: kun admin):
GRANT INSERT, UPDATE ON public.agent_configs TO authenticated;

-- Defensivt: bekraeft at anon fortsat intet har.
REVOKE ALL ON public.agent_runs, public.agent_tasks, public.agent_actions,
              public.agent_action_approvals, public.agent_configs
  FROM anon;

-- service_role beholder ALL (orkestrator) — uaendret.

-- ---------------------------------------------------------------------
-- 2. Funktioner: approval-helpers skal vaere service_role-only
-- ---------------------------------------------------------------------
-- Fjern default-ACL-tildelt authenticated/PUBLIC/anon EXECUTE:
REVOKE EXECUTE ON FUNCTION public.agent_action_effective_approvals(uuid)     FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agent_action_is_executable(uuid, integer)  FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agent_approvals_immutable()                FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agent_enforce_approval_before_execute()    FROM authenticated, anon, PUBLIC;

-- Genbekraeft praecise grants:
GRANT EXECUTE ON FUNCTION public.agent_action_effective_approvals(uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_action_is_executable(uuid, integer) TO service_role;

-- is_admin() bevidst UROERT: authenticated skal kunne kalde den (bruges i RLS).
--   (authenticated + service_role beholder EXECUTE.)

NOTIFY pgrst, 'reload schema';

COMMIT;
