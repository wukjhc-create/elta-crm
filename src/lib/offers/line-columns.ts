/**
 * Kolonnelister for offer_line_items.
 *
 * Migration 00192 fjerner kolonne-SELECT for rollen `authenticated` på kostkolonnerne
 * (se docs/runbooks/rls-cost-columns.md). Bruger-klienten må derfor ALDRIG vælge '*',
 * embedde `offer_line_items(*)` eller bruge `.select()` efter insert/update — brug
 * OFFER_LINE_PUBLIC_COLUMNS. Kostkolonner hentes kun via createAdminClient() bag en
 * kost-permission (fx offers.view.cost_prices).
 */

export const OFFER_LINE_COST_COLUMNS = [
  'cost_price',
  'supplier_cost_price_at_creation',
  'supplier_margin_applied',
  'margin_percentage',
] as const

export type OfferLineCostColumn = (typeof OFFER_LINE_COST_COLUMNS)[number]

export const OFFER_LINE_PUBLIC_COLUMNS: string = [
  'id',
  'offer_id',
  'position',
  'description',
  'quantity',
  'unit',
  'unit_price',
  'discount_percentage',
  'total',
  'created_at',
  'line_type',
  'product_id',
  'calculation_id',
  'section',
  'notes',
  'supplier_product_id',
  'supplier_name_at_creation',
  'image_url',
  'material_id',
  'sale_price',
].join(', ')
