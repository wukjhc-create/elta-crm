/**
 * Kolonnelister for product_catalog (kost-lockdown bølge 2b, migration 00201): `cost_price` har ikke kolonne-SELECT
 * for `authenticated` → bruger-klienten vælger altid den offentlige liste; kost læses med admin-klienten bag en gate.
 * Bevidst IKKE 'use server'.
 */
export const PRODUCT_PUBLIC_COLUMNS =
  'id, sku, name, description, category_id, list_price, unit, specifications, is_active, created_by, created_at, updated_at'

/** Tilladte sorteringskolonner for bruger-klienten (aldrig kostpris — ellers afsløres kost-rækkefølgen) */
export const PRODUCT_SORT_COLUMNS = ['name', 'sku', 'list_price', 'created_at', 'updated_at'] as const
