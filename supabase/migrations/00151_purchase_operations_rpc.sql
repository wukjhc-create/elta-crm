-- =====================================================
-- Migration: 00151_purchase_operations_rpc.sql
-- Sprint Ø9.7 — Ægte DB-level pagination/aggregering for indkøbsdrift.
-- Date: 2026-06-21
--
-- Erstatter det in-memory JS-scan (scanPurchaseOps, cap=3000 + truncated-flag)
-- i src/lib/actions/purchase-operations.ts med én SQL-funktion der aggregerer,
-- filtrerer, sorterer og paginerer NED I POSTGRES — så /dashboard/
-- purchase-operations skalerer uden loft når porteføljen vokser forbi 3000.
--
--   get_purchase_operations_page(...) RETURNS jsonb
--     { items, total_count, truncated, currency, summary, supplier_options }
--   i ÉT round-trip. Både driftssiden (Ø9.6) og dashboard-widgetten (Ø9.5)
--   kalder den (widget = reason='action_required', sort='priority', limit=20).
--
-- security_invoker (default for funktioner) → funktionen respekterer den
-- kaldende brugers RLS på incoming_invoices/service_cases (ingen escalation).
-- incoming_invoices RLS = FOR ALL TO authenticated USING(true); reel
-- adgangskontrol (incoming_invoices.view + economy.cost_prices) håndhæves
-- app-niveau i server-action FØR kaldet — uændret posture vs i dag.
--
-- GENBRUGTE REGLER (1:1 med scanPurchaseOps — INGEN nye parallelle regler):
--   • ukonverteret linje = converted_case_material_id IS NULL
--       AND converted_case_other_cost_id IS NULL AND converted_at IS NULL
--   • overdue/due_soon KUN for betalingsstatus ('approved','posted'):
--       overdue  = due_date < p_today
--       due_soon = p_today <= due_date <= p_today + 7
--   • kandidat-sag = mindst én faktura m. ukonv. linjer ELLER overdue/due_soon
--   • approved/posted m. ukonv. = drift; received/awaiting m. ukonv. = separat
--   • rejected/cancelled scannes slet ikke (status-IN-filter)
--
-- BEVIDSTE ÆNDRINGER vs scanPurchaseOps (besluttet med bruger):
--   1. p_today sendes fra TS (UTC-dato, new Date().toISOString().slice(0,10))
--      — IKKE CURRENT_DATE — for identisk dag-grænse + testbarhed.
--   2. Søge-blob inkluderer nu invoice_number (var død kode i JS — samlet men
--      aldrig brugt). Fakturanr er dermed faktisk søgbart.
--   3. Scan-cap fjernet helt → truncated altid false (feltet beholdt for
--      type-kompatibilitet). Ægte ubegrænset aggregering.
--
-- BELØB-GATING: p_can_view_amounts (= economy.cost_prices). false →
-- unconverted_amount + total_unconverted_amount = null. Amount-sort falder
-- tilbage til unconverted_line_count (matcher JS `amount ?? line_count`).
-- (TS nuller også beløb defense-in-depth — dobbelt gate.)
--
-- supplier_options returneres USORTERET distinct; server-action sorterer med
-- localeCompare('da') + slice(100) — identisk med nuværende adfærd, ingen
-- ICU-collation-afhængighed.
--
-- INDEKS: idx_incoming_invoices_scan dækker scan-prædikatet (matched_case_id
-- NOT NULL + status-IN, ordnet invoice_date DESC). Linje-opslag dækkes af
-- eksisterende idx_incoming_invoice_lines_parent(incoming_invoice_id,...).
--
-- TEST-SCOPING: p_case_ids uuid[] (default NULL) begrænser scannet til en
-- given mængde sager. I PRODUKTION altid NULL (ingen begrænsning); bruges kun
-- af paritets-/smoke-tests så de kan køre deterministisk mod prod-data på
-- samme måde som de eksisterende smokes (.in('matched_case_id', caseIds)).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS get_purchase_operations_page(date,boolean,text,text,text[],text,integer,integer,uuid[]);
--   DROP INDEX IF EXISTS idx_incoming_invoices_scan;
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_incoming_invoices_scan
  ON incoming_invoices (invoice_date DESC)
  WHERE matched_case_id IS NOT NULL
    AND status IN ('approved','posted','received','awaiting_approval');

