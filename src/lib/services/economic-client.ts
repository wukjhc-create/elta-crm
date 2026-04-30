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
// Settings + readiness
// =====================================================

export async function getEconomicSettings(): Promise<AccountingSettings | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('accounting_integration_settings')
    .select('*')
    .eq('provider', PROVIDER)
    .maybeSingle()
  if (error || !data) return null
  return data as AccountingSettings
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

  // Lines.
  const { data: lineRows } = await supabase
    .from('invoice_lines')
    .select('position, description, quantity, unit_price')
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: true })

  const lines = (lineRows ?? []).map((l, i) => ({
    lineNumber: l.position || i + 1,
    description: (l.description || '').slice(0, 1000),
    quantity: Number(l.quantity) || 0,
    unitNetPrice: Number(l.unit_price) || 0,
    product: { productNumber: cfg.defaultProductNumber || '1' },
  }))

  if (lines.length === 0) {
    await logAttempt({ entity_type: 'invoice', entity_id: invoiceId, action: 'create', status: 'failed', error_message: 'no invoice lines' })
    return { ok: false, status: 'failed', error: 'no invoice lines' }
  }

  const draftBody = {
    currency: inv.currency || 'DKK',
    date: (inv.created_at || new Date().toISOString()).slice(0, 10),
    paymentTerms: { paymentTermsNumber },
    customer: { customerNumber: Number(customerNumber) },
    recipient: {
      name: cust.company_name || cust.contact_person || 'Kunde',
      address: cust.billing_address || undefined,
      zip: cust.billing_postal_code || undefined,
      city: cust.billing_city || undefined,
      country: cust.billing_country || 'Denmark',
      vatZone: { vatZoneNumber },
    },
    layout: { layoutNumber },
    references: { other: inv.invoice_number },
    lines,
  }

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
    .select('id, currency, final_amount, amount_paid, payment_status, external_invoice_id, external_provider, payment_reference')
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

  // Post a customer payment voucher entry to the cashbook.
  // amount is the customer side (debit on receivables → credited here).
  const amount = Number(inv.amount_paid) || Number(inv.final_amount)
  const today = new Date().toISOString().slice(0, 10)

  const body = {
    text: `Indbetaling faktura ${inv.external_invoice_id}`,
    amount: -Math.abs(amount), // negative = customer payment in (reduces receivables)
    currency: { code: inv.currency || 'DKK' },
    date: today,
    contraAccount: { accountNumber: cfg.bankContraAccountNumber },
    customer: undefined as { customerNumber: number } | undefined, // resolved below if we have it
    customerInvoice: { bookedInvoiceNumber: Number(inv.external_invoice_id) },
  }

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
