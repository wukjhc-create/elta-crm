-- =====================================================
-- Migration: 00146_customer_payment_summary.sql
-- Sprint Ø4.9 — Cost-free SQL-view for kundebetalingsaggregat.
-- Date: 2026-06-14
--
-- Fjerner JS-aggregatet (limit 20000) fra betalingsflowet. To almindelige
-- views (live data, ingen materialized — data skal altid være aktuel):
--   v_customer_payment_summary       — metrics + status pr. kunde
--   v_customers_with_payment_summary — customers JOIN summary (queryable
--                                      direkte: søgning/filter/sort/paginering)
--
-- security_invoker = true → viewet respekterer den kaldende brugers RLS på
-- invoices/customers (ingen privilege-escalation).
--
-- COST-FREE: kun salgs/faktura-beløb + datoer. INGEN cost/margin/DB/
-- medarbejderkost/cost_amount/total_cost/dækningsgrad/real_hourly_cost.
--
-- Reglerne matcher payment-health.ts (Ø4.4):
--   forfalden   = status='sent', ikke annulleret, ikke kreditnota, due_date < i dag
--   udestående  = status='sent', ikke annulleret, ikke kreditnota
--   no_data     = under 2 betalte fakturaer (m. forfaldsdato)
--   late_payer  = gns. > 7 dage efter forfald
--   on_time     = gns. ≤ 7 dage, ingen forfaldne
--   requires_attention = forfaldne fakturaer lige nu
--
-- Indeks: invoices har allerede idx_invoices_customer (customer_id),
-- idx_invoices_due_status (status,due_date WHERE sent), idx_invoices_status,
-- idx_invoices_voided, idx_invoices_created. Disse dækker view-aggregatets
-- adgangsmønstre — ingen nye indeks nødvendige.
--
-- Rollback:
--   DROP VIEW IF EXISTS v_customers_with_payment_summary;
--   DROP VIEW IF EXISTS v_customer_payment_summary;
-- =====================================================

DROP VIEW IF EXISTS v_customers_with_payment_summary;
DROP VIEW IF EXISTS v_customer_payment_summary;

CREATE VIEW v_customer_payment_summary
WITH (security_invoker = true) AS
SELECT
  t.customer_id,
  t.outstanding_total,
  t.overdue_total,
  t.overdue_count,
  t.draft_count,
  t.paid_invoice_count,
  t.paid_total,
  t.latest_invoice_at,
  t.latest_paid_at,
  t.average_days_late,
  CASE
    WHEN t.overdue_count > 0 THEN 'requires_attention'
    WHEN t.paid_invoice_count < 2 THEN 'no_data'
    WHEN t.average_days_late > 7 THEN 'late_payer'
    ELSE 'on_time'
  END AS payment_status,
  -- Rang til "betalingsadfærd (værst først)"-sortering (matcher HEALTH_RANK i TS).
  CASE
    WHEN t.overdue_count > 0 THEN 3
    WHEN t.paid_invoice_count < 2 THEN 0
    WHEN t.average_days_late > 7 THEN 2
    ELSE 1
  END AS health_rank
FROM (
  SELECT
    i.customer_id,
    COALESCE(SUM(i.final_amount) FILTER (
      WHERE i.status = 'sent' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit'), 0) AS outstanding_total,
    COALESCE(SUM(i.final_amount) FILTER (
      WHERE i.status = 'sent' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit'
        AND i.due_date::date < CURRENT_DATE), 0) AS overdue_total,
    COUNT(*) FILTER (
      WHERE i.status = 'sent' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit'
        AND i.due_date::date < CURRENT_DATE) AS overdue_count,
    COUNT(*) FILTER (
      WHERE i.status = 'draft' AND i.voided_at IS NULL) AS draft_count,
    COUNT(*) FILTER (
      WHERE i.status = 'paid' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit'
        AND i.due_date IS NOT NULL) AS paid_invoice_count,
    COALESCE(SUM(i.final_amount) FILTER (
      WHERE i.status = 'paid' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit'), 0) AS paid_total,
    MAX(i.sent_at) AS latest_invoice_at,
    MAX(i.paid_at) FILTER (
      WHERE i.status = 'paid' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit') AS latest_paid_at,
    ROUND(AVG((i.paid_at::date - i.due_date::date)) FILTER (
      WHERE i.status = 'paid' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit'
        AND i.due_date IS NOT NULL))::int AS average_days_late
  FROM invoices i
  WHERE i.customer_id IS NOT NULL
  GROUP BY i.customer_id
) t;

CREATE VIEW v_customers_with_payment_summary
WITH (security_invoker = true) AS
SELECT
  c.*,
  COALESCE(s.outstanding_total, 0)     AS outstanding_total,
  COALESCE(s.overdue_total, 0)         AS overdue_total,
  COALESCE(s.overdue_count, 0)         AS overdue_count,
  COALESCE(s.draft_count, 0)           AS draft_count,
  COALESCE(s.paid_invoice_count, 0)    AS paid_invoice_count,
  COALESCE(s.paid_total, 0)            AS paid_total,
  s.latest_invoice_at,
  s.latest_paid_at,
  s.average_days_late,
  COALESCE(s.payment_status, 'no_data') AS payment_status,
  COALESCE(s.health_rank, 0)            AS health_rank
FROM customers c
LEFT JOIN v_customer_payment_summary s ON s.customer_id = c.id;

GRANT SELECT ON v_customer_payment_summary TO authenticated;
GRANT SELECT ON v_customers_with_payment_summary TO authenticated;

COMMENT ON VIEW v_customer_payment_summary IS
  'Sprint Ø4.9 — cost-free betalingsaggregat pr. kunde (matcher payment-health.ts). Ingen kost/margin.';
COMMENT ON VIEW v_customers_with_payment_summary IS
  'Sprint Ø4.9 — customers JOIN betalingssummary; queryable direkte (søgning/filter/sort/paginering). Cost-free.';