CREATE OR REPLACE FUNCTION get_purchase_operations_page(
  p_today            date,
  p_can_view_amounts boolean DEFAULT false,
  p_reason           text    DEFAULT 'all',
  p_supplier         text    DEFAULT NULL,
  p_search_tokens    text[]  DEFAULT NULL,   -- pre-lowercased + LIKE-escaped i TS
  p_sort             text    DEFAULT 'priority',
  p_limit            integer DEFAULT 25,
  p_offset           integer DEFAULT 0,
  p_case_ids         uuid[]  DEFAULT NULL    -- kun test-scoping; NULL i produktion
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH inv AS (
  -- Ét scan af ikke-døde, sags-matchede fakturaer + ukonv.-rollup pr. faktura.
  SELECT
    ii.id,
    ii.status,
    ii.matched_case_id,
    ii.invoice_number,
    ii.invoice_date,
    ii.due_date,
    ii.currency,
    NULLIF(COALESCE(s.name, ii.supplier_name_extracted), '') AS supplier_name,
    (ii.status IN ('approved','posted'))                     AS is_payment,
    COALESCE(lr.unconv_lines, 0)                             AS unconv_lines,
    COALESCE(lr.unconv_amount, 0)                            AS unconv_amount
  FROM incoming_invoices ii
  LEFT JOIN suppliers s ON s.id = ii.supplier_id
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (
        WHERE l.converted_case_material_id IS NULL
          AND l.converted_case_other_cost_id IS NULL
          AND l.converted_at IS NULL
      ) AS unconv_lines,
      COALESCE(sum(l.total_price) FILTER (
        WHERE l.converted_case_material_id IS NULL
          AND l.converted_case_other_cost_id IS NULL
          AND l.converted_at IS NULL
      ), 0) AS unconv_amount
    FROM incoming_invoice_lines l
    WHERE l.incoming_invoice_id = ii.id
  ) lr ON true
  WHERE ii.matched_case_id IS NOT NULL
    AND ii.status IN ('approved','posted','received','awaiting_approval')
    AND (p_case_ids IS NULL OR ii.matched_case_id = ANY(p_case_ids))
),
inv_badge AS (
  SELECT *,
    (is_payment AND due_date IS NOT NULL AND due_date < p_today)                        AS is_overdue,
    (is_payment AND due_date IS NOT NULL AND due_date >= p_today AND due_date <= (p_today + 7)) AS is_due_soon
  FROM inv
),
inv_cand AS (
  SELECT * FROM inv_badge
  WHERE unconv_lines > 0 OR is_overdue OR is_due_soon
),
case_agg AS (
  SELECT
    matched_case_id AS case_id,
    sum(unconv_lines)                                                                  AS unconverted_line_count,
    sum(unconv_amount)                                                                 AS unconverted_amount,
    count(*) FILTER (WHERE is_overdue)                                                 AS overdue_count,
    count(*) FILTER (WHERE is_due_soon)                                                AS due_soon_count,
    count(*) FILTER (WHERE unconv_lines > 0 AND status IN ('received','awaiting_approval')) AS received_awaiting_count,
    bool_or(unconv_lines > 0 AND status = 'approved')                                  AS approved_unconverted,
    bool_or(unconv_lines > 0 AND status = 'posted')                                    AS posted_unconverted,
    max(invoice_date)                                                                  AS latest_invoice_date,
    max(due_date)                                                                      AS latest_due_date,
    min(due_date) FILTER (WHERE is_payment AND due_date IS NOT NULL)                   AS earliest_due_date,
    array_remove(array_agg(DISTINCT supplier_name), NULL)                              AS supplier_names,
    array_remove(array_agg(DISTINCT invoice_number)
                 FILTER (WHERE invoice_number IS NOT NULL AND invoice_number <> ''), NULL) AS invoice_numbers
  FROM inv_cand
  GROUP BY matched_case_id
),
top_inv AS (
  -- Mest presserende faktura pr. sag: overdue(3) > due_soon(2) > andet(1),
  -- tie-break nyeste invoice_date, deterministisk endeligt på id.
  SELECT DISTINCT ON (matched_case_id)
    matched_case_id AS case_id,
    id              AS top_invoice_id
  FROM inv_cand
  ORDER BY matched_case_id,
    (CASE WHEN is_overdue THEN 3 WHEN is_due_soon THEN 2 ELSE 1 END) DESC,
    invoice_date DESC NULLS LAST,
    id DESC
),
case_rows AS (
  SELECT
    ca.*,
    sc.case_number,
    sc.title          AS case_title,
    cust.company_name AS customer_label,
    ti.top_invoice_id,
    (
      (CASE WHEN ca.approved_unconverted THEN ARRAY['approved_unconverted'] ELSE ARRAY[]::text[] END)
      || (CASE WHEN ca.posted_unconverted THEN ARRAY['posted_unconverted'] ELSE ARRAY[]::text[] END)
      || (CASE WHEN ca.overdue_count  > 0 THEN ARRAY['overdue']            ELSE ARRAY[]::text[] END)
      || (CASE WHEN ca.due_soon_count > 0 THEN ARRAY['due_soon']           ELSE ARRAY[]::text[] END)
    ) AS action_reasons
  FROM case_agg ca
  LEFT JOIN service_cases sc ON sc.id = ca.case_id
  LEFT JOIN customers cust   ON cust.id = sc.customer_id     -- disambig: customer_id-FK
  LEFT JOIN top_inv ti       ON ti.case_id = ca.case_id
),
filtered AS (
  SELECT * FROM case_rows cr
  WHERE
    CASE p_reason
      WHEN 'all'                           THEN true
      WHEN 'action_required'               THEN COALESCE(array_length(cr.action_reasons,1),0) > 0
      WHEN 'approved_unconverted'          THEN cr.approved_unconverted
      WHEN 'posted_unconverted'            THEN cr.posted_unconverted
      WHEN 'overdue'                       THEN cr.overdue_count > 0
      WHEN 'due_soon'                      THEN cr.due_soon_count > 0
      WHEN 'received_awaiting_unconverted' THEN cr.received_awaiting_count > 0
      ELSE true
    END
    AND (
      p_supplier IS NULL OR EXISTS (
        SELECT 1 FROM unnest(cr.supplier_names) sn WHERE lower(sn) = lower(p_supplier)
      )
    )
    AND (
      p_search_tokens IS NULL OR cardinality(p_search_tokens) = 0
      OR lower(concat_ws(' ',
            cr.case_number,
            cr.case_title,
            cr.customer_label,
            NULLIF(array_to_string(cr.supplier_names, ' '), ''),
            NULLIF(array_to_string(cr.invoice_numbers, ' '), '')
         )) LIKE ALL (ARRAY(SELECT '%' || t || '%' FROM unnest(p_search_tokens) t))
    )
),
ordered AS (
  SELECT f.*,
    row_number() OVER (
      ORDER BY
        -- priority: severity, overdue?, due_soon?, beløb/linjer, nyeste faktura
        CASE WHEN p_sort='priority' THEN (CASE WHEN f.approved_unconverted OR f.posted_unconverted THEN 1 ELSE 0 END) END DESC NULLS LAST,
        CASE WHEN p_sort='priority' THEN (f.overdue_count  > 0) END DESC NULLS LAST,
        CASE WHEN p_sort='priority' THEN (f.due_soon_count > 0) END DESC NULLS LAST,
        -- delt værdi-nøgle (priority + amount): beløb hvis tilladt, ellers linjeantal
        CASE WHEN p_sort IN ('priority','amount')
             THEN (CASE WHEN p_can_view_amounts THEN round(f.unconverted_amount,2)
                        ELSE f.unconverted_line_count::numeric END) END DESC NULLS LAST,
        CASE WHEN p_sort='priority'       THEN f.latest_invoice_date END DESC NULLS LAST,
        CASE WHEN p_sort='due_date'       THEN f.earliest_due_date   END ASC  NULLS LAST,
        CASE WHEN p_sort='newest_invoice' THEN f.latest_invoice_date END DESC NULLS LAST,
        f.case_id  -- deterministisk endelig tie-break
    ) AS rn
  FROM filtered f
),
cnt AS (SELECT count(*)::int AS total FROM filtered),
eff AS (
  -- Clamp offset til sidste side (matcher JS page>total_pages-clamp).
  SELECT LEAST(
           GREATEST(p_offset, 0),
           GREATEST(0, (GREATEST(1, ceil(total::numeric / GREATEST(p_limit,1)))::int - 1) * p_limit)
         ) AS off
  FROM cnt
),
page_slice AS (
  SELECT o.* FROM ordered o, eff
  WHERE o.rn > eff.off AND o.rn <= eff.off + p_limit
)
SELECT jsonb_build_object(
  'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'case_id', ps.case_id,
      'case_number', ps.case_number,
      'case_title', ps.case_title,
      'customer_label', ps.customer_label,
      'unconverted_line_count', ps.unconverted_line_count,
      'unconverted_amount', CASE WHEN p_can_view_amounts THEN round(ps.unconverted_amount,2) ELSE NULL END,
      'overdue_count', ps.overdue_count,
      'due_soon_count', ps.due_soon_count,
      'received_awaiting_count', ps.received_awaiting_count,
      'latest_invoice_date', ps.latest_invoice_date,
      'latest_due_date', ps.latest_due_date,
      'earliest_due_date', ps.earliest_due_date,
      'action_reasons', to_jsonb(ps.action_reasons),
      'supplier_names', to_jsonb(ps.supplier_names),
      'top_invoice_id', ps.top_invoice_id
    ) ORDER BY ps.rn)
    FROM page_slice ps
  ), '[]'::jsonb),
  'total_count', (SELECT total FROM cnt),
  'truncated', false,
  'currency', COALESCE((SELECT currency FROM inv_cand WHERE currency IS NOT NULL LIMIT 1), 'DKK'),
  'summary', jsonb_build_object(
    'total_cases_with_action', (SELECT count(*) FROM case_rows WHERE COALESCE(array_length(action_reasons,1),0) > 0),
    'total_unconverted_lines', (SELECT COALESCE(sum(unconv_lines),0) FROM inv_cand WHERE unconv_lines > 0),
    'total_unconverted_amount', CASE WHEN p_can_view_amounts
                                     THEN (SELECT round(COALESCE(sum(unconv_amount),0),2) FROM inv_cand WHERE unconv_lines > 0)
                                     ELSE NULL END,
    'overdue_invoice_count', (SELECT count(*) FROM inv_cand WHERE is_overdue),
    'due_soon_invoice_count', (SELECT count(*) FROM inv_cand WHERE is_due_soon),
    'approved_with_unconverted_count', (SELECT count(*) FROM inv_cand WHERE unconv_lines > 0 AND status IN ('approved','posted')),
    'received_awaiting_unconverted_count', (SELECT count(*) FROM inv_cand WHERE unconv_lines > 0 AND status IN ('received','awaiting_approval'))
  ),
  'supplier_options', COALESCE((
    SELECT to_jsonb(array_agg(DISTINCT sn))
    FROM case_rows cr, unnest(cr.supplier_names) sn
    WHERE sn IS NOT NULL AND sn <> ''
  ), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION get_purchase_operations_page(date,boolean,text,text,text[],text,integer,integer,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_purchase_operations_page(date,boolean,text,text,text[],text,integer,integer,uuid[]) TO authenticated, service_role;
