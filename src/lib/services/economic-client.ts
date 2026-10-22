/**
 * e-conomic REST client (Phase 5.4).
 *
 * Auth: dual-header. `api_token` is the integration's app-secret (issued
 * to the developer); `agreement_grant_token` is per e-conomic agreement
 * (issued by the customer when they install the app). Both must be
 * present and `active=true` for any sync to occur.
 *
 * All public functions:
 *   - return EconomicResult (never throw — caller decides how to react)
 *   - log every attempt to accounting_sync_log
 *   - are idempotent: a second call with the same input returns the
 *     existing external_id without re-posting
 *   - skip cleanly with reason='ECONOMIC_NOT_CONFIGURED' when
 *     credentials are missing
 */

import { isPlaceholderEmail } from '@/lib/customers/customer-email'
import { economicPushEnabled, economicRequestAllowed, ECONOMIC_PUSH_DISABLED_CODE } from '@/lib/accounting/economic-push-flag'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { encrypt, decrypt } from '@/lib/utils/encryption'
import { buildEconomicInvoiceDraft, type EconomicInvoiceDraft } from '@/lib/economic/invoice-draft'
import { buildEconomicSupplierInvoiceDraft, type SupplierInvoiceDraft } from '@/lib/economic/supplier-invoice-draft'
import { buildEconomicPaymentEntry } from '@/lib/economic/payment-entry'
import type {
  AccountingAction,
  AccountingEntityType,
  AccountingSettings,
  AccountingStatus,
  EconomicConfig,
  EconomicResult,
} from '@/types/accounting.types'

const ECONOMIC_BASE = 'https://restapi.e-conomic.com'
const PROVIDER = 'economic' as const
/** Krav-markør i invoices.external_invoice_id mens en eksport kører (pending-<ms>); ældre end 15 min = afbrudt */
const EXPORT_CLAIM_PREFIX = 'pending-'
const EXPORT_CLAIM_STALE_MS = 15 * 60_000

// =====================================================
// Secret-at-rest (Ø6.2)
// =====================================================
//
// Tokens are stored AES-256-GCM-encrypted in the existing api_token /
// agreement_grant_token columns, tagged with this sentinel prefix. Reads
// decrypt transparently so the rest of this client (and isEconomicReady,
// bulk-eksport) is unchanged. Values without the prefix are treated as
// legacy plaintext (backward compatible — prod has no row yet).

const ENC_PREFIX = 'enc:v1:'

/** Encrypt a secret for storage (prefixed). Used by the settings action. */
export async function encryptToken(plaintext: string): Promise<string> {
  return ENC_PREFIX + (await encrypt(plaintext))
}

/** Decrypt a stored secret if it carries the sentinel; else return as-is. */
async function maybeDecrypt(value: string | null): Promise<string | null> {
  if (!value) return value
  if (!value.startsWith(ENC_PREFIX)) return value // legacy plaintext
  try {
    return await decrypt(value.slice(ENC_PREFIX.length))
  } catch (e) {
    // Wrong/missing ENCRYPTION_KEY, or corrupt ciphertext. Never expose the
    // raw value; treat as not-ready so the integration stays locked.
    logger.error('economic: token decrypt failed', { error: e })
    return null
  }
}

// =====================================================
// Settings + readiness
// =====================================================

/**
 * Returns settings with tokens DECRYPTED in-memory (never persisted in
 * plaintext). The database row only ever holds ciphertext.
 */
export async function getEconomicSettings(): Promise<AccountingSettings | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('accounting_integration_settings')
    .select('*')
    .eq('provider', PROVIDER)
    .maybeSingle()
  if (error || !data) return null
  const row = data as AccountingSettings
  return {
    ...row,
    api_token: await maybeDecrypt(row.api_token),
    agreement_grant_token: await maybeDecrypt(row.agreement_grant_token),
  }
}

export function isEconomicReady(s: AccountingSettings | null): s is AccountingSettings & {
  api_token: string
  agreement_grant_token: string
} {
  return Boolean(s?.active && s?.api_token && s?.agreement_grant_token)
}

async function loadReadySettings(
  entityType: AccountingEntityType,
  entityId: string,
  action: AccountingAction
): Promise<AccountingSettings | null> {
  // Henrik 2026-10-15 (PR-2): kill-switch — standard fra; intet skrives til e-conomic uden ECONOMIC_PUSH_ENABLED=true
  if (!economicPushEnabled()) {
    await logAttempt({
      entity_type: entityType,
      entity_id: entityId,
      action,
      status: 'skipped',
      error_message: ECONOMIC_PUSH_DISABLED_CODE,
    })
    return null
  }
  const settings = await getEconomicSettings()
  if (!isEconomicReady(settings)) {
    await logAttempt({
      entity_type: entityType,
      entity_id: entityId,
      action,
      status: 'skipped',
      error_message: 'ECONOMIC_NOT_CONFIGURED',
    })
    console.log('ECONOMIC_NOT_CONFIGURED', entityType, entityId, action)
    return null
  }
  return settings
}

// =====================================================
// Low-level HTTP
// =====================================================

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
}

/**
 * A-4 (review 2026-10-16): udfald hvor e-conomic KAN have oprettet posten — netværksfejl/timeout (status 0, ikke
 * kill-switch), 408 og 5xx. Kravet frigives da IKKE, og en senere kørsel genposter ikke automatisk (dobbelt bogføring);
 * en person tjekker kladderne i e-conomic og frigiver bevidst (releaseUncertainInvoiceExportAction).
 */
export const EXPORT_UNCERTAIN_MARK = 'UNCERTAIN:'
/** Henrik 2026-10-21: brugerens tekst — aldrig udbyderens/netværkets rå fejl */
export const EXPORT_UNCERTAIN_TEXT = 'Uvist om fakturaen blev oprettet i e-conomic. Kontrollér e-conomic før du frigiver eksporten.'
/** A-4b (Henrik 2026-10-22): samme model for leverandørfakturaer */
export const SUPPLIER_POSTING_UNCERTAIN_TEXT = 'Uvist om leverandørfakturaen blev bogført i e-conomic. Kontrollér kladderne i e-conomic før du frigiver bogføringen.'

/**
 * A-4: er fakturaen låst af et krav med uvist udfald? Kun et "pending-"-krav MED en UNCERTAIN-log for præcis det krav
 * (request_meta.claim). Låsen gælder uanset opsætning/kill-switch og frigives kun manuelt.
 */
