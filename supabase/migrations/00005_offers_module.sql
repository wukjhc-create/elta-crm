-- =====================================================
-- MIGRATION 00005: Offers Module
-- Description: Tables for offer/quote management
-- =====================================================

-- Offers table
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status offer_status NOT NULL DEFAULT 'draft',
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  tax_percentage DECIMAL(5, 2) DEFAULT 25.0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  final_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'DKK',
  valid_until DATE,
  terms_and_conditions TEXT,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_offers_customer_id ON offers(customer_id);
CREATE INDEX idx_offers_lead_id ON offers(lead_id);
CREATE INDEX idx_offers_status ON offers(status);
CREATE INDEX idx_offers_created_at ON offers(created_at DESC);
CREATE INDEX idx_offers_offer_number ON offers(offer_number);
CREATE INDEX idx_offers_created_by ON offers(created_by);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Offer line items
CREATE TABLE offer_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'stk',
  unit_price DECIMAL(12, 2) NOT NULL,
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for offer line items
CREATE INDEX idx_offer_line_items_offer_id ON offer_line_items(offer_id);
CREATE INDEX idx_offer_line_items_position ON offer_line_items(offer_id, position);

-- Function to generate next offer number
CREATE OR REPLACE FUNCTION generate_offer_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  new_number TEXT;
  current_year TEXT;
BEGIN
  current_year := TO_CHAR(NOW(), 'YYYY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(offer_number FROM 10) AS INTEGER)), 0) + 1
  INTO next_num
  FROM offers
  WHERE offer_number LIKE 'TILBUD-' || current_year || '-%';

  new_number := 'TILBUD-' || current_year || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate line item total
CREATE OR REPLACE FUNCTION calculate_line_item_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total = NEW.quantity * NEW.unit_price * (1 - NEW.discount_percentage / 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate line item total
CREATE TRIGGER calculate_line_item_total_trigger
  BEFORE INSERT OR UPDATE ON offer_line_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_line_item_total();

-- Function to update offer totals when line items change
CREATE OR REPLACE FUNCTION update_offer_totals()
RETURNS TRIGGER AS $$
DECLARE
  offer_total DECIMAL(12, 2);
  offer_record RECORD;
BEGIN
  -- Get the offer_id (works for both INSERT and DELETE)
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO offer_record FROM offers WHERE id = OLD.offer_id;
  ELSE
    SELECT * INTO offer_record FROM offers WHERE id = NEW.offer_id;
  END IF;

  -- Calculate total from all line items
  SELECT COALESCE(SUM(total), 0)
  INTO offer_total
  FROM offer_line_items
  WHERE offer_id = offer_record.id;

  -- Update the offer with calculated totals
  UPDATE offers
  SET
    total_amount = offer_total,
    discount_amount = offer_total * (discount_percentage / 100),
    tax_amount = (offer_total - (offer_total * discount_percentage / 100)) * (tax_percentage / 100),
    final_amount = (offer_total - (offer_total * discount_percentage / 100)) + ((offer_total - (offer_total * discount_percentage / 100)) * (tax_percentage / 100))
  WHERE id = offer_record.id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update offer totals when line items change
CREATE TRIGGER update_offer_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON offer_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_offer_totals();
