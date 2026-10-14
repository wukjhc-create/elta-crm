-- 00217: interne beskeder — afsendernavn/-mail kan ikke forfalskes, og modtageren kan kun ændre læst/arkiveret-status.
-- Kommunikations-review 2026-10-09 (#4): INSERT-politikken (00173) tjekker kun from_user_id = auth.uid(); from_name/
-- from_email er fri tekst, og UI'et viser from_name først → en medarbejder kunne via REST sende "fra Henrik (admin)".
-- UPDATE-politikken lader modtageren ændre ALLE kolonner (fx body/from_user_id på en modtaget besked → afsenderens
-- "Sendt"-kopi omskrives, eller beskeden plantes i en tredjeparts "Sendt").
-- Appen skriver ved afsendelse from_user_id/from_name og ved opdatering kun status/read_at/archived_at — kompatibel.
-- Kun 'authenticated' og direkte skrivninger (pg_trigger_depth() = 1); service_role uændret. Ingen dataændring.

BEGIN;

CREATE OR REPLACE FUNCTION public.messages_sender_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- afsenderen er altid den indloggede bruger; navn/mail fra profilen
    SELECT p.full_name, p.email INTO NEW.from_name, NEW.from_email
      FROM public.profiles p WHERE p.id = auth.uid();
    NEW.from_user_id := auth.uid();
    RETURN NEW;
  END IF;

  -- UPDATE: kun status, read_at og archived_at må ændres
  IF (to_jsonb(NEW) - ARRAY['status', 'read_at', 'archived_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'read_at', 'archived_at']) THEN
    RAISE EXCEPTION 'Kun læst/arkiveret-status kan ændres på en besked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_sender_integrity ON public.messages;
CREATE TRIGGER trg_messages_sender_integrity
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_sender_integrity();

COMMIT;
