-- 00196 — UDKAST (IKKE anvendt; SQL vises Henrik før staging, jf. CLAUDE.md)
--
-- Noter på kunde/sag (Henrik 2026-10-07, punkt 5): separate, tidsstemplede noter — customers.notes overskrives ALDRIG.
-- Genbrug: sager har allerede case_notes (case_id, content, kind, created_by, created_at, RLS) → får kun en kilde-kolonne.
-- Kunder har ingen note-model → customer_notes med SAMME form som case_notes (ingen parallel model for sager).
--
-- Rollback:
--   ALTER TABLE public.case_notes DROP COLUMN source;
--   DROP TABLE public.customer_notes;

BEGIN;

-- 1) case_notes: hvor kom noten fra (eksisterende rækker = manual)
ALTER TABLE public.case_notes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'assistant', 'telegram', 'system'));

-- 2) customer_notes: tidsstemplede noter på kunden
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'assistant', 'telegram', 'system')),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON public.customer_notes (customer_id, created_at DESC);

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

-- Læs: som kunden selv (customers SELECT er åben for authenticated)
CREATE POLICY customer_notes_select ON public.customer_notes
  FOR SELECT TO authenticated USING (true);
-- Skriv: samme roller som må redigere kunden (customers_update_role), og kun som sig selv
CREATE POLICY customer_notes_insert ON public.customer_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg') AND created_by = auth.uid());
-- Ret/slet: admin/serviceleder, eller egen note (som case_notes)
CREATE POLICY customer_notes_update ON public.customer_notes
  FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder') OR created_by = auth.uid())
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder') OR created_by = auth.uid());
CREATE POLICY customer_notes_delete ON public.customer_notes
  FOR DELETE TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder') OR created_by = auth.uid());

REVOKE ALL ON public.customer_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
