-- 00197 — UDKAST (IKKE anvendt; SQL vises Henrik før staging, jf. CLAUDE.md)
--
-- Personlige påmindelser/opgaver UDEN kunde (Henrik 2026-10-07, punkt 4): "Mind mig om at bestille arbejdstøj fredag
-- kl. 9". Undersøgt: CRM har ingen generel opgave-model (customer_tasks kræver kunde og må ikke gøres nullable;
-- project_tasks = gammel projektmodel; agent_tasks = intern agent-motor). Derfor en lille, generel CRM-model, der
-- bruges direkte i CRM (Opgaver/kalender) OG af assistenten — ikke Telegram-specialdata.
--
-- Rollback: DROP TABLE public.personal_reminders;

BEGIN;

CREATE TABLE IF NOT EXISTS public.personal_reminders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  notes        text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  due_at       timestamptz NOT NULL,
  reminder_at  timestamptz,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  completed_at timestamptz,
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'assistant', 'telegram')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personal_reminders_owner_due ON public.personal_reminders (owner_id, due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_personal_reminders_reminder ON public.personal_reminders (reminder_at) WHERE status = 'pending';

ALTER TABLE public.personal_reminders ENABLE ROW LEVEL SECURITY;

-- Personligt: kun ejeren ser og ændrer sine egne (heller ikke admin — det er en privat huskeliste)
CREATE POLICY personal_reminders_own ON public.personal_reminders
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

REVOKE ALL ON public.personal_reminders FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_reminders TO authenticated;
GRANT ALL ON public.personal_reminders TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
