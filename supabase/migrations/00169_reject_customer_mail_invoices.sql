-- =====================================================================
-- 00169 — DATA: samlet afvisning af kundens egne mails i leverandoerfaktura-koeen (IC13)
--
-- Godkendt af Henrik i chat 2026-09-30 ("markér dem som ikke-faktura / afvist samlet uden at slette original mail
-- eller dokumentation. Ingen gaet."), efter read-only preview (scripts/prod-preview-customer-mail-invoices.ts).
--
-- Regel (deterministisk, samme som isCustomerOwnMail): source='email', mailen er koblet til en kunde, afsender ==
-- kundens e-mail, faktura ulaast, broedtekst-faktura. UNDTAGET: afsender paa eget domaene (eltasolar.dk) — 2 raekker
-- til manuel vurdering. Praecis 18 raekker (eksplicit id-liste); alle har 0 fakturalinjer.
--
-- Effekt: status -> 'rejected' (samme felter som rejectInvoice()), rejected_reason saettes, audit-raekke pr. faktura
-- (action 'rejected', previous/new value). INTET slettes: incoming_emails, vedhaeftninger, audit og raw_text bevares.
-- Ingen triggere med sideeffekter (kun updated_at). Ingen mail, ingen e-conomic.
-- Sikkerhed: hvis bare én af de 18 ikke laengere opfylder reglen (eller er laast), afbrydes HELE transaktionen.
--
-- Rollback (pr. raekke, fra audit-sporet):
--   UPDATE incoming_invoices SET status = a.previous_value->>'status', rejected_at = NULL, rejected_reason = NULL
--   FROM incoming_invoice_audit_log a WHERE a.incoming_invoice_id = incoming_invoices.id AND a.action = 'rejected'
--     AND a.message LIKE 'IC13:%';
-- =====================================================================

BEGIN;

DO $$
DECLARE
  ids uuid[] := ARRAY[
    'd2888d26-bb7d-401c-af4a-c18d1a896e51', '6eec56c9-1e06-47e9-9147-4208ce421efa', 'cf157954-ab80-4438-968a-2849c1f76c24',
    '7842ce4b-b98a-428c-b330-877aeb8a2e70', '1ec8cd54-2485-4faf-984d-6786dff01e30', 'ce3ee7ca-c6d9-4ffe-9a8f-92fe9d44f680',
    'd0adb21c-ab62-4822-9c19-8f7509ad4164', 'a49a8c7e-ef5d-43a4-84bd-16b41dc1b1be', 'af854d29-53ad-456d-be46-14af72eed3fa',
    'fc980d6c-1a18-4e35-800d-26d828c6dbda', '083c9183-689d-4015-8ce5-ce021611f055', '3fd2720a-0756-4f41-8bdf-5ea8e535404a',
    'f2885ba0-f6e6-4c00-b37f-dcf8f9f2a255', 'f6967e57-3412-4f02-b64f-f694997dc1d3', '532b4536-62d3-423a-8a4d-f8e1e09c3901',
    '22c06f4f-1121-4f0e-979a-4401979aefb2', '17de3e1e-0327-4df2-90b3-4a988eb02c76', '8ae36c44-c89c-42dc-99e7-d6683768180e'
  ]::uuid[];
  reason text := 'IC13: ikke leverandørfaktura — afsender er kundens egen e-mail (samlet afvisning godkendt af Henrik 2026-09-30)';
  matching int;
  updated int;
BEGIN
  -- Genverificer reglen for HVER raekke i samme transaktion (ingen gaet, ingen drift siden preview).
  SELECT count(*) INTO matching
  FROM public.incoming_invoices i
  JOIN public.incoming_emails e ON e.id = i.source_email_id
  JOIN public.customers c ON c.id = e.customer_id
  WHERE i.id = ANY(ids)
    AND i.source = 'email'
    AND nullif(trim(c.email), '') IS NOT NULL
    AND lower(trim(e.sender_email)) = lower(trim(c.email))
    AND lower(split_part(e.sender_email, '@', 2)) <> 'eltasolar.dk'
    AND i.status NOT IN ('approved', 'posted', 'rejected', 'cancelled')
    AND i.file_name = 'email-' || i.source_email_id::text || '.txt'
    AND NOT EXISTS (SELECT 1 FROM public.incoming_invoice_lines l WHERE l.incoming_invoice_id = i.id);
  IF matching <> 18 THEN
    RAISE EXCEPTION 'IC13-afvisning afbrudt: % af 18 raekker opfylder reglen', matching;
  END IF;

  INSERT INTO public.incoming_invoice_audit_log (incoming_invoice_id, action, actor_id, previous_value, new_value, ok, message)
  SELECT i.id, 'rejected', NULL, jsonb_build_object('status', i.status, 'parse_status', i.parse_status),
         jsonb_build_object('status', 'rejected', 'reason', reason, 'rule', 'IC13 customer_own_mail'), true, reason
  FROM public.incoming_invoices i WHERE i.id = ANY(ids);

  UPDATE public.incoming_invoices
  SET status = 'rejected', rejected_by = NULL, rejected_at = now(), rejected_reason = reason
  WHERE id = ANY(ids) AND status NOT IN ('approved', 'posted', 'rejected', 'cancelled');
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> 18 THEN
    RAISE EXCEPTION 'IC13-afvisning afbrudt: % af 18 raekker opdateret', updated;
  END IF;
END $$;

COMMIT;