export async function uncertainExportLock(client: any, invoiceId: string, table: 'invoices' | 'incoming_invoices' = 'invoices'): Promise<{ claim: string; since: string } | null> {
  // A-4b: samme lås for leverandørfakturaer (incoming_invoices) — loggen bruger entity_type 'invoice' + fakturaens id
  const { data: inv } = await client.from(table).select('external_invoice_id').eq('id', invoiceId).maybeSingle()
  const claim = (inv as { external_invoice_id?: string | null } | null)?.external_invoice_id ?? null
  if (!claim || !claim.startsWith(EXPORT_CLAIM_PREFIX)) return null
  const { data } = await client.from('accounting_sync_log').select('created_at')
    .eq('entity_type', 'invoice').eq('entity_id', invoiceId).eq('action', 'create').eq('status', 'failed')
    .like('error_message', `${EXPORT_UNCERTAIN_MARK}%`).eq('request_meta->>claim', claim)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data ? { claim, since: (data as { created_at: string }).created_at } : null
}
export function exportOutcomeUncertain(res: { ok: boolean; status: number; error?: string }): boolean {
  if (res.ok) return false
  if (res.status === 0) return res.error !== ECONOMIC_PUSH_DISABLED_CODE
  return res.status === 408 || res.status >= 500
}

async function economicFetch<T = unknown>(
  settings: AccountingSettings & { api_token: string; agreement_grant_token: string },
  path: string,
  opts: FetchOptions = {}
): Promise<{ ok: boolean; status: number; data: T | null; error?: string; raw?: string }> {
  // PR-2: hård stop i det eneste HTTP-punkt — ingen skrivende kald når kill-switchen er fra (også hvis en kalder
  // springer loadReadySettings over)
  if (!economicRequestAllowed(opts.method)) {
    return { ok: false, status: 0, data: null, error: ECONOMIC_PUSH_DISABLED_CODE }
  }
  const url = new URL(ECONOMIC_BASE + path)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method: opts.method ?? 'GET',
      headers: {
        'X-AppSecretToken': settings.api_token,
        'X-AgreementGrantToken': settings.agreement_grant_token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 0, data: null, error: msg }
  }

  const raw = await response.text()
  let data: T | null = null
  if (raw) {
    try { data = JSON.parse(raw) as T } catch { /* keep raw */ }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
      error: extractErrorMessage(data, raw),
      raw,
    }
  }
  return { ok: true, status: response.status, data, raw }
}

function extractErrorMessage(data: unknown, raw: string): string {
  if (data && typeof data === 'object') {
    const d = data as { message?: string; errorCode?: string; developerHint?: string }
    return [d.message, d.developerHint, d.errorCode].filter(Boolean).join(' — ') || raw.slice(0, 300)
  }
  return raw.slice(0, 300)
}

// =====================================================
// Logging helper
// =====================================================

interface LogInput {
  entity_type: AccountingEntityType
  entity_id: string
  action: AccountingAction
  status: AccountingStatus
  external_id?: string | null
  error_message?: string | null
  request_meta?: Record<string, unknown>
  response_meta?: Record<string, unknown>
}

async function logAttempt(input: LogInput): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('accounting_sync_log').insert({
    provider: PROVIDER,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    action: input.action,
    status: input.status,
    external_id: input.external_id ?? null,
    error_message: input.error_message ?? null,
    request_meta: input.request_meta ?? null,
    response_meta: input.response_meta ?? null,
  })
  if (error) {
    logger.warn('accounting_sync_log insert failed', { entityId: input.entity_id, error })
  }
}

async function touchLastSyncAt(): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('accounting_integration_settings')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('provider', PROVIDER)
}

// =====================================================
// Customers
// =====================================================

