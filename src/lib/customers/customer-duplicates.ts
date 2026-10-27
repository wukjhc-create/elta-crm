/**
 * 00240 forudsætning 1+2 (Henrik 2026-10-27): kontrolleret, GLOBALT opslag til kundenumre og dubletter. Server-modul
 * (ikke 'use server', aldrig i klientkode — scripts/assert-server-only-helpers.ts).
 *
 * Hvorfor: efter 00240 ser en bruger med begrænset kunde-scope (montør/Elektriker) kun egne + relaterede kunder. Kørte
 * nummer-/dublet-opslaget med brugerens klient, ville
 *   - kundenummeret beregnes ud fra de SYNLIGE numre → samme nummer igen og igen → 23505 på customers_customer_number_key;
 *   - en skjult kunde med samme e-mail ikke findes → stille dublet (der er intet unikt indeks på e-mail).
 * Derfor kører opslaget med admin-klienten, men returnerer kun det kalderen har brug for:
 *   - nummeret (en streng, ingen kundedata);
 *   - et dublet-træf med `visible` = kan kalderen selv se kunden (RLS-opslag med KALDERENS klient — samme semantik som
 *     00240). Er den skjult, nulstilles navnet, og kaldere der ville koble til kunden afviser i stedet (fail-closed).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeLike } from '@/lib/validations/postgrest-filter'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const PREFIX = 'C'
const PADDING = 6

export interface CustomerMatch {
  id: string
  company_name: string | null
  customer_number: string | null
  is_active: boolean | null
  /** false = findes, men ligger uden for kalderens scope — navn er fjernet, må ikke kobles til af kalderen */
  visible: boolean
}

/** Næste ledige C-nummer ud fra HELE registeret (admin-klient). Ikke atomisk — insertCustomerWithRetry genforsøger ved 23505. */
export async function nextCustomerNumberGlobal(): Promise<string> {
  const { data, error } = await createAdminClient()
    .from('customers')
    .select('customer_number')
    .like('customer_number', `${PREFIX}%`)
    .order('customer_number', { ascending: false })
    .limit(20)
  if (error) throw new Error(`kundenummer kunne ikke beregnes: ${error.message}`)
  let maxNum = 0
  for (const row of (data ?? []) as Array<{ customer_number?: string | null }>) {
    const raw = row.customer_number
    if (!raw || raw.length < 2 || raw[0] !== PREFIX) continue
    const suffix = raw.substring(1)
    if (!/^\d+$/.test(suffix)) continue
    const n = parseInt(suffix, 10)
    if (Number.isFinite(n) && n > maxNum) maxNum = n
  }
  return PREFIX + (maxNum + 1).toString().padStart(PADDING, '0')
}

/** Kan kalderens egen klient se kunden? (RLS — efter 00240 = kunde-scope). Admin-klient som kalder ser alt. */
export async function callerCanSeeCustomer(callerDb: Db, customerId: string): Promise<boolean> {
  const { data, error } = await callerDb.from('customers').select('id').eq('id', customerId).maybeSingle()
  if (error) return false
  return !!data
}

async function redact(callerDb: Db, row: Omit<CustomerMatch, 'visible'>): Promise<CustomerMatch> {
  const visible = await callerCanSeeCustomer(callerDb, row.id)
  return visible ? { ...row, visible } : { ...row, company_name: null, visible }
}

/** Kunde med samme (normaliserede) e-mail i HELE registeret — aktive foretrækkes, ældste først. */
export async function findCustomerMatchByEmail(
  callerDb: Db,
  normalizedEmail: string,
  opts: { excludeId?: string; activeOnly?: boolean } = {},
): Promise<CustomerMatch | null> {
  let q = createAdminClient()
    .from('customers')
    .select('id, company_name, customer_number, is_active')
    .ilike('email', escapeLike(normalizedEmail))
  if (opts.excludeId) q = q.neq('id', opts.excludeId)
  if (opts.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`dublet-opslag fejlede: ${error.message}`)
  if (!data) return null
  return redact(callerDb, data as Omit<CustomerMatch, 'visible'>)
}

/** Kunder med samme e-mail ELLER firmanavn (UI-advarsel før oprettelse) — skjulte træf uden navn */
export async function findCustomerMatchesByEmailOrName(
  callerDb: Db,
  orFilter: string,
  opts: { excludeId?: string; limit?: number } = {},
): Promise<CustomerMatch[]> {
  let q = createAdminClient().from('customers').select('id, company_name, customer_number, is_active').or(orFilter)
  if (opts.excludeId) q = q.neq('id', opts.excludeId)
  const { data, error } = await q.order('created_at', { ascending: true }).limit(opts.limit ?? 5)
  if (error) throw new Error(`dublet-opslag fejlede: ${error.message}`)
  const out: CustomerMatch[] = []
  for (const r of (data ?? []) as Array<Omit<CustomerMatch, 'visible'>>) out.push(await redact(callerDb, r))
  return out
}

/**
 * Kapløbs-genkontrol efter et insert (ingen unik e-mail): de ÆLDSTE kunder med mailen i hele registeret (kun id +
 * created_at + nummer — navnet hentes kun hvis kalderen kan se kunden).
 */
export async function oldestCustomersByEmail(callerDb: Db, normalizedEmail: string, limit = 2): Promise<CustomerMatch[]> {
  const { data, error } = await createAdminClient()
    .from('customers')
    .select('id, company_name, customer_number, is_active')
    .ilike('email', escapeLike(normalizedEmail))
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`dublet-genkontrol fejlede: ${error.message}`)
  const out: CustomerMatch[] = []
  for (const r of (data ?? []) as Array<Omit<CustomerMatch, 'visible'>>) out.push(await redact(callerDb, r))
  return out
}

/** Til import-dublettjek: normaliserede nøgler (mail, CVR, telefon) for hele registeret — ingen kunderækker returneres */
export async function loadCustomerDedupeKeys(phoneDigits: (s: string | null) => string): Promise<{ emails: Set<string>; vats: Set<string>; phones: Set<string> }> {
  const admin = createAdminClient()
  const emails = new Set<string>(), vats = new Set<string>(), phones = new Set<string>()
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await admin.from('customers').select('email, vat_number, phone, mobile').order('id').range(from, from + 999)
    if (error) throw new Error('Kunne ikke hente eksisterende kunder')
    for (const c of (data ?? []) as Array<{ email: string | null; vat_number: string | null; phone: string | null; mobile: string | null }>) {
      if (c.email) emails.add(c.email.trim().toLowerCase())
      if (c.vat_number) vats.add(c.vat_number.replace(/^DK\s*/i, '').replace(/\s/g, ''))
      for (const p of [phoneDigits(c.phone), phoneDigits(c.mobile)]) if (p.length >= 8) phones.add(p)
    }
    if (!data || data.length < 1000) break
  }
  return { emails, vats, phones }
}

/** Dansk afvisning når et træf er skjult for kalderen (kobling ville give adgang via bagdøren / skjule dubletten) */
export function hiddenCustomerMessage(email: string, m: Pick<CustomerMatch, 'customer_number'>): string {
  return `Der findes allerede en kunde med e-mailen ${email}${m.customer_number ? ` (${m.customer_number})` : ''}, ` +
    'som du ikke har adgang til. Kontakt kontoret, så kunden kan kobles korrekt.'
}
