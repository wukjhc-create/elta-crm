-- =====================================================
-- Migration 00088 hot-fix: profit snapshot trigger timing.
--
-- Phase 7.1's create_invoice_from_work_order RPC INSERTs an invoice
-- row with total_amount=0, fills line items, then UPDATEs the totals.
-- The original AFTER INSERT trigger fired too early — it snapshotted
-- revenue=0.
--
-- Fix: re-attach to fire on INSERT *or* UPDATE OF total_amount,
-- guarded so we only snapshot once per "totals materialised" event.
-- =====================================================

DROP TRIGGER IF EXISTS trg_invoices_snapshot_profit ON invoices;

CREATE OR REPLACE FUNCTION trg_invoice_snapshot_profit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.work_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.total_amount, 0) <= 0 THEN
    -- Wait for the totals to be filled in.
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.total_amount, 0) IS NOT DISTINCT FROM COALESCE(NEW.total_amount, 0)
     AND COALESCE(OLD.work_order_id::text, '') = COALESCE(NEW.work_order_id::text, '') THEN
    -- Nothing meaningful changed — don't double-snapshot.
    RETURN NEW;
  END IF;

  PERFORM snapshot_work_order_profit(NEW.work_order_id, 'invoice_created');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoices_snapshot_profit
  AFTER INSERT OR UPDATE OF total_amount, work_order_id ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_invoice_snapshot_profit();