export async function createCustomerInEconomic(
  customerId: string
): Promise<EconomicResult<{ customerNumber: string }>> {
  const settings = await loadReadySettings('customer', customerId, 'create')
  if (!settings) {
    return { ok: false, status: 'skipped', reason: economicPushEnabled() ? 'ECONOMIC_NOT_CONFIGURED' : ECONOMIC_PUSH_DISABLED_CODE }
  }
  const ready = settings as AccountingSettings & { api_token: string; agreement_grant_token: string }

  const supabase = createAdminClient()
  const { data: cust, error } = await supabase
    .from('customers')
    .select('id, company_name, contact_person, email, phone, billing_address, billing_postal_code, billing_city, billing_country, vat_number, external_customer_id, external_provider')
    .eq('id', customerId)
    .maybeSingle()
  if (error || !cust) {
    await logAttempt({ entity_type: 'customer', entity_id: customerId, action: 'create', status: 'failed', error_message: 'customer not found' })
    return { ok: false, status: 'failed', error: 'customer not found' }
  }

  // Idempotency: already linked.
  if (cust.external_customer_id && cust.external_provider === PROVIDER) {
    await logAttempt({
      entity_type: 'customer',
      entity_id: customerId,
      action: 'skip',
      status: 'skipped',
      external_id: cust.external_customer_id,
      error_message: 'already linked',
    })
    return { ok: true, status: 'skipped', externalId: cust.external_customer_id }
  }

  // EC-6 (e-conomic-review): to samtidige eksporter så begge "ingen debitor" og oprettede hver sin i e-conomic (EC-5
  // forhindrede kun, at linket blev overskrevet). Nu et krav FØR POST: en midlertidig markør i external_customer_id (uden
  // external_provider → læses overalt som "ikke koblet"). Kun den der får kravet opretter; et krav ældre end 10 min
  // (afbrudt kørsel) kan overtages. Fejler oprettelsen, frigives kravet.
  const CLAIM_PREFIX = 'pending:'
  const current = (cust.external_customer_id as string | null) ?? null
  const claimMarker = `${CLAIM_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
  let claimed = false
  if (!current || current.startsWith(CLAIM_PREFIX)) {
    const staleClaim = !!current && Number(current.slice(CLAIM_PREFIX.length).split(':')[0]) < Date.now() - 10 * 60_000
    if (current && !staleClaim) {
      await logAttempt({ entity_type: 'customer', entity_id: customerId, action: 'create', status: 'skipped', error_message: 'debitor oprettes allerede (samtidig eksport)' })
      return { ok: false, status: 'failed', error: 'Debitoren oprettes allerede i e-conomic — prøv igen om et øjeblik' }
    }
    const claimQ = supabase.from('customers').update({ external_customer_id: claimMarker }).eq('id', customerId)
    const { data: claimRows, error: claimErr } = await (current ? claimQ.eq('external_customer_id', current) : claimQ.is('external_customer_id', null)).select('id')
    claimed = !claimErr && (claimRows ?? []).length === 1
    if (!claimed) {
      await logAttempt({ entity_type: 'customer', entity_id: customerId, action: 'create', status: 'skipped', error_message: 'debitor oprettes allerede (krav ikke opnået)' })
      return { ok: false, status: 'failed', error: 'Debitoren oprettes allerede i e-conomic — prøv igen om et øjeblik' }
    }
  }
  const releaseClaim = async () => {
    if (claimed) await supabase.from('customers').update({ external_customer_id: null }).eq('id', customerId).eq('external_customer_id', claimMarker)
  }

  const cfg = ready.config || {}
  const body = {
    name: cust.company_name || cust.contact_person || 'Unknown',
    // EC-11 (e-conomic-review 2026-10-17): pladsholder-adressen (auto+<nr>@elta-crm.local) sendes ikke til debitoren
    email: cust.email && !isPlaceholderEmail(cust.email) ? cust.email : undefined,
    address: cust.billing_address || undefined,
    zip: cust.billing_postal_code || undefined,
    city: cust.billing_city || undefined,
    country: cust.billing_country || 'Denmark',
    corporateIdentificationNumber: cust.vat_number || undefined,
    telephoneAndFaxNumber: cust.phone || undefined,
    currency: 'DKK',
    customerGroup: { customerGroupNumber: cfg.defaultCustomerGroupNumber ?? 1 },
    paymentTerms: { paymentTermsNumber: cfg.paymentTermsNumber ?? 1 },
    vatZone: { vatZoneNumber: cfg.vatZoneNumber ?? 1 },
  }

  const res = await economicFetch<{ customerNumber: number }>(ready, '/customers', {
    method: 'POST',
    body,
  }).catch(async (err: unknown) => { await releaseClaim(); throw err })

  if (!res.ok || !res.data?.customerNumber) {
    await releaseClaim()
    await logAttempt({
      entity_type: 'customer',
      entity_id: customerId,
      action: 'create',
      status: 'failed',
      error_message: res.error || `HTTP ${res.status}`,
      request_meta: { http_status: res.status },
    })
    return { ok: false, status: 'failed', error: res.error || `HTTP ${res.status}` }
  }

  const externalId = String(res.data.customerNumber)
  // EC-5: fejltjek + kun når kunden ikke er koblet imens (ellers overskrev en samtidig kørsel den anden debitor)
  const linkQ = supabase
    .from('customers')
    .update({ external_customer_id: externalId, external_provider: PROVIDER })
    .eq('id', customerId)
  const { error: custLinkErr } = await (claimed ? linkQ.eq('external_customer_id', claimMarker) : linkQ.is('external_customer_id', null))
  if (custLinkErr) {
    logger.error('e-conomic: debitor oprettet, men linket kunne ikke gemmes', { entityId: customerId, metadata: { externalId }, error: custLinkErr })
  }

  await logAttempt({
    entity_type: 'customer',
    entity_id: customerId,
    action: 'create',
    status: 'success',
    external_id: externalId,
  })
  await touchLastSyncAt()
  console.log('ECONOMIC CUSTOMER CREATED:', customerId, '→', externalId)
  return { ok: true, status: 'success', externalId, data: { customerNumber: externalId } }
}

// =====================================================
// Invoices
// =====================================================

export async function createInvoiceInEconomic(
  invoiceId: string
): Promise<EconomicResult<{ draftInvoiceNumber: string; bookedNumber?: string }>> {
  // A-4 (Henrik 2026-10-21): et krav med uvist udfald låser fakturaen — ingen eksport (heller ikke stale-overtagelse)
  // før en person har tjekket e-conomic og frigivet bevidst
  if (await uncertainExportLock(createAdminClient(), invoiceId)) {
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'skip', status: 'skipped', error_message: 'export uncertain — locked until manual release' })
    return { ok: false, status: 'skipped', reason: 'export uncertain' }
  }
  const settings = await loadReadySettings('invoice', invoiceId, 'create')
  if (!settings) {
    return { ok: false, status: 'skipped', reason: economicPushEnabled() ? 'ECONOMIC_NOT_CONFIGURED' : ECONOMIC_PUSH_DISABLED_CODE }
  }
  const ready = settings as AccountingSettings & { api_token: string; agreement_grant_token: string }
  const cfg: EconomicConfig = ready.config || {}

  const supabase = createAdminClient()

  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invErr || !inv) {
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'create', status: 'failed', error_message: 'invoice not found' })
    return { ok: false, status: 'failed', error: 'invoice not found' }
  }

  // Økonomi-review 2026-10-08 (#2): igangværende eksport (krav) — en samtidig kørsel må ikke bogføre igen
  const pendingClaim = typeof inv.external_invoice_id === 'string' && inv.external_invoice_id.startsWith(EXPORT_CLAIM_PREFIX)
    ? inv.external_invoice_id : null
  if (pendingClaim && Date.now() - Number(pendingClaim.slice(EXPORT_CLAIM_PREFIX.length)) < EXPORT_CLAIM_STALE_MS) {
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'skip', status: 'skipped', error_message: 'export in progress' })
    return { ok: false, status: 'skipped', reason: 'export in progress' }
  }
  // EC-5 (e-conomic-review 2026-10-17): et hængt krav efter en LYKKET eksport (linket kunne ikke gemmes) må aldrig føre
  // til en ny postering — findes en succes-log med e-conomic-nummer, genskabes linket i stedet
  if (pendingClaim) {
    // A-4: et krav med usikkert udfald genposteres aldrig automatisk (e-conomic kan have oprettet kladden)
    const { data: unsure } = await supabase.from('accounting_sync_log').select('id')
      .eq('entity_type', 'invoice').eq('entity_id', invoiceId).eq('action', 'create').eq('status', 'failed')
      .like('error_message', `${EXPORT_UNCERTAIN_MARK}%`)
      .eq('request_meta->>claim', pendingClaim)
      .limit(1).maybeSingle()
    if (unsure) {
      await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'skip', status: 'skipped', error_message: 'export uncertain — not reposted' })
      return { ok: false, status: 'skipped', reason: 'export uncertain' }
    }
    const { data: done } = await supabase.from('accounting_sync_log').select('external_id')
      .eq('entity_type', 'invoice').eq('entity_id', invoiceId).eq('action', 'create').eq('status', 'success')
      .not('external_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const prevExternal = (done as { external_id?: string | null } | null)?.external_id
    if (prevExternal) {
      await supabase.from('invoices').update({ external_invoice_id: prevExternal, external_provider: PROVIDER })
        .eq('id', invoiceId).eq('external_invoice_id', pendingClaim)
      await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'skip', status: 'skipped', external_id: prevExternal, error_message: 'already exported (link restored from log)' })
      return { ok: true, status: 'skipped', externalId: prevExternal }
    }
  }

  // Idempotency.
  if (inv.external_invoice_id && !pendingClaim && inv.external_provider === PROVIDER) {
    await logAttempt({
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'skip',
      status: 'skipped',
      external_id: inv.external_invoice_id,
      error_message: 'already linked',
    })
    return { ok: true, status: 'skipped', externalId: inv.external_invoice_id }
  }

  // Leverandør-/e-conomic-review: kun udstedte, ikke-annullerede almindelige fakturaer bogføres — før havde kun bulk- og
  // enkelteksport-stierne dette tjek; exportInvoiceToEconomicAction kunne bogføre en kladde eller en kreditnota som en
  // almindelig faktura. Tjekket ligger nu ved kilden, så alle veje er dækket.
  if (!['sent', 'paid'].includes(String(inv.status)) || inv.voided_at || inv.invoice_type === 'credit') {
    const reason = `not exportable: status=${inv.status}${inv.voided_at ? ', voided' : ''}${inv.invoice_type === 'credit' ? ', credit note' : ''}`
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'create', status: 'skipped', error_message: reason })
    return { ok: false, status: 'skipped', reason }
  }

  // Required config defaults check.
  const layoutNumber = cfg.layoutNumber
  const paymentTermsNumber = cfg.paymentTermsNumber
  const vatZoneNumber = cfg.vatZoneNumber
  if (!layoutNumber || !paymentTermsNumber || !vatZoneNumber) {
    const reason = 'Missing economic config: layoutNumber, paymentTermsNumber, vatZoneNumber'
    await logAttempt({
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'create',
      status: 'failed',
      error_message: reason,
    })
    return { ok: false, status: 'failed', error: reason }
  }

  // Customer linkage — create on the fly if missing.
  if (!inv.customer_id) {
    const reason = 'invoice has no customer'
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'create', status: 'failed', error_message: reason })
    return { ok: false, status: 'failed', error: reason }
  }

  const { data: cust } = await supabase
    .from('customers')
    .select('id, company_name, contact_person, email, billing_address, billing_postal_code, billing_city, billing_country, vat_number, external_customer_id, external_provider')
    .eq('id', inv.customer_id)
    .maybeSingle()
  if (!cust) {
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'create', status: 'failed', error_message: 'customer not found' })
    return { ok: false, status: 'failed', error: 'customer not found' }
  }

  let customerNumber = cust.external_customer_id
  if (!customerNumber || cust.external_provider !== PROVIDER) {
    const created = await createCustomerInEconomic(cust.id)
    if (!created.ok || !created.externalId) {
      await logAttempt({
        entity_type: 'invoice',
        entity_id: invoiceId,
        action: 'create',
        status: 'failed',
        error_message: `customer sync failed: ${created.error || created.reason || 'unknown'}`,
      })
      return { ok: false, status: 'failed', error: created.error || 'customer sync failed' }
    }
    customerNumber = created.externalId
  }

  // Lines + body via den fælles mapping (samme som forhåndsvisningen).
  const { data: lineRows } = await supabase
    .from('invoice_lines')
    .select('position, description, quantity, unit_price, total_price')
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: true })

  const draft = buildEconomicInvoiceDraft({
    invoice: inv,
    customer: cust,
    customerNumber: Number(customerNumber),
    lines: lineRows ?? [],
    config: cfg,
  })
  if (!draft.canPost) {
    // Bogfør aldrig et andet beløb end kunden har fået (eller en tom faktura).
    const reason = draft.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'create', status: 'failed', error_message: reason })
    return { ok: false, status: 'failed', error: reason }
  }
  const draftBody = draft.body

  // Krav FØR bogføring: kun den kørsel der sætter krav-markøren (fra tom eller et afbrudt krav) fortsætter
  const claimValue = `${EXPORT_CLAIM_PREFIX}${Date.now()}`
  const claimQ = supabase.from('invoices').update({ external_invoice_id: claimValue }).eq('id', invoiceId)
  const { data: claimed } = await (pendingClaim ? claimQ.eq('external_invoice_id', pendingClaim) : claimQ.is('external_invoice_id', null)).select('id')
  if (!claimed || claimed.length !== 1) {
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'skip', status: 'skipped', error_message: 'export claimed by another run' })
    return { ok: false, status: 'skipped', reason: 'export in progress' }
  }
  const releaseClaim = () => supabase.from('invoices').update({ external_invoice_id: null }).eq('id', invoiceId).eq('external_invoice_id', claimValue)

  let draftRes: Awaited<ReturnType<typeof economicFetch<{ draftInvoiceNumber: number }>>>
  try {
    draftRes = await economicFetch<{ draftInvoiceNumber: number }>(ready, '/invoices/drafts', {
      method: 'POST',
      body: draftBody,
    })
  } catch (err) {
    // A-4: ukendt udfald — kravet bliver (ingen frigivelse → ingen dobbelt postering ved genforsøg)
    draftRes = { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) }
  }

  if (exportOutcomeUncertain(draftRes)) {
    await logAttempt({
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'create',
      status: 'failed',
      error_message: `${EXPORT_UNCERTAIN_MARK} ${draftRes.error || `HTTP ${draftRes.status}`}`.slice(0, 500),
      request_meta: { http_status: draftRes.status, uncertain: true, claim: claimValue },
    })
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      await logHealth('economic', 'warning', 'Faktura-eksport med ukendt udfald (netværk/timeout/5xx) — tjek kladder i e-conomic før genforsøg', { invoiceId })
    } catch { /* never crash */ }
    return { ok: false, status: 'failed', reason: 'export uncertain', error: EXPORT_UNCERTAIN_TEXT }
  }

  if (!draftRes.ok || !draftRes.data?.draftInvoiceNumber) {
    await releaseClaim()
    await logAttempt({
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'create',
      status: 'failed',
      error_message: draftRes.error || `HTTP ${draftRes.status}`,
      request_meta: { http_status: draftRes.status },
    })
    return { ok: false, status: 'failed', error: draftRes.error || `HTTP ${draftRes.status}` }
  }

  const draftNumber = String(draftRes.data.draftInvoiceNumber)
  let bookedNumber: string | undefined

  // Optional: book the draft immediately so the invoice gets a final booked number.
  // EC-13 (e-conomic-review 2026-10-17): kun når indstillingen eksplicit er slået til — status-siden viste "fra" for en
  // ikke-gemt indstilling, mens klienten bogførte (irreversibelt). Standard = kladde (A-5 viser den som ikke bogført).
  if (cfg.autoBookOnCreate === true) {
    const bookRes = await economicFetch<{ bookedInvoiceNumber: number }>(
      ready,
      `/invoices/drafts/${encodeURIComponent(draftNumber)}/book`,
      { method: 'POST', body: {} }
    )
    if (bookRes.ok && bookRes.data?.bookedInvoiceNumber) {
      bookedNumber = String(bookRes.data.bookedInvoiceNumber)
    } else {
      // Booking failed, but we still have the draft. Persist draft as
      // external id so we don't re-create it; surface the booking error.
      await supabase
        .from('invoices')
        .update({ external_invoice_id: `draft-${draftNumber}`, external_provider: PROVIDER })
        .eq('id', invoiceId)
      await logAttempt({
        entity_type: 'invoice',
        entity_id: invoiceId,
        action: 'create',
        status: 'failed',
        external_id: `draft-${draftNumber}`,
        error_message: `draft created but booking failed: ${bookRes.error || `HTTP ${bookRes.status}`}`,
      })
      return {
        ok: false,
        status: 'failed',
        externalId: `draft-${draftNumber}`,
        error: bookRes.error || `HTTP ${bookRes.status}`,
      }
    }
  }

  const externalId = bookedNumber || `draft-${draftNumber}`
  // EC-5: linket SKAL gemmes (ellers blev kravet forældet og en ny kørsel postede igen). Bundet til eget krav; ét
  // genforsøg; derefter kritisk log — succes-loggen nedenfor gør, at et senere forsøg genskaber linket (se ovenfor).
  const saveLink = () => supabase.from('invoices').update({ external_invoice_id: externalId, external_provider: PROVIDER })
    .eq('id', invoiceId).eq('external_invoice_id', claimValue).select('id')
  let linkRes = await saveLink()
  if (linkRes.error || !linkRes.data?.length) linkRes = await saveLink()
  if (linkRes.error || !linkRes.data?.length) {
    logger.error('e-conomic: faktura eksporteret, men linket kunne ikke gemmes', { entityId: invoiceId, metadata: { externalId }, error: linkRes.error ?? undefined })
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      await logHealth('economic', 'error', `Faktura eksporteret som ${externalId}, men linket blev ikke gemt i CRM — eksportér IKKE igen; ret linket`, { invoiceId, externalId })
    } catch { /* never crash */ }
  }

  await logAttempt({
    entity_type: 'invoice',
    entity_id: invoiceId,
    action: 'create',
    status: 'success',
    external_id: externalId,
    response_meta: { draftNumber, bookedNumber },
  })
  await touchLastSyncAt()
  console.log('ECONOMIC INVOICE CREATED:', invoiceId, '→', externalId)
  return { ok: true, status: 'success', externalId, data: { draftInvoiceNumber: draftNumber, bookedNumber } }
}

// =====================================================
// Forhåndsvisning (ingen netværk, ingen skrivning)
// =====================================================

export interface EconomicInvoicePreview {
  invoice_number: string
  /** e-conomic-opsætningen er aktiv med nøgler (live-eksport mulig) */
  integration_ready: boolean
  /** Sat når indstillingsopslaget fejler. integration_ready er da false, men det er ikke "ikke opsat". */
  integration_error?: string | null
  /** Sat når kundeopslaget fejler. Det er ikke "ny kunde". */
  customer_error?: string | null
  /** allerede eksporteret (e-conomic-id) */
  external_id: string | null
  draft: EconomicInvoiceDraft
}

/**
 * Bygger præcis den kladde createInvoiceInEconomic ville sende — uden at
 * kontakte e-conomic, oprette kunder eller skrive noget. Læser kun config
 * (aldrig nøgler).
 */
export async function previewInvoiceForEconomic(
  invoiceId: string
): Promise<{ ok: true; data: EconomicInvoicePreview } | { ok: false; error: string }> {
  const supabase = createAdminClient()
  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, currency, created_at, sent_at, total_amount, vat_mode, customer_id, external_invoice_id, external_provider')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invErr) return { ok: false, error: 'Kunne ikke hente fakturaen. Det tælles ikke som at fakturaen mangler.' }
  if (!inv) return { ok: false, error: 'Faktura ikke fundet' }

  const [settingsRes, customerRes, linesRes] = await Promise.all([
    supabase
      .from('accounting_integration_settings')
      .select('active, config, api_token, agreement_grant_token')
      .eq('provider', PROVIDER)
      .maybeSingle(),
    inv.customer_id
      ? supabase
          .from('customers')
          .select('company_name, contact_person, billing_address, billing_postal_code, billing_city, billing_country, external_customer_id, external_provider')
          .eq('id', inv.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('invoice_lines')
      .select('position, description, quantity, unit_price, total_price')
      .eq('invoice_id', invoiceId)
      .order('position', { ascending: true }),
  ])
  if (linesRes.error) return { ok: false, error: 'Kunne ikke hente fakturalinjer. Det tælles ikke som ingen linjer.' }

  const settingsRow = settingsRes.data
  const s = settingsRow as { active?: boolean; config?: EconomicConfig | null; api_token?: string | null; agreement_grant_token?: string | null } | null
  const integrationError = settingsRes.error ? 'Kunne ikke tjekke e-conomic' : null
  const customerError = customerRes.error ? 'Kunne ikke hente kunden' : null
  const cust = customerError ? null : customerRes.data
  const c = cust as { external_customer_id?: string | null; external_provider?: string | null } | null
  const linkedNumber =
    c?.external_customer_id && c.external_provider === PROVIDER ? Number(c.external_customer_id) : null

  const draft = buildEconomicInvoiceDraft({
    invoice: inv,
    customer: (cust ?? {}) as Record<string, string | null>,
    customerNumber: Number.isFinite(linkedNumber) ? linkedNumber : null,
    lines: linesRes.data ?? [],
    config: integrationError ? {} : (s?.config ?? {}),
  })
  if (!inv.customer_id) {
    draft.issues.unshift({ code: 'no_customer', severity: 'error', message: 'Fakturaen har ingen kunde' })
    draft.canPost = false
  }

  return {
    ok: true,
    data: {
      invoice_number: inv.invoice_number,
      // Kun om nøgler FINDES — værdierne læses aldrig ud herfra.
      integration_ready: integrationError ? false : Boolean(s?.active && s?.api_token && s?.agreement_grant_token),
      integration_error: integrationError,
      customer_error: customerError,
      external_id: inv.external_provider === PROVIDER ? inv.external_invoice_id : null,
      draft,
    },
  }
}

export interface EconomicSupplierInvoicePreview {
  integration_ready: boolean
  /** Sat når indstillingsopslaget fejler. integration_ready er da false, men det er ikke "ikke opsat". */
  integration_error?: string | null
  /** Sat når leverandøropslaget fejler. Det er ikke "ikke koblet". */
  supplier_error?: string | null
  external_id: string | null
  draft: SupplierInvoiceDraft
}

/** Hvad pushSupplierInvoiceToEconomic ville bogføre — ingen netværk/skrivning, ingen nøgler læst ud. */
export async function previewSupplierInvoiceForEconomic(
  incomingInvoiceId: string
): Promise<{ ok: true; data: EconomicSupplierInvoicePreview } | { ok: false; error: string }> {
  const supabase = createAdminClient()
  const { data: inv, error: invErr } = await supabase
    .from('incoming_invoices')
    .select('id, supplier_id, invoice_number, invoice_date, due_date, currency, amount_excl_vat, vat_amount, amount_incl_vat, payment_reference, external_invoice_id, external_provider')
    .eq('id', incomingInvoiceId)
    .maybeSingle()
  if (invErr) return { ok: false, error: 'Kunne ikke hente fakturaen. Det tælles ikke som at fakturaen mangler.' }
  if (!inv) return { ok: false, error: 'Faktura ikke fundet' }
  const [settingsRes, supplierRes, linesRes] = await Promise.all([
    supabase.from('accounting_integration_settings').select('active, config, api_token, agreement_grant_token').eq('provider', PROVIDER).maybeSingle(),
    inv.supplier_id
      ? supabase.from('suppliers').select('external_supplier_id, external_provider').eq('id', inv.supplier_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('incoming_invoice_lines').select('line_number, description, quantity, unit_price, total_price').eq('incoming_invoice_id', incomingInvoiceId).order('line_number', { ascending: true }),
  ])
  if (linesRes.error) return { ok: false, error: 'Kunne ikke hente fakturalinjer' }
  const settingsRow = settingsRes.data
  const s = settingsRow as { active?: boolean; config?: EconomicConfig | null; api_token?: string | null; agreement_grant_token?: string | null } | null
  const integrationError = settingsRes.error ? 'Kunne ikke tjekke e-conomic' : null
  const supplierError = supplierRes.error ? 'Kunne ikke hente leverandøren' : null
  const sp = supplierError ? null : supplierRes.data as { external_supplier_id?: string | null; external_provider?: string | null } | null
  const n = sp?.external_supplier_id && sp.external_provider === PROVIDER ? Number(sp.external_supplier_id) : NaN
  const draft = buildEconomicSupplierInvoiceDraft({
    invoice: inv,
    supplierNumber: Number.isFinite(n) ? n : null,
    lines: linesRes.data ?? [],
    config: { costAccountNumber: integrationError ? null : ((s?.config as { costAccountNumber?: number } | null)?.costAccountNumber ?? null) },
  })
  return {
    ok: true,
    data: {
      integration_ready: integrationError ? false : Boolean(s?.active && s?.api_token && s?.agreement_grant_token),
      integration_error: integrationError,
      supplier_error: supplierError,
      external_id: inv.external_provider === PROVIDER ? inv.external_invoice_id : null,
      draft,
    },
  }
}

/**
 * N46: forhåndsvisning af kundebetalingens kassekladde-postering — PRÆCIS den postering markInvoicePaidInEconomic ville
 * sende (samme builder), men uden netværk, uden log og uden at kræve tokens. Bruges til "Vis hvad der sendes" og
 * klar-til-bogføring-tjek før e-conomic er tilkoblet.
 */
export async function previewPaymentForEconomic(invoiceId: string): Promise<
  | { ok: true; data: { entry: ReturnType<typeof buildEconomicPaymentEntry>; synced: boolean; configured: boolean; alreadyMarkedPaid: boolean; settings_error?: string | null; paid_error?: string | null } }
  | { ok: false; error: string }
> {
  const supabase = createAdminClient()
  const [invRes, settingsRes, paidRes] = await Promise.all([
    supabase.from('invoices')
      .select('id, currency, final_amount, amount_paid, payment_status, paid_at, external_invoice_id, external_provider')
      .eq('id', invoiceId).maybeSingle(),
    supabase.from('accounting_integration_settings').select('config').eq('provider', PROVIDER).maybeSingle(),
    supabase.from('accounting_sync_log').select('id').eq('entity_type', 'invoice').eq('entity_id', invoiceId)
      .eq('action', 'mark_paid').eq('status', 'success').limit(1).maybeSingle(),
  ])
  if (invRes.error) return { ok: false, error: 'Kunne ikke hente fakturaen. Det tælles ikke som at fakturaen mangler.' }
  const inv = invRes.data
  if (!inv) return { ok: false, error: 'Faktura ikke fundet' }
  const settingsError = settingsRes.error ? 'Kunne ikke tjekke e-conomic' : null
  const paidError = paidRes.error ? 'Kunne ikke tjekke om betalingen allerede er registreret' : null
  const settingsRow = settingsError ? null : settingsRes.data
  const cfg: EconomicConfig = settingsError ? {} : (((settingsRow as { config?: EconomicConfig } | null)?.config) || {})
  const synced = !!inv.external_invoice_id && inv.external_provider === PROVIDER
  const entry = buildEconomicPaymentEntry({ invoice: inv, config: cfg })
  return {
    ok: true,
    data: {
      entry,
      synced,
      configured: settingsError ? false : !!cfg.cashbookNumber && !!cfg.bankContraAccountNumber,
      alreadyMarkedPaid: paidError ? false : !!paidRes.data,
      settings_error: settingsError,
      paid_error: paidError,
    },
  }
}

// =====================================================
// Mark paid (cashbook entry)
// =====================================================

export async function markInvoicePaidInEconomic(
  invoiceId: string
): Promise<EconomicResult<{ voucherNumber?: string }>> {
  const settings = await loadReadySettings('invoice', invoiceId, 'mark_paid')
  if (!settings) {
    return { ok: false, status: 'skipped', reason: economicPushEnabled() ? 'ECONOMIC_NOT_CONFIGURED' : ECONOMIC_PUSH_DISABLED_CODE }
  }
  const ready = settings as AccountingSettings & { api_token: string; agreement_grant_token: string }
  const cfg: EconomicConfig = ready.config || {}

  const supabase = createAdminClient()
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, currency, final_amount, amount_paid, payment_status, paid_at, external_invoice_id, external_provider, payment_reference')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!inv) {
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'mark_paid', status: 'failed', error_message: 'invoice not found' })
    return { ok: false, status: 'failed', error: 'invoice not found' }
  }
  if (!inv.external_invoice_id || inv.external_provider !== PROVIDER) {
    await logAttempt({
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'mark_paid',
      status: 'failed',
      error_message: 'invoice not synced to e-conomic yet',
    })
    return { ok: false, status: 'failed', error: 'invoice not synced to e-conomic yet' }
  }

  // Skip if we already marked paid (idempotency: an entry has been logged).
  const { data: prevPaid } = await supabase
    .from('accounting_sync_log')
    .select('id, status')
    .eq('entity_type', 'invoice')
    .eq('entity_id', invoiceId)
    .eq('action', 'mark_paid')
    .eq('status', 'success')
    .limit(1)
    .maybeSingle()
  if (prevPaid) {
    await logAttempt({
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'skip',
      status: 'skipped',
      external_id: inv.external_invoice_id,
      error_message: 'already marked paid in e-conomic',
    })
    return { ok: true, status: 'skipped', externalId: inv.external_invoice_id }
  }

  if (!cfg.cashbookNumber || !cfg.bankContraAccountNumber) {
    await logAttempt({
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'mark_paid',
      status: 'skipped',
      external_id: inv.external_invoice_id,
      error_message: 'ECONOMIC_CASHBOOK_OR_BANK_NOT_CONFIGURED',
    })
    console.log('ECONOMIC payment registration skipped — config.cashbookNumber + config.bankContraAccountNumber required')
    return {
      ok: false,
      status: 'skipped',
      reason: 'ECONOMIC_CASHBOOK_OR_BANK_NOT_CONFIGURED',
    }
  }

  // Kundebetaling i kassekladden via fælles mapping (betalingsdato i dansk
  // tid, afviser kladde-faktura og kreditnota) — se lib/economic/payment-entry.ts.
  const entry = buildEconomicPaymentEntry({ invoice: inv, config: cfg })
  if (!entry.canPost) {
    const reason = entry.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')
    await logAttempt({
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'mark_paid',
      status: 'failed',
      external_id: inv.external_invoice_id,
      error_message: reason,
    })
    return { ok: false, status: 'failed', error: reason }
  }
  const body = entry.body

  const res = await economicFetch<{ voucherNumber: number; entryNumber?: number }>(
    ready,
    `/cash-books/${encodeURIComponent(String(cfg.cashbookNumber))}/entries/customer-payments`,
    { method: 'POST', body }
  )

  if (!res.ok) {
    await logAttempt({
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'mark_paid',
      status: 'failed',
      external_id: inv.external_invoice_id,
      error_message: res.error || `HTTP ${res.status}`,
      request_meta: { http_status: res.status },
    })
    return { ok: false, status: 'failed', error: res.error || `HTTP ${res.status}` }
  }

  const voucherNumber = res.data?.voucherNumber ? String(res.data.voucherNumber) : undefined
  await logAttempt({
    entity_type: 'invoice',
    entity_id: invoiceId,
    action: 'mark_paid',
    status: 'success',
    external_id: inv.external_invoice_id,
    response_meta: { voucherNumber },
  })
  await touchLastSyncAt()
  console.log('ECONOMIC PAYMENT REGISTERED:', invoiceId, '→ voucher', voucherNumber)
  return { ok: true, status: 'success', externalId: inv.external_invoice_id, data: { voucherNumber } }
}

// =====================================================
// Connection test (Ø6.2)
// =====================================================

export interface EconomicPingResult {
  ok: boolean
  /** Human-readable, never contains the secret. */
  message: string
  reason?: 'ECONOMIC_NOT_CONFIGURED' | 'unauthorized' | 'http_error' | 'network'
  agreementName?: string
}

/**
 * Validate the stored credentials against e-conomic's GET /self endpoint.
 * Uses the decrypted, stored tokens — callers never pass secrets in.
 * Returns a human message only; the token is never logged or returned.
 */
export async function pingEconomicConnection(): Promise<EconomicPingResult> {
  const settings = await getEconomicSettings()
  if (!isEconomicReady(settings)) {
    return { ok: false, reason: 'ECONOMIC_NOT_CONFIGURED', message: 'e-conomic er ikke opsat endnu.' }
  }
  const ready = settings as AccountingSettings & { api_token: string; agreement_grant_token: string }

  const res = await economicFetch<{ self?: { companyName?: string }; agreementNumber?: number; company?: { name?: string } }>(
    ready,
    '/self'
  )

  if (res.ok) {
    const name = res.data?.company?.name || (res.data as { companyName?: string } | null)?.companyName || undefined
    return { ok: true, message: name ? `Forbindelse OK — ${name}` : 'Forbindelse OK.', agreementName: name }
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'unauthorized', message: 'Adgang nægtet — kontroller app-hemmelighed og aftale-token.' }
  }
  if (res.status === 0) {
    return { ok: false, reason: 'network', message: 'Kunne ikke nå e-conomic (netværksfejl).' }
  }
  return { ok: false, reason: 'http_error', message: `e-conomic svarede med en fejl (HTTP ${res.status}).` }
}

// =====================================================
// Phase 15 — Supplier invoices (creditor invoices)
// =====================================================

/**
 * Push a supplier (creditor) invoice draft to e-conomic.
 *
 * Reads `incoming_invoices.id` and POSTs to /supplier-invoices/drafts.
 * Idempotent: if `external_invoice_id` is already set with provider
 * 'economic', skips and returns the existing id.
 *
 * Required config (in accounting_integration_settings.config):
 *   - supplierInvoiceLayoutNumber  (or invoice layout if shared)
 *   - costAccountNumber            (default GL account for line postings)
 *
 * Skip-safe: returns `status: 'skipped', reason: 'ECONOMIC_NOT_CONFIGURED'`
 * when credentials are missing.
 */
export async function pushSupplierInvoiceToEconomic(
  incomingInvoiceId: string
): Promise<EconomicResult<{ draftSupplierInvoiceNumber?: string }>> {
  // A-4b (Henrik 2026-10-22): et krav med uvist udfald låser leverandørfakturaen — ingen bogføring (heller ikke
  // stale-overtagelse efter 15 min) før en person har tjekket e-conomic og frigivet bevidst
  if (await uncertainExportLock(createAdminClient(), incomingInvoiceId, 'incoming_invoices')) {
    await logAttempt({ entity_type: 'invoice', entity_id: incomingInvoiceId, action: 'skip', status: 'skipped', error_message: 'supplier posting uncertain — locked until manual release' })
    return { ok: false, status: 'skipped', reason: 'export uncertain' }
  }
  const settings = await loadReadySettings('invoice', incomingInvoiceId, 'create')
  if (!settings) {
    return { ok: false, status: 'skipped', reason: economicPushEnabled() ? 'ECONOMIC_NOT_CONFIGURED' : ECONOMIC_PUSH_DISABLED_CODE }
  }
  const ready = settings as AccountingSettings & { api_token: string; agreement_grant_token: string }
  const cfg = ready.config || {}

  const supabase = createAdminClient()

  const { data: inv } = await supabase
    .from('incoming_invoices')
    .select('id, supplier_id, supplier_name_extracted, supplier_vat_number, invoice_number, invoice_date, due_date, currency, amount_excl_vat, vat_amount, amount_incl_vat, payment_reference, external_invoice_id, external_provider, status')
    .eq('id', incomingInvoiceId)
    .maybeSingle()
  if (!inv) {
    await logAttempt({ entity_type: 'invoice', entity_id: incomingInvoiceId, action: 'create', status: 'failed', error_message: 'incoming_invoice not found' })
    return { ok: false, status: 'failed', error: 'incoming_invoice not found' }
  }
  if (inv.status !== 'approved') {
    return { ok: false, status: 'failed', error: `incoming_invoice is ${inv.status}, expected approved` }
  }
  // Leverandør-review 2026-10-08 (#1): krav før bogføring (som kundefakturaer) — automatisk push ved godkendelse +
  // klik på "Bogfør" (eller dobbeltklik) bogførte samme omkostning to gange
  const supPending = typeof inv.external_invoice_id === 'string' && inv.external_invoice_id.startsWith(EXPORT_CLAIM_PREFIX)
    ? inv.external_invoice_id : null
  if (supPending && Date.now() - Number(supPending.slice(EXPORT_CLAIM_PREFIX.length)) < EXPORT_CLAIM_STALE_MS) {
    return { ok: false, status: 'skipped', reason: 'export in progress' }
  }
  if (inv.external_invoice_id && !supPending && inv.external_provider === 'economic') {
    await logAttempt({
      entity_type: 'invoice', entity_id: incomingInvoiceId, action: 'skip',
      status: 'skipped', external_id: inv.external_invoice_id, error_message: 'already linked',
    })
    return { ok: true, status: 'skipped', externalId: inv.external_invoice_id }
  }

  // Look up the e-conomic supplier number from our suppliers row.
  let economicSupplierNumber: number | null = null
  if (inv.supplier_id) {
    const { data: sup } = await supabase
      .from('suppliers')
      .select('id, external_supplier_id, external_provider')
      .eq('id', inv.supplier_id)
      .maybeSingle()
    if (sup?.external_supplier_id && sup.external_provider === 'economic') {
      const n = Number(sup.external_supplier_id)
      if (Number.isFinite(n)) economicSupplierNumber = n
    }
  }
  if (!economicSupplierNumber) {
    const reason = 'supplier not synced to e-conomic (missing external_supplier_id)'
    await logAttempt({ entity_type: 'invoice', entity_id: incomingInvoiceId, action: 'create', status: 'failed', error_message: reason })
    return { ok: false, status: 'failed', error: reason }
  }

  const costAccount = (cfg as { costAccountNumber?: number }).costAccountNumber
  if (!costAccount) {
    const reason = 'config.costAccountNumber not set'
    await logAttempt({ entity_type: 'invoice', entity_id: incomingInvoiceId, action: 'create', status: 'skipped', error_message: reason })
    return { ok: false, status: 'skipped', reason }
  }

  // Lines (best-effort udlæsning) + body via fælles mapping (samme som
  // forhåndsvisningen): bogført omkostning = fakturaens beløb ekskl. moms.
  const { data: lineRows } = await supabase
    .from('incoming_invoice_lines')
    .select('line_number, description, quantity, unit_price, total_price')
    .eq('incoming_invoice_id', incomingInvoiceId)
    .order('line_number', { ascending: true })

  const draft = buildEconomicSupplierInvoiceDraft({
    invoice: inv,
    supplierNumber: economicSupplierNumber,
    lines: lineRows ?? [],
    config: { costAccountNumber: costAccount },
  })
  if (!draft.canPost) {
    const reason = draft.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')
    await logAttempt({ entity_type: 'invoice', entity_id: incomingInvoiceId, action: 'create', status: 'failed', error_message: reason })
    return { ok: false, status: 'failed', error: reason }
  }
  const body = draft.body

  const supClaimValue = `${EXPORT_CLAIM_PREFIX}${Date.now()}`
  const supClaimQ = supabase.from('incoming_invoices').update({ external_invoice_id: supClaimValue }).eq('id', incomingInvoiceId).eq('status', 'approved')
  const { data: supClaimed } = await (supPending ? supClaimQ.eq('external_invoice_id', supPending) : supClaimQ.is('external_invoice_id', null)).select('id')
  if (!supClaimed || supClaimed.length !== 1) {
    await logAttempt({ entity_type: 'invoice', entity_id: incomingInvoiceId, action: 'skip', status: 'skipped', error_message: 'export claimed by another run' })
    return { ok: false, status: 'skipped', reason: 'export in progress' }
  }
  const releaseSupClaim = () => supabase.from('incoming_invoices').update({ external_invoice_id: null }).eq('id', incomingInvoiceId).eq('external_invoice_id', supClaimValue)

  let res: Awaited<ReturnType<typeof economicFetch<{ draftSupplierInvoiceNumber: number }>>>
  try {
    res = await economicFetch<{ draftSupplierInvoiceNumber: number }>(
      ready,
      '/supplier-invoices/drafts',
      { method: 'POST', body }
    )
  } catch (err) {
    // A-4b: ukendt udfald — kravet bliver (ingen frigivelse → ingen dobbelt bogføring ved genforsøg)
    res = { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) }
  }

  if (exportOutcomeUncertain(res)) {
    await logAttempt({
      entity_type: 'invoice',
      entity_id: incomingInvoiceId,
      action: 'create',
      status: 'failed',
      error_message: `${EXPORT_UNCERTAIN_MARK} ${res.error || `HTTP ${res.status}`}`.slice(0, 500),
      request_meta: { http_status: res.status, uncertain: true, claim: supClaimValue, kind: 'supplier_invoice' },
    })
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      await logHealth('economic', 'warning', 'Leverandørfaktura-bogføring med ukendt udfald (netværk/timeout/5xx) — tjek kladder i e-conomic før genforsøg', { incomingInvoiceId })
    } catch { /* never crash */ }
    return { ok: false, status: 'failed', reason: 'export uncertain', error: SUPPLIER_POSTING_UNCERTAIN_TEXT }
  }

  if (!res.ok || !res.data?.draftSupplierInvoiceNumber) {
    await releaseSupClaim()
    await logAttempt({
      entity_type: 'invoice',
      entity_id: incomingInvoiceId,
      action: 'create',
      status: 'failed',
      error_message: res.error || `HTTP ${res.status}`,
      request_meta: { http_status: res.status },
    })
    return { ok: false, status: 'failed', error: res.error || `HTTP ${res.status}` }
  }

  const externalId = `draft-${String(res.data.draftSupplierInvoiceNumber)}`
  await supabase
    .from('incoming_invoices')
    .update({
      external_invoice_id: externalId,
      external_provider: 'economic',
      status: 'posted',
      posted_at: new Date().toISOString(),
    })
    .eq('id', incomingInvoiceId)
    // Leverandørfaktura-review 2026-10-14 (#6): kun hvis kravet stadig er vores (ikke afvist/overtaget imens)
    .eq('external_invoice_id', supClaimValue)

  await logAttempt({
    entity_type: 'invoice',
    entity_id: incomingInvoiceId,
    action: 'create',
    status: 'success',
    external_id: externalId,
    response_meta: { draftSupplierInvoiceNumber: res.data.draftSupplierInvoiceNumber },
  })
  await touchLastSyncAt()
  console.log('ECONOMIC SUPPLIER INVOICE POSTED:', incomingInvoiceId, '→', externalId)
  return {
    ok: true,
    status: 'success',
    externalId,
    data: { draftSupplierInvoiceNumber: String(res.data.draftSupplierInvoiceNumber) },
  }
}
