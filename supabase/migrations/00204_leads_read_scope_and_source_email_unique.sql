-- 00204 — Leads: rolle-scopet læsning + én lead pr. kildemail (leads-review 2026-10-08, #6 og #8).
-- STATUS: UDKAST — BLOCKED_APPROVAL. Ikke kørt på staging eller prod.
--
-- #8: prod har "Users can view leads" / "Users can view lead activities" = USING (true) for authenticated
--     (scripts/prod-table-select-policies.ts leads lead_activities) → bogholderi og 'ingen_adgang' kan læse alle leads
--     via REST. Appen gater nu på leads.view (admin/serviceleder/montør/salg); politikken spejler den.
-- #6: to samtidige "Opret lead fra mail" kunne lave to leads for samme mail. Appen rydder op efter sig (ældste
--     vinder), indekset gør det umuligt. Prod-pre 2026-10-08: 5 leads, 0 med source_email_id, 0 dublet-grupper
--     (scripts/prod-leads-source-email-dupes.ts) → indekset kan oprettes uden dataændring.
--
-- Pre:  npx tsx scripts/prod-leads-source-email-dupes.ts   (dup_groups SKAL være 0)
--       npx tsx scripts/prod-table-select-policies.ts leads lead_activities
-- Post: samme to scripts (politikkerne *_select_role, indekset findes) + persona-tjek bogholderi = 0 rækker.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.uq_leads_source_email_id;
--   DROP POLICY IF EXISTS leads_select_role ON public.leads;
--   DROP POLICY IF EXISTS lead_activities_select_role ON public.lead_activities;
--   CREATE POLICY "Users can view leads" ON public.leads FOR SELECT TO authenticated USING (true);
--   CREATE POLICY "Users can view lead activities" ON public.lead_activities FOR SELECT TO authenticated USING (true);

BEGIN;

DROP POLICY IF EXISTS "Users can view leads" ON public.leads;
DROP POLICY IF EXISTS leads_select_role ON public.leads;
CREATE POLICY leads_select_role ON public.leads FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg'));

DROP POLICY IF EXISTS "Users can view lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS lead_activities_select_role ON public.lead_activities;
CREATE POLICY lead_activities_select_role ON public.lead_activities FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_source_email_id
  ON public.leads ((custom_fields->>'source_email_id'))
  WHERE custom_fields->>'source_email_id' IS NOT NULL;

COMMIT;
