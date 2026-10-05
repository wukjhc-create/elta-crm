/**
 * Kolonnelister for supplier_products (og viewet v_supplier_products_with_supplier).
 *
 * Migration 00192 fjerner kolonne-SELECT for rollen `authenticated` på kostkolonnerne
 * (se docs/runbooks/rls-cost-columns.md). Bruger-klienten må derfor ALDRIG vælge '*',
 * embedde `supplier_products(*)` eller bruge `.select()` efter insert/update — brug
 * SUPPLIER_PRODUCT_PUBLIC_COLUMNS. Kostkolonner hentes kun via createAdminClient() bag en
 * kost-permission (fx products.view.cost_prices).
 */

export const SUPPLIER_PRODUCT_COST_COLUMNS = [
  'cost_price',
  'margin_percentage',
] as const

export type SupplierProductCostColumn = (typeof SUPPLIER_PRODUCT_COST_COLUMNS)[number]

export const SUPPLIER_PRODUCT_PUBLIC_COLUMNS: string = [
  'id',
  'supplier_id',
  'product_id',
  'supplier_sku',
  'supplier_name',
  'is_available',
  'lead_time_days',
  'last_synced_at',
  'created_at',
  'updated_at',
  'list_price',
  'calculated_sale_price',
  'min_order_quantity',
  'unit',
  'category',
  'sub_category',
  'manufacturer',
  'ean',
  'specifications',
  'status',
  'stock_quantity',
  'weight_kg',
  'dimensions',
  'image_url',
  'data_source',
  'external_id',
  'tags',
].join(', ')
