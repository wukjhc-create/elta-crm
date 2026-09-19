-- =====================================================================
-- Guard-tests for 00156_agent_core — negative sikkerhedstests.
--
-- KOERES KUN EFTER migrationen er anvendt, OG kun som en transaktion der
-- ROLLBACK'es til sidst. Ingen data persisteres. Hver test forventes at
-- FEJLE (RAISE EXCEPTION) — det er beviset paa at spaerren virker.
--
-- Anbefalet: koer hver EXPECT-FAIL-blok isoleret og bekraeft at den kaster.
-- Denne fil er dokumentation af testscenarier + koerbar skabelon.
-- =====================================================================

BEGIN;

-- Opret en minimal run + task at haenge actions paa (rulles tilbage).
INSERT INTO public.agent_runs (id, agent_type, trigger, safety_mode)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'economy', 'manual', 'approve');
INSERT INTO public.agent_tasks (id, run_id, seq, kind, title)
VALUES ('00000000-0000-0000-0000-0000000000bb',
        '00000000-0000-0000-0000-0000000000aa', 0, 'test', 'guard-test');

-- ---------------------------------------------------------------------
-- TEST 1 (EXPECT FAIL): finance-action kan ikke saettes 'executed' uden approval.
--   Forventet: ERRCODE 42501 fra agent_enforce_approval_before_execute.
-- ---------------------------------------------------------------------
-- INSERT en finance-action i 'planned' (dette lykkes):
INSERT INTO public.agent_actions
  (id, task_id, run_id, action_type, capability, side_effect_class, idempotency_key, min_approvals, status)
VALUES ('00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-0000000000bb',
        '00000000-0000-0000-0000-0000000000aa',
        'create_invoice', 'economy.create_invoice', 'finance', 'guard-key-1', 1, 'planned');
-- Forsoeg at eksekvere UDEN approval -> skal kaste:
--   UPDATE public.agent_actions SET status='executed', executed_at=now()
--   WHERE id='00000000-0000-0000-0000-0000000000c1';
--   >>> EXPECT: ERROR 42501 "kraever mindst 1 gyldig(e) distinkt(e) approval(s)"

-- ---------------------------------------------------------------------
-- TEST 2 (EXPECT PASS efter approval): med gyldig approval maa den eksekveres.
-- ---------------------------------------------------------------------
-- INSERT approval (kraever i praksis en gyldig auth.users-id som decided_by):
--   INSERT INTO public.agent_action_approvals (action_id, decision, decided_by)
--   VALUES ('...c1', 'approved', '<en-eksisterende-auth-user-uuid>');
--   UPDATE public.agent_actions SET status='approved' WHERE id='...c1';   -- nu tilladt
--   >>> EXPECT: OK

-- ---------------------------------------------------------------------
-- TEST 3 (EXPECT FAIL): dual approval — finance med min_approvals=2 og kun 1 approver.
-- ---------------------------------------------------------------------
--   INSERT finance-action med min_approvals=2, 1 approval fra én bruger,
--   forsoeg 'approved' -> EXPECT 42501 (kun 1 distinkt approver).

-- ---------------------------------------------------------------------
-- TEST 4 (EXPECT FAIL): config kan ikke fjerne hard-blocked klasser.
-- ---------------------------------------------------------------------
--   UPDATE public.agent_configs SET requires_approval_for = ARRAY['read']::text[]
--   WHERE agent_type='economy';
--   >>> EXPECT: ERROR paa CHECK agent_configs_hardblock_superset

-- ---------------------------------------------------------------------
-- TEST 5 (EXPECT FAIL): config kan ikke indeholde ugyldig klasse.
-- ---------------------------------------------------------------------
--   UPDATE public.agent_configs
--   SET requires_approval_for = ARRAY['send_external','push_external','finance','delete','bogus']::text[]
--   WHERE agent_type='economy';
--   >>> EXPECT: ERROR paa CHECK agent_configs_valid_classes_subset

-- ---------------------------------------------------------------------
-- TEST 6 (EXPECT FAIL): approvals er immutable (UPDATE blokeret).
-- ---------------------------------------------------------------------
--   UPDATE public.agent_action_approvals SET decision='approved' WHERE id='<...>';
--   >>> EXPECT: ERROR 42501 "append-only; UPDATE ikke tilladt"

-- ---------------------------------------------------------------------
-- TEST 7 (EXPECT FAIL): task_id/run_id-mismatch afvises af composite FK.
-- ---------------------------------------------------------------------
--   INSERT agent_actions med task_id fra én run men run_id fra en anden
--   >>> EXPECT: ERROR foreign key "agent_actions_task_run_fk"

-- ---------------------------------------------------------------------
-- TEST 8 (EXPECT 0 raekker som anon/authenticated non-admin): RLS-laesning.
--   Verificeres bedst via anon/authenticated REST, ikke her (SQL koerer som postgres).
-- ---------------------------------------------------------------------

ROLLBACK;  -- INGEN aendringer persisteres.
