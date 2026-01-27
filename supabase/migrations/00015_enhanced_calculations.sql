-- =====================================================
-- 00015_enhanced_calculations.sql
-- Enhanced Calculation Engine with VAT, Profit Margin,
-- Contribution Margin, Labor, Materials, and ROI
-- =====================================================

-- =====================================================
-- 1. ADD COLUMNS TO CALCULATIONS TABLE
-- =====================================================

-- Mode: standard, solar, electrician
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  calculation_mode TEXT DEFAULT 'standard';

-- Cost breakdown by category
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  total_materials_cost DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  total_labor_cost DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  total_other_costs DECIMAL(12, 2) DEFAULT 0;

-- Contribution margin
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  total_variable_costs DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  total_fixed_costs DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  contribution_margin DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  contribution_margin_ratio DECIMAL(5, 2) DEFAULT 0;

-- Profit tracking
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  gross_profit DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  gross_profit_margin DECIMAL(5, 2) DEFAULT 0;

-- Electrician mode settings
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  default_hourly_rate DECIMAL(12, 2) DEFAULT 450;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  materials_markup_percentage DECIMAL(5, 2) DEFAULT 25;

-- Offer display options
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  show_cost_breakdown BOOLEAN DEFAULT false;
ALTER TABLE calculations ADD COLUMN IF NOT EXISTS
  group_by_section BOOLEAN DEFAULT true;

-- =====================================================
-- 2. ADD COLUMNS TO CALCULATION_ROWS TABLE
-- =====================================================

-- Cost categorization
ALTER TABLE calculation_rows ADD COLUMN IF NOT EXISTS
  cost_category TEXT DEFAULT 'variable';

-- Labor-specific fields
ALTER TABLE calculation_rows ADD COLUMN IF NOT EXISTS
  hours DECIMAL(10, 2);
ALTER TABLE calculation_rows ADD COLUMN IF NOT EXISTS
  hourly_rate DECIMAL(12, 2);

-- Profit per row
ALTER TABLE calculation_rows ADD COLUMN IF NOT EXISTS
  profit_amount DECIMAL(12, 2) DEFAULT 0;

-- =====================================================
-- 3. ENHANCED TRIGGER FUNCTION FOR ROW TOTAL
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_calculation_row_total()
RETURNS TRIGGER AS $$
BEGIN
  -- If hours and hourly_rate are set, calculate labor total first
  IF NEW.hours IS NOT NULL AND NEW.hourly_rate IS NOT NULL THEN
    NEW.sale_price := NEW.hourly_rate;
    NEW.quantity := NEW.hours;
    NEW.unit := 'timer';
  END IF;

  -- Calculate total: quantity * sale_price * (1 - discount/100)
  NEW.total := NEW.quantity * NEW.sale_price * (1 - COALESCE(NEW.discount_percentage, 0) / 100);

  -- Calculate margin if cost_price is set
  IF NEW.cost_price IS NOT NULL AND NEW.cost_price > 0 THEN
    NEW.margin_percentage := ((NEW.sale_price - NEW.cost_price) / NEW.cost_price) * 100;
  END IF;

  -- Calculate profit amount
  NEW.profit_amount := NEW.total - (COALESCE(NEW.cost_price, 0) * NEW.quantity);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. ENHANCED TRIGGER FUNCTION FOR CALCULATION TOTALS
-- =====================================================

CREATE OR REPLACE FUNCTION update_calculation_totals()
RETURNS TRIGGER AS $$
DECLARE
  calc_id UUID;
  v_subtotal DECIMAL(12, 2);
  v_materials DECIMAL(12, 2);
  v_labor DECIMAL(12, 2);
  v_other DECIMAL(12, 2);
  v_variable DECIMAL(12, 2);
  v_fixed DECIMAL(12, 2);
  v_total_cost DECIMAL(12, 2);
  v_cm DECIMAL(12, 2);
  v_cm_ratio DECIMAL(5, 2);
  v_gross_profit DECIMAL(12, 2);
  v_gross_margin DECIMAL(5, 2);
  v_margin_pct DECIMAL(5, 2);
  v_discount_pct DECIMAL(5, 2);
  v_tax_pct DECIMAL(5, 2);
  v_margin_amt DECIMAL(12, 2);
  v_discount_amt DECIMAL(12, 2);
  v_pre_discount DECIMAL(12, 2);
  v_pre_tax DECIMAL(12, 2);
  v_tax_amt DECIMAL(12, 2);
  v_final DECIMAL(12, 2);
