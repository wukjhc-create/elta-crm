-- =====================================================
-- Migration 00059: Enable public (anon) access to offers
-- Required for /view-offer/[id] public portal to work
-- =====================================================

-- Allow anonymous users to view offers (needed for public offer link)
CREATE POLICY "Anon can view sent/viewed/accepted/rejected offers"
  ON offers FOR SELECT
  TO anon
  USING (status IN ('sent', 'viewed', 'accepted', 'rejected'));

-- Allow anonymous users to update offer status (view/accept/reject)
CREATE POLICY "Anon can update sent/viewed offers"
  ON offers FOR UPDATE
  TO anon
  USING (status IN ('sent', 'viewed'))
  WITH CHECK (status IN ('viewed', 'accepted', 'rejected'));

-- Allow anonymous users to view line items for visible offers
CREATE POLICY "Anon can view offer line items"
  ON offer_line_items FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM offers
    WHERE offers.id = offer_line_items.offer_id
    AND offers.status IN ('sent', 'viewed', 'accepted', 'rejected')
  ));

-- Allow anonymous users to read customers (needed to show customer name on offer)
CREATE POLICY "Anon can view customers linked to visible offers"
  ON customers FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM offers
    WHERE offers.customer_id = customers.id
    AND offers.status IN ('sent', 'viewed', 'accepted', 'rejected')
  ));

-- GRANT statements
GRANT SELECT, UPDATE ON offers TO anon;
GRANT SELECT ON offer_line_items TO anon;
GRANT SELECT ON customers TO anon;
