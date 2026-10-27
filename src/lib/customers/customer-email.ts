/**
 * T-5 (review 2026-10-16): én regel for kunders e-mail ved oprettelse — normalisering, pladsholdere og dublet-opslag.
 * Bruges af insertCustomerWithRetry (server-side værn for ALLE oprettelser) og af kaldere der kobler til en
 * eksisterende kunde. UI-tjekket (checkDuplicateCustomer) er kun bekvemmelighed.
 * Design + migrationsforslag (unikt indeks = BLOCKED_APPROVAL): docs/runbooks/customer-email-duplicates-proposal.md
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const DUPLICATE_EMAIL_CODE = 'DUPLICATE_EMAIL'

export interface ExistingCustomerRef {
  id: string
  company_name: string | null
  customer_number: string | null
  is_active: boolean | null
  /** 00240: false = kunden findes, men er uden for kalderens scope (navn fjernet) — må ikke kobles til af kalderen */
  visible?: boolean
}

/** Trim + små bogstaver (null/undefined → '') */
export function normalizeCustomerEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

/** Tom streng, uden @, eller auto-pladsholder (auto+<nr>@elta-crm.local) — tæller ALDRIG som dublet */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  const e = normalizeCustomerEmail(email)
  return e === '' || !e.includes('@') || /@elta-crm\.local$/i.test(e)
}

/** Dansk fejltekst ved dublet (med kundens nr. og navn) */
export function duplicateEmailMessage(email: string, existing: ExistingCustomerRef): string {
  const who = [existing.customer_number, existing.company_name].filter(Boolean).join(' – ')
  return `Der findes allerede en kunde med e-mailen ${normalizeCustomerEmail(email)}${who ? ` (${who})` : ''}. ` +
    `Vælg "Opret alligevel", hvis det er en anden kunde med samme mail.`
}

/**
 * Find en kunde med samme (normaliserede) e-mail i HELE registeret — aktive foretrækkes. null for pladsholdere.
 * 00240: opslaget er globalt (kontrolleret admin-sti, lib/customers/customer-duplicates.ts), så en kunde uden for
 * kalderens scope stadig findes som dublet; `visible` + fjernet navn afgøres med KALDERENS klient (`db`).
 * NB: ilike ser ikke mellemrum gemt omkring mailen i ældre rækker (lukkes af migrationen/backfill).
 */
export async function findCustomerByEmail(db: Db, email: string | null | undefined, opts: { excludeId?: string } = {}): Promise<ExistingCustomerRef | null> {
  if (isPlaceholderEmail(email)) return null
  const { findCustomerMatchByEmail } = await import('./customer-duplicates')
  return findCustomerMatchByEmail(db, normalizeCustomerEmail(email), { excludeId: opts.excludeId })
}
