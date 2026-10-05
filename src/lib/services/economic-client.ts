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

async function economicFetch<T = unknown>(
  settings: AccountingSettings & { api_token: string; agreement_grant_token: string },
  path: string,
  opts: FetchOptions = {}
): Promise<{ ok: boolean; status: number; data: T | null; error?: string; raw?: string }> {
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
    return { ok: false, status: 'skipped', reason: 'ECONOMIC_NOT_CONFIGURED' }
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

  const cfg = ready.config || {}
  const body = {
    name: cust.company_name || cust.contact_person || 'Unknown',
    email: cust.email || undefined,
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
  })

  if (!res.ok || !res.data?.customerNumber) {
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
  await supabase
    .from('customers')
    .update({ external_customer_id: externalId, external_provider: PROVIDER })
    .eq('id', customerId)

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
  const settings = await loadReadySettings('invoice', invoiceId, 'create')
  if (!settings) {
    return { ok: false, status: 'skipped', reason: 'ECONOMIC_NOT_CONFIGURED' }
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

  // Idempotency.
  if (inv.external_invoice_id && inv.external_provider === PROVIDER) {
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

  const draftRes = await economicFetch<{ draftInvoiceNumber: number }>(ready, '/invoices/drafts', {
    method: 'POST',
    body: draftBody,
  })

  if (!draftRes.ok || !draftRes.data?.draftInvoiceNumber) {
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

  // Optional: book the draft immediately so the invoice gets a final
  // booked number. Defaults to true for our flow.
  if (cfg.autoBookOnCreate !== false) {
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
  await supabase
    .from('invoices')
    .update({ external_invoice_id: externalId, external_provider: PROVIDER })
    .eq('id', invoiceId)

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
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_number, currency, created_at, total_amount, customer_id, external_invoice_id, external_provider')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!inv) return { ok: false, error: 'Faktura ikke fundet' }

  const [{ data: settingsRow }, { data: cust }, { data: lineRows }] = await Promise.all([
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
      : Promise.resolve({ data: null }),
    supabase
      .from('invoice_lines')
      .select('position, description, quantity, unit_price, total_price')
      .eq('invoice_id', invoiceId)
      .order('position', { ascending: true }),
  ])

  const s = settingsRow as { active?: boolean; config?: EconomicConfig | null; api_token?: string | null; agreement_grant_token?: string | null } | null
  const c = cust as { external_customer_id?: string | null; external_provider?: string | null } | null
  const linkedNumber =
    c?.external_customer_id && c.external_provider === PROVIDER ? Number(c.external_customer_id) : null

  const draft = buildEconomicInvoiceDraft({
    invoice: inv,
    customer: (cust ?? {}) as Record<string, string | null>,
    customerNumber: Number.isFinite(linkedNumber) ? linkedNumber : null,
    lines: lineRows ?? [],
    config: s?.config ?? {},
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
      integration_ready: Boolean(s?.active && s?.api_token && s?.agreement_grant_token),
      external_id: inv.external_provider === PROVIDER ? inv.external_invoice_id : null,
      draft,
    },
  }
}

export interface EconomicSupplierInvoicePreview {
  integration_ready: boolean
  external_id: string | null
  draft: SupplierInvoiceDraft
}

/** Hvad pushSupplierInvoiceToEconomic ville bogføre — ingen netværk/skrivning, ingen nøgler læst ud. */
export async function previewSupplierInvoiceForEconomic(
  incomingInvoiceId: string
): Promise<{ ok: true; data: EconomicSupplierInvoicePreview } | { ok: false; error: string }> {
  const supabase = createAdminClient()
  const { data: inv } = await supabase
    .from('incoming_invoices')
    .select('id, supplier_id, invoice_number, invoice_date, due_date, currency, amount_excl_vat, vat_amount, amount_incl_vat, payment_reference, external_invoice_id, external_provider')
    .eq('id', incomingInvoiceId)
    .maybeSingle()
  if (!inv) return { ok: false, error: 'Faktura ikke fundet' }
  const [{ data: settingsRow }, { data: sup }, { data: lineRows }] = await Promise.all([
    supabase.from('accounting_integration_settings').select('active, config, api_token, agreement_grant_token').eq('provider', PROVIDER).maybeSingle(),
    inv.supplier_id
      ? supabase.from('suppliers').select('external_supplier_id, external_provider').eq('id', inv.supplier_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('incoming_invoice_lines').select('line_number, description, quantity, unit_price, total_price').eq('incoming_invoice_id', incomingInvoiceId).order('line_number', { ascending: true }),
  ])
  const s = settingsRow as { active?: boolean; config?: EconomicConfig | null; api_token?: string | null; agreement_grant_token?: string | null } | null
  const sp = sup as { external_supplier_id?: string | null; external_provider?: string | null } | null
  const n = sp?.external_supplier_id && sp.external_provider === PROVIDER ? Number(sp.external_supplier_id) : NaN
  const draft = buildEconomicSupplierInvoiceDraft({
    invoice: inv,
    supplierNumber: Number.isFinite(n) ? n : null,
    lines: lineRows ?? [],
    config: { costAccountNumber: (s?.config as { costAccountNumber?: number } | null)?.costAccountNumber ?? null },
  })
  return {
    ok: true,
    data: {
      integration_ready: Boolean(s?.active && s?.api_token && s?.agreement_grant_token),
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
  | { ok: true; data: { entry: ReturnType<typeof buildEconomicPaymentEntry>; synced: boolean; configured: boolean; alreadyMarkedPaid: boolean } }
  | { ok: false; error: string }
> {
  const supabase = createAdminClient()
  const [{ data: inv }, { data: settingsRow }, { data: prevPaid }] = await Promise.all([
    supabase.from('invoices')
      .select('id, currency, final_amount, amount_paid, payment_status, paid_at, external_invoice_id, external_provider')
      .eq('id', invoiceId).maybeSingle(),
    supabase.from('accounting_integration_settings').select('config').eq('provider', PROVIDER).maybeSingle(),
    supabase.from('accounting_sync_log').select('id').eq('entity_type', 'invoice').eq('entity_id', invoiceId)
      .eq('action', 'mark_paid').eq('status', 'success').limit(1).maybeSingle(),
  ])
  if (!inv) return { ok: false, error: 'Faktura ikke fundet' }
  const cfg: EconomicConfig = ((settingsRow as { config?: EconomicConfig } | null)?.config) || {}
  const synced = !!inv.external_invoice_id && inv.external_provider === PROVIDER
  const entry = buildEconomicPaymentEntry({ invoice: inv, config: cfg })
  return { ok: true, data: { entry, synced, configured: !!cfg.cashbookNumber && !!cfg.bankContraAccountNumber, alreadyMarkedPaid: !!prevPaid } }
}

// =====================================================
// Mark paid (cashbook entry)
// =====================================================

export async function markInvoicePaidInEconomic(
  invoiceId: string
): Promise<EconomicResult<{ voucherNumber?: string }>> {
  const settings = await loadReadySettings('invoice', invoiceId, 'mark_paid')
  if (!settings) {
    return { ok: false, status: 'skipped', reason: 'ECONOMIC_NOT_CONFIGURED' }
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
  const settings = await loadReadySettings('invoice', incomingInvoiceId, 'create')
  if (!settings) {
    return { ok: false, status: 'skipped', reason: 'ECONOMIC_NOT_CONFIGURED' }
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
  if (inv.external_invoice_id && inv.external_provider === 'economic') {
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

  const res = await economicFetch<{ draftSupplierInvoiceNumber: number }>(
    ready,
    '/supplier-invoices/drafts',
    { method: 'POST', body }
  )

  if (!res.ok || !res.data?.draftSupplierInvoiceNumber) {
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
