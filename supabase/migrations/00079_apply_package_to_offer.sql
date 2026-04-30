-- =====================================================
-- Migration 00079: apply_package_to_offer RPC
--
-- Single-transaction insert of an offer_packages bundle into
-- offer_line_items. All-or-nothing: any failure raises and rolls back
-- every line for that call.
--
-- Pricing is computed centrally via calculate_sale_price() +
-- get_effective_margin() — no hardcoded multipliers anywhere in code.
-- Caller passes resolved supplier rows (cost, supplier_id, etc.); the
-- function does NOT do supplier lookup (that stays in TS).
-- =====================================================

CREATE OR REPLACE FUNCTION apply_package_to_offer(
  p_offer_id    UUID,
  p_package_id  UUID,
  p_customer_id UUID,
  p_lines       JSONB     -- array of objects, see schema below
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pkg_slug   TEXT;
  v_start_pos  INTEGER;
  v_inserted   INTEGER := 0;
BEGIN
  -- Lock the package row so concurrent applies see consistent slug + state.
  SELECT slug INTO v_pkg_slug
    FROM offer_packages
   WHERE id = p_package_id AND is_active = true
   FOR SHARE;

  IF v_pkg_slug IS NULL THEN
    RAISE EXCEPTION 'apply_package_to_offer: package % not found or inactive', p_package_id;
  END IF;

  -- Find next position so we coexist with manually edited lines.
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_start_pos
    FROM offer_line_items
   WHERE offer_id = p_offer_id;

  -- Single batch insert. jsonb_to_recordset gives us a typed projection;
  -- get_effective_margin + calculate_sale_price are evaluated once per row.
  WITH input AS (
    SELECT
      row_number() OVER ()                            AS rn,
      x.material_id,
      x.supplier_id,
      x.supplier_product_id,
      x.supplier_name,
      x.category,
      x.sub_category,
      x.section,
      x.description,
      x.unit,
      GREATEST(COALESCE(x.quantity, 0), 0)::numeric   AS quantity,
      GREATEST(COALESCE(x.cost_price, 0), 0)::numeric AS cost_price,
      x.notes
    FROM jsonb_to_recordset(p_lines) AS x(
      material_id         UUID,
      supplier_id         UUID,
      supplier_product_id UUID,
      supplier_name       TEXT,
      category            TEXT,
      sub_category        TEXT,
      section             TEXT,
      description         TEXT,
      unit                TEXT,
      quantity            NUMERIC,
      cost_price          NUMERIC,
      notes               TEXT
    )
  ),
  priced AS (
    SELECT
      i.*,
      (v_start_pos + i.rn - 1)::int AS position,
      m.margin_percentage           AS margin_pct,
      calculate_sale_price(
        i.cost_price,
        i.supplier_id,
        i.supplier_product_id,
        i.category,
        i.sub_category,
        p_customer_id
      ) AS sale_price
    FROM input i
    LEFT JOIN LATERAL get_effective_margin(
      i.supplier_id,
      i.supplier_product_id,
      i.category,
      i.sub_category,
      p_customer_id
    ) m ON TRUE
  ),
  ins AS (
    INSERT INTO offer_line_items (
      offer_id, position, section, line_type, description,
      quantity, unit,
      cost_price, margin_percentage, sale_price, unit_price,
      supplier_margin_applied, discount_percentage, total,
      material_id, supplier_product_id,
      supplier_cost_price_at_creation, supplier_name_at_creation,
      notes
    )
    SELECT
      p_offer_id,
      p.position,
      p.section,
      'product',
      p.description,
      p.quantity,
      COALESCE(p.unit, 'stk'),
      p.cost_price,
      COALESCE(p.margin_pct, 0),
      p.sale_price,
      p.sale_price,                       -- legacy mirror
      COALESCE(p.margin_pct, 0),          -- legacy mirror
      0,
      ROUND((p.sale_price * p.quantity)::numeric, 2),
      p.material_id,
      p.supplier_product_id,
      p.cost_price,
      p.supplier_name,
      COALESCE(p.notes, 'Package: ' || v_pkg_slug)
    FROM priced p
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_package_to_offer(UUID, UUID, UUID, JSONB) TO authenticated, service_role;
