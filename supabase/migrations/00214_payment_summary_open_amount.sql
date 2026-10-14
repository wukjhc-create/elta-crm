-- 00214: kundens betalingsoversigt (v_customer_payment_summary → v_customers_with_payment_summary) bruger ÅBENT beløb.
-- Rapport-review 2026-10-09 (#1): outstanding_total/overdue_total summerede fuldt final_amount for sendte fakturaer —
-- delbetalte og delkrediterede fakturaer talte med fuldt beløb, og fuldt dækkede (åbent 0) talte som forfaldne i
-- kundelisten og i den ugentlige betalingsrapport. Samme regel som appen (lib/invoices/open-amount.ts):
--   åbent = max(0, final_amount − amount_paid − sendte/betalte, ikke-annullerede kreditnotaer mod fakturaen)
-- "I dag" = dansk kalenderdag (før CURRENT_DATE i databasens UTC).
-- Kolonnenavne/-typer uændrede (CREATE OR REPLACE) → v_customers_with_payment_summary virker uændret.
-- security_invoker bevares (RLS på invoices afgrænser stadig). Ingen dataændring.

BEGIN;

CREATE OR REPLACE VIEW public.v_customer_payment_summary
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
  CASE
    WHEN t.overdue_count > 0 THEN 3
    WHEN t.paid_invoice_count < 2 THEN 0
    WHEN t.average_days_late > 7 THEN 2
    ELSE 1
  END AS health_rank
FROM (
  SELECT
    i.customer_id,
    COALESCE(SUM(o.open_amount) FILTER (
      WHERE i.status = 'sent' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit'), 0) AS outstanding_total,
    COALESCE(SUM(o.open_amount) FILTER (
      WHERE i.status = 'sent' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit'
        AND i.due_date::date < (now() AT TIME ZONE 'Europe/Copenhagen')::date), 0) AS overdue_total,
    COUNT(*) FILTER (
      WHERE i.status = 'sent' AND i.voided_at IS NULL
        AND COALESCE(i.invoice_type, 'standard') <> 'credit'
        AND i.due_date::date < (now() AT TIME ZONE 'Europe/Copenhagen')::date
        AND o.open_amount > 0) AS overdue_count,
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
  FROM public.invoices i
  LEFT JOIN LATERAL (
    SELECT GREATEST(0,
      COALESCE(i.final_amount, 0) - COALESCE(i.amount_paid, 0)
      - COALESCE((
          SELECT SUM(ABS(c.final_amount))
          FROM public.invoices c
          WHERE c.credit_of_invoice_id = i.id
            AND c.invoice_type = 'credit'
            AND c.status IN ('sent', 'paid')
            AND c.voided_at IS NULL
        ), 0)
    ) AS open_amount
  ) o ON true
  WHERE i.customer_id IS NOT NULL
  GROUP BY i.customer_id
) t;

COMMIT;
