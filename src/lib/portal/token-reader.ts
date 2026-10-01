/**
 * P-009 laese-side (migration 00175): selve token-kolonnen i portal_access_tokens og partner_access_tokens er skjult
 * for bruger-sessionen — et token giver fuld kundeadgang (fx underskrift af tilbud), og tidligere kunne enhver
 * indlogget laese alle tokens via REST. Gatede server-actions der legitimt bygger portal-links laeser tokenet med
 * service-role via denne hjaelper. Bevidst IKKE 'use server' (maa aldrig blive et offentligt endpoint).
 */
export const PORTAL_TOKEN_PUBLIC_COLUMNS = 'id, customer_id, email, is_active, expires_at, last_accessed_at, created_by, created_at'
export const PARTNER_TOKEN_PUBLIC_COLUMNS = 'id, partner_customer_id, email, is_active, expires_at, last_accessed_at, created_by, created_at'

/** Service-role-klient til token-laesning. Kald KUN efter actionens egen rettighedskontrol. */
export async function secretTokenReader() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}

/**
 * Samme service-role-laeser til andre skjulte hemmelighedskolonner (fx integrations.api_key m.fl., migration 00176).
 * Kald KUN efter actionens egen rettighedskontrol; vaerdier returneres aldrig umaskerede til klienten.
 */
export const secretColumnReader = secretTokenReader
