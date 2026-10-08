-- 00195 — UDKAST (IKKE anvendt nogen steder; kræver Henriks godkendelse, staging først)
--
-- ELTA Assistant / Telegram (T10): kobling mellem én Telegram-chat og én CRM-bruger. Eneste nye tabel i fase 1 —
-- opgaver/tider/noter ligger i CRM's eksisterende tabeller (CRM = source of truth). Se docs/design/elta-assistant-telegram.md
--
-- Kobling: brugeren genererer en engangskode i CRM (gyldig 10 min); sender "/start <kode>" til botten; webhooken
-- (service_role) sætter telegram_chat_id. Kun aktive profiler. Brugeren kan se/afbryde egen kobling.
--
-- Rollback: DROP TABLE public.assistant_links;

BEGIN;

CREATE TABLE IF NOT EXISTS public.assistant_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel           text NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram')),
  telegram_chat_id  bigint UNIQUE,
  link_code_hash    text,
  link_code_expires_at timestamptz,
  linked_at         timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, channel)
);

ALTER TABLE public.assistant_links ENABLE ROW LEVEL SECURITY;

-- Brugeren ser egen kobling (status i profilen); oprettelse/kobling/afbrydelse sker via server-actions (service_role)
CREATE POLICY assistant_links_select_own ON public.assistant_links
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

REVOKE ALL ON public.assistant_links FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, profile_id, channel, linked_at, revoked_at, created_at) ON public.assistant_links TO authenticated;
GRANT ALL ON public.assistant_links TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