BEGIN
  -- Get calculation ID
  IF TG_OP = 'DELETE' THEN
    calc_id := OLD.calculation_id;
  ELSE
    calc_id := NEW.calculation_id;
  END IF;

  -- Get calculation settings
  SELECT margin_percentage, discount_percentage, tax_percentage
  INTO v_margin_pct, v_discount_pct, v_tax_pct
  FROM calculations WHERE id = calc_id;

  -- Aggregate costs by section/category
  SELECT
    COALESCE(SUM(total), 0),
    COALESCE(SUM(CASE WHEN section = 'Materialer' THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN section IN ('Arbejdslon', 'Arbejdsløn') THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN section NOT IN ('Materialer', 'Arbejdslon', 'Arbejdsløn') THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cost_category = 'variable' OR cost_category IS NULL THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cost_category = 'fixed' THEN COALESCE(cost_price, 0) * quantity ELSE 0 END), 0),
    COALESCE(SUM(COALESCE(cost_price, 0) * quantity), 0)
  INTO v_subtotal, v_materials, v_labor, v_other, v_variable, v_fixed, v_total_cost
  FROM calculation_rows WHERE calculation_id = calc_id;

  -- Contribution margin = Revenue - Variable costs
  v_cm := v_subtotal - v_variable;
  v_cm_ratio := CASE WHEN v_subtotal > 0 THEN (v_cm / v_subtotal) * 100 ELSE 0 END;

  -- Gross profit = Revenue - Total costs
  v_gross_profit := v_subtotal - v_total_cost;
  v_gross_margin := CASE WHEN v_subtotal > 0 THEN (v_gross_profit / v_subtotal) * 100 ELSE 0 END;

  -- Apply margin on subtotal
  v_margin_amt := v_subtotal * COALESCE(v_margin_pct, 0) / 100;
  v_pre_discount := v_subtotal + v_margin_amt;

  -- Apply discount after margin
  v_discount_amt := v_pre_discount * COALESCE(v_discount_pct, 0) / 100;
  v_pre_tax := v_pre_discount - v_discount_amt;

  -- Calculate tax
  v_tax_amt := v_pre_tax * COALESCE(v_tax_pct, 25) / 100;

  -- Final amount
  v_final := v_pre_tax + v_tax_amt;

  -- Update calculation
  UPDATE calculations SET
    subtotal = v_subtotal,
    total_materials_cost = v_materials,
    total_labor_cost = v_labor,
    total_other_costs = v_other,
    total_variable_costs = v_variable,
    total_fixed_costs = v_fixed,
    contribution_margin = v_cm,
    contribution_margin_ratio = v_cm_ratio,
    gross_profit = v_gross_profit,
    gross_profit_margin = v_gross_margin,
    margin_amount = v_margin_amt,
    discount_amount = v_discount_amt,
    tax_amount = v_tax_amt,
    final_amount = v_final,
    updated_at = NOW()
  WHERE id = calc_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. ADD INDEXES FOR NEW COLUMNS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_calculations_calculation_mode ON calculations(calculation_mode);
CREATE INDEX IF NOT EXISTS idx_calculation_rows_cost_category ON calculation_rows(cost_category);

-- =====================================================
-- 6. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN calculations.calculation_mode IS 'Mode: standard, solar, electrician';
COMMENT ON COLUMN calculations.total_materials_cost IS 'Sum of all material costs';
COMMENT ON COLUMN calculations.total_labor_cost IS 'Sum of all labor costs';
COMMENT ON COLUMN calculations.total_other_costs IS 'Sum of all other costs (transport, etc.)';
COMMENT ON COLUMN calculations.total_variable_costs IS 'Sum of all variable costs';
COMMENT ON COLUMN calculations.total_fixed_costs IS 'Sum of all fixed costs (overhead, etc.)';
COMMENT ON COLUMN calculations.contribution_margin IS 'Revenue minus variable costs';
COMMENT ON COLUMN calculations.contribution_margin_ratio IS 'Contribution margin as percentage of revenue';
COMMENT ON COLUMN calculations.gross_profit IS 'Revenue minus all costs';
COMMENT ON COLUMN calculations.gross_profit_margin IS 'Gross profit as percentage of revenue';
COMMENT ON COLUMN calculations.default_hourly_rate IS 'Default hourly rate for labor (electrician mode)';
COMMENT ON COLUMN calculations.materials_markup_percentage IS 'Default markup percentage for materials (electrician mode)';
COMMENT ON COLUMN calculations.show_cost_breakdown IS 'Whether to show cost breakdown on offer';
COMMENT ON COLUMN calculations.group_by_section IS 'Whether to group rows by section on offer';

COMMENT ON COLUMN calculation_rows.cost_category IS 'Cost category: variable or fixed';
COMMENT ON COLUMN calculation_rows.hours IS 'Number of hours for labor rows';
COMMENT ON COLUMN calculation_rows.hourly_rate IS 'Hourly rate for labor rows';
COMMENT ON COLUMN calculation_rows.profit_amount IS 'Profit amount for this row (total - cost)';
