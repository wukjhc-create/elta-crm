'use server'

/**
 * Sprint Ø6.0 — Regnskabsstatus + manuel e-conomic-eksport (fundament).
 *
 * Bygger OVEN PÅ den eksisterende integration (economic-client.ts +
 * accounting_integration_settings + accounting_sync_log + invoices
 * .external_invoice_id/.external_provider). INGEN nye status-kolonner,
 * intet dobbelt system — status afledes af eksisterende data.
 *
 * Cost-free: kun kundevendte faktura-/salgsdata + ekstern reference.
 * INGEN hemmeligheder eksponeres (api_token/agreement_grant_token).
 */

import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import type { AccountingAction, AccountingEntityType, AccountingStatus } from '@/types/accounting.types'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  friendlyEconomicError,
  computeAccountingHealthSummary,
  type AccountingHealthSummary,
} from '@/lib/services/accounting-health'

export type InvoiceAccountingStatus = 'not_exported' | 'ready' | 'needs_fix' | 'exported' | 'error'

export interface InvoiceAccountingState {
  ok: boolean
  message?: string
  status: InvoiceAccountingStatus
  external_id: string | null
  exported_at: string | null
  error: string | null
  provider: string
  integration_ready: boolean
  /** Fakturaspecifikke fejl der ville få eksporten afvist (beløbsafvigelse, ingen linjer/kunde). */
  blocking_issues: string[]
}

const PROVIDER = 'economic'

export async function getInvoiceAccountingStatusAction(
  invoiceId: string
): Promise<InvoiceAccountingState> {
  const fallback: InvoiceAccountingState = {
    ok: false,
    status: 'not_exported',
    external_id: null,
    exported_at: null,
    error: null,
    provider: PROVIDER,
    integration_ready: false,
    blocking_issues: [],
  }
  try {
    validateUUID(invoiceId, 'id')
  } catch (err) {
    return { ...fallback, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }

  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.view.all')) {
    return { ...fallback, message: 'Manglende tilladelse: invoices.view.all' }
  }

  // Cost-free select — kun status/ekstern reference, ingen kost.
  const { data: inv } = await supabase
    .from('invoices')
    .select('status, voided_at, external_invoice_id, external_provider')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!inv) return { ...fallback, message: 'Faktura ikke fundet' }

  // Seneste sync-log for fakturaen (kun ekstern reference/fejl — ingen kost).
  const { data: log } = await supabase
    .from('accounting_sync_log')
    .select('status, external_id, error_message, created_at')
    .eq('entity_type', 'invoice')
    .eq('entity_id', invoiceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Integrations-parathed (uden at eksponere hemmeligheder).
  let integrationReady = false
  try {
    const { getEconomicSettings, isEconomicReady } = await import('@/lib/services/economic-client')
    integrationReady = isEconomicReady(await getEconomicSettings())
  } catch (e) {
    logger.error('getInvoiceAccountingStatusAction: settings read failed', { error: e })
  }

  const exported = !!inv.external_invoice_id && inv.external_provider === PROVIDER
  let status: InvoiceAccountingStatus
  if (exported) status = 'exported'
  else if (log?.status === 'failed') status = 'error'
  else if ((inv.status === 'sent' || inv.status === 'paid') && !inv.voided_at) status = 'ready'
  else status = 'not_exported'

  // "Klar" kun hvis eksporten faktisk ville gå igennem for netop denne faktura
  // (samme kontrol som eksporten). Manglende opsætning er global → vises som banner.
  let blockingIssues: string[] = []
  if (status === 'ready') {
    try {
      const { previewInvoiceForEconomic } = await import('@/lib/services/economic-client')
      const pv = await previewInvoiceForEconomic(invoiceId)
      if (pv.ok) {
        blockingIssues = pv.data.draft.issues
          .filter((i) => i.severity === 'error' && i.code !== 'missing_config')
          .map((i) => i.message)
        if (blockingIssues.length > 0) status = 'needs_fix'
      }
    } catch (e) {
      logger.error('getInvoiceAccountingStatusAction: preview failed', { error: e })
    }
  }

  return {
    ok: true,
    status,
    external_id: (inv.external_invoice_id as string | null) ?? null,
    exported_at: exported ? ((log?.created_at as string | null) ?? null) : null,
    error: status === 'error' ? ((log?.error_message as string | null) ?? null) : null,
    provider: PROVIDER,
    integration_ready: integrationReady,
    blocking_issues: blockingIssues,
  }
}

export interface ExportInvoiceResult {
  ok: boolean
  status: 'exported' | 'not_configured' | 'already_exported' | 'failed'
  message: string
  external_id?: string | null
}

/**
 * Forhåndsvisning af hvad "Eksportér til e-conomic" ville sende for fakturaen —
 * ingen netværk, ingen skrivning, ingen nøgler. Gated som eksporten.
 */
export async function getEconomicInvoicePreviewAction(
  invoiceId: string
): Promise<
  | { ok: true; data: import('@/lib/services/economic-client').EconomicInvoicePreview }
  | { ok: false; message: string }
> {
  try {
    validateUUID(invoiceId, 'id')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ok: false, message: 'Manglende tilladelse: settings.economic' }
  }
  const { previewInvoiceForEconomic } = await import('@/lib/services/economic-client')
  const res = await previewInvoiceForEconomic(invoiceId)
  return res.ok ? { ok: true, data: res.data } : { ok: false, message: res.error }
}

/** N46: "Vis hvad der sendes" for kundebetalingen (kassekladde) — ingen netværk/skrivning. settings.economic. */
export async function getEconomicPaymentPreviewAction(
  invoiceId: string
): Promise<
  | { ok: true; data: Extract<Awaited<ReturnType<typeof import('@/lib/services/economic-client').previewPaymentForEconomic>>, { ok: true }>['data'] }
  | { ok: false; message: string }
> {
  try {
    validateUUID(invoiceId, 'id')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ok: false, message: 'Manglende tilladelse: settings.economic' }
  }
  const { previewPaymentForEconomic } = await import('@/lib/services/economic-client')
  const res = await previewPaymentForEconomic(invoiceId)
  return res.ok ? { ok: true, data: res.data } : { ok: false, message: res.error }
}

export async function exportInvoiceToEconomicAction(
  invoiceId: string
): Promise<ExportInvoiceResult> {
  try {
    validateUUID(invoiceId, 'id')
  } catch (err) {
    return { ok: false, status: 'failed', message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }

  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ok: false, status: 'failed', message: 'Manglende tilladelse: settings.economic' }
  }

  const { getEconomicSettings, isEconomicReady, createInvoiceInEconomic } = await import(
    '@/lib/services/economic-client'
  )

  if (!isEconomicReady(await getEconomicSettings())) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'e-conomic er ikke opsat endnu. Kontakt en administrator for at konfigurere integrationen.',
    }
  }

  // Genbruger den eksisterende, sikre klient (skipper rent ved manglende config).
  const result = await createInvoiceInEconomic(invoiceId)

  // Bruger-attribueret audit (oven i system-sync-loggen). Best-effort.
  const audit = async (action: string, description: string, metadata: Record<string, unknown>) => {
    try {
      await insertAuditRow({
        user_id: userId,
        entity_type: 'invoice',
        entity_id: invoiceId,
        entity_name: null,
        action,
        action_description: description,
        changes: {},
        metadata: { provider: PROVIDER, ...metadata },
      })
    } catch (e) {
      logger.error('exportInvoiceToEconomicAction: audit failed', { error: e })
    }
  }

  if (result.ok && result.status === 'success') {
    await audit('invoice_accounting_exported', `Faktura eksporteret til e-conomic (${result.externalId})`, {
      external_id: result.externalId ?? null,
    })
    return { ok: true, status: 'exported', message: 'Faktura eksporteret til e-conomic.', external_id: result.externalId ?? null }
  }
  if (result.status === 'skipped') {
    // Allerede eksporteret eller config-skip.
    const already = (result.reason ?? '').includes('NOT_CONFIGURED') ? false : true
    if (already) {
      return { ok: true, status: 'already_exported', message: 'Fakturaen er allerede eksporteret til e-conomic.', external_id: result.externalId ?? null }
    }
    return { ok: false, status: 'not_configured', message: 'e-conomic er ikke opsat endnu.' }
  }
  await audit('invoice_accounting_export_failed', `Eksport til e-conomic fejlede: ${result.error ?? 'ukendt'}`, {
    reason: result.reason ?? null,
  })
  return { ok: false, status: 'failed', message: `Eksport fejlede: ${result.error ?? 'ukendt fejl'}` }
}

export interface BulkExportItemResult {
  invoice_id: string
  invoice_number: string | null
  status: 'exported' | 'skipped' | 'failed'
  reason?: string
  external_id?: string | null
}

export interface BulkExportResult {
  ok: boolean
  message?: string
  status: 'done' | 'not_configured'
  attempted: number
  exported: number
  skipped: number
  failed: number
  items: BulkExportItemResult[]
}

const BULK_EXPORT_MAX = 25

/**
 * Sprint Ø6.1 — defensiv bulk-eksport af valgte fakturaer til e-conomic.
 * Genbruger den eksisterende klient (createInvoiceInEconomic). Springer over:
 * allerede eksporterede, annullerede, kreditnotaer (ikke understøttet sikkert)
 * og kladder der ikke er klar. Bulk-audit. Ingen secrets, ingen kost.
 */
export async function bulkExportInvoicesToEconomicAction(
  invoiceIds: string[]
): Promise<BulkExportResult> {
  const empty: BulkExportResult = {
    ok: false, status: 'done', attempted: 0, exported: 0, skipped: 0, failed: 0, items: [],
  }
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ...empty, message: 'Manglende tilladelse: settings.economic' }
  }

  const ids = Array.from(new Set(invoiceIds.filter(Boolean))).slice(0, BULK_EXPORT_MAX)
  if (ids.length === 0) return { ...empty, ok: true, message: 'Ingen fakturaer valgt' }

  const { getEconomicSettings, isEconomicReady, createInvoiceInEconomic } = await import(
    '@/lib/services/economic-client'
  )
  if (!isEconomicReady(await getEconomicSettings())) {
    return { ...empty, status: 'not_configured', message: 'e-conomic er ikke opsat endnu.' }
  }

  // Cost-free batch-hent af de valgte fakturaers status (ingen kost-kolonner).
  const { data: invs } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, voided_at, invoice_type, external_invoice_id, external_provider')
    .in('id', ids)
  const byId = new Map((invs ?? []).map((i) => [i.id as string, i]))

  const items: BulkExportItemResult[] = []
  for (const id of ids) {
    const inv = byId.get(id)
    const invoiceNumber = (inv?.invoice_number as string | null) ?? null
    if (!inv) {
      items.push({ invoice_id: id, invoice_number: null, status: 'skipped', reason: 'Faktura ikke fundet' })
      continue
    }
    if (inv.external_invoice_id && inv.external_provider === PROVIDER) {
      items.push({ invoice_id: id, invoice_number: invoiceNumber, status: 'skipped', reason: 'Allerede eksporteret', external_id: inv.external_invoice_id as string })
      continue
    }
    if (inv.voided_at) {
      items.push({ invoice_id: id, invoice_number: invoiceNumber, status: 'skipped', reason: 'Annulleret' })
      continue
    }
    if (inv.invoice_type === 'credit') {
      items.push({ invoice_id: id, invoice_number: invoiceNumber, status: 'skipped', reason: 'Kreditnota — eksporteres ikke automatisk' })
      continue
    }
    if (inv.status !== 'sent' && inv.status !== 'paid') {
      items.push({ invoice_id: id, invoice_number: invoiceNumber, status: 'skipped', reason: 'Ikke klar (kun sendte/betalte)' })
      continue
    }
    try {
      const res = await createInvoiceInEconomic(id)
      if (res.ok && res.status === 'success') {
        items.push({ invoice_id: id, invoice_number: invoiceNumber, status: 'exported', external_id: res.externalId ?? null })
      } else if (res.status === 'skipped') {
        items.push({ invoice_id: id, invoice_number: invoiceNumber, status: 'skipped', reason: 'Allerede eksporteret', external_id: res.externalId ?? null })
      } else {
        items.push({ invoice_id: id, invoice_number: invoiceNumber, status: 'failed', reason: res.error ?? 'ukendt fejl' })
      }
    } catch (e) {
      logger.error('bulkExportInvoicesToEconomicAction: export threw', { entityId: id, error: e })
      items.push({ invoice_id: id, invoice_number: invoiceNumber, status: 'failed', reason: 'uventet fejl' })
    }
  }

  const exported = items.filter((i) => i.status === 'exported').length
  const skipped = items.filter((i) => i.status === 'skipped').length
  const failed = items.filter((i) => i.status === 'failed').length

  // Bulk-audit — hvem, antal forsøgt/succes/fejl/sprunget over, invoice_ids.
  try {
    await insertAuditRow({
      user_id: userId,
      entity_type: 'invoice',
      entity_id: null,
      entity_name: 'Bulk e-conomic-eksport',
      action: 'invoices_accounting_bulk_exported',
      action_description: `Bulk-eksport til e-conomic: ${exported} eksporteret, ${skipped} sprunget over, ${failed} fejl (${ids.length} forsøgt)`,
      changes: { attempted: ids.length, exported, skipped, failed },
      metadata: { provider: PROVIDER, invoice_ids: ids },
    })
  } catch (e) {
    logger.error('bulkExportInvoicesToEconomicAction: audit failed', { error: e })
  }

  return { ok: true, status: 'done', attempted: ids.length, exported, skipped, failed, items }
}

export interface EconomicIntegrationStatus {
  ok: boolean
  message?: string
  configured: boolean
  active: boolean
  provider: string
  last_sync_at: string | null
  /** Krypteringsnøgle (ENCRYPTION_KEY) er sat — påkrævet for at gemme nøgler. */
  encryption_ready: boolean
  /** Maskerede nøgler — fx "••••abcd". Aldrig den rå værdi. */
  api_token_masked: string | null
  grant_token_masked: string | null
  /** Sidste forbindelsestest (fra config.connectionTest — ingen secret). */
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_message: string | null
  /** Ikke-hemmelige konfig-numre (layout/betalingsbetingelser/momszone). */
  config_summary: {
    layoutNumber: number | null
    paymentTermsNumber: number | null
    vatZoneNumber: number | null
    autoBookOnCreate: boolean
    /** N12: leverandørfakturaer bogføres på denne omkostningskonto */
    costAccountNumber: number | null
    /** N12: betalinger registreres i denne kassekladde mod denne bankkonto */
    cashbookNumber: number | null
    bankContraAccountNumber: number | null
    /** N12: nye kunder/linjer i e-conomic (før stille standard "1") */
    defaultCustomerGroupNumber: number | null
    defaultProductNumber: string | null
  }
  /** N12: hvad mangler før hvert flow kan køre (ingen bogføring sker herfra) */
  readiness: EconomicReadiness
}

export interface EconomicReadinessItem { key: string; label: string; ok: boolean; hint: string }
export interface EconomicReadiness {
  items: EconomicReadinessItem[]
  customerInvoices: boolean
  supplierInvoices: boolean
  payments: boolean
  suppliersMapped: number
  suppliersTotal: number
}

/** Maskér en hemmelighed til visning: "••••" + sidste 4 tegn. Aldrig rå. */
function maskToken(token: string | null | undefined): string | null {
  if (!token) return null
  const last4 = token.length >= 4 ? token.slice(-4) : token
  return '••••' + last4
}

/** N12: tjekliste for e-conomic — hvad mangler før kundefakturaer, leverandørfakturaer og betalinger kan bogføres. */
async function economicReadiness(credentials: boolean, testOk: boolean | null, cfg: EconomicIntegrationStatus['config_summary']): Promise<EconomicReadiness> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const [{ count: total }, { count: mapped }] = await Promise.all([
    admin.from('suppliers').select('id', { count: 'exact', head: true }),
    admin.from('suppliers').select('id', { count: 'exact', head: true }).eq('external_provider', 'economic').not('external_supplier_id', 'is', null),
  ])
  // Kunder med sendte/betalte (ikke-eksporterede) fakturaer uden e-conomic-kobling
  // — de ville blive oprettet som NYE debitorer ved eksport.
  // side for side (PostgREST max_rows 1000 — .limit(5000) gav et udsnit)
  const billed = await fetchAllRows<{ id: string; customer_id: string }>((from, to) => admin
    .from('invoices')
    .select('id, customer_id')
    .in('status', ['sent', 'paid'])
    .is('external_invoice_id', null)
    .not('customer_id', 'is', null)
    .order('id')
    .range(from, to))
  const billedIds = [...new Set(((billed ?? []) as Array<{ customer_id: string }>).map((b) => b.customer_id))]
  let unlinkedCustomers = 0
  for (let i = 0; i < billedIds.length; i += 200) {
    const chunk = billedIds.slice(i, i + 200)
    const { count } = await admin
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .in('id', chunk)
      .or('external_provider.is.null,external_provider.neq.economic,external_customer_id.is.null')
    unlinkedCustomers += count ?? 0
  }
  const items: EconomicReadinessItem[] = [
    { key: 'credentials', label: 'Nøgler gemt', ok: credentials, hint: 'App-hemmelighed og aftale-token fra e-conomic' },
    { key: 'connection', label: 'Forbindelse testet', ok: testOk === true, hint: testOk === false ? 'Seneste test fejlede — tjek nøglerne' : 'Klik "Test forbindelse"' },
    { key: 'layout', label: 'Layout', ok: cfg.layoutNumber != null, hint: 'Fakturalayout i e-conomic' },
    { key: 'paymentTerms', label: 'Betalingsbetingelser', ok: cfg.paymentTermsNumber != null, hint: 'Fx netto 8 dage' },
    { key: 'vatZone', label: 'Momszone', ok: cfg.vatZoneNumber != null, hint: 'Typisk 1 = Indenlandsk' },
    { key: 'customerGroup', label: 'Kundegruppe', ok: cfg.defaultCustomerGroupNumber != null, hint: 'Bruges når nye kunder oprettes i e-conomic (ellers 1)' },
    { key: 'product', label: 'Varenummer til fakturalinjer', ok: cfg.defaultProductNumber != null, hint: 'Varenr. i e-conomic til linjer (ellers "1")' },
    { key: 'costAccount', label: 'Omkostningskonto (leverandørfakturaer)', ok: cfg.costAccountNumber != null, hint: 'Konto som leverandørfakturaer bogføres på' },
    { key: 'cashbook', label: 'Kassekladde + bankkonto (betalinger)', ok: cfg.cashbookNumber != null && cfg.bankContraAccountNumber != null, hint: 'Kassekladde-nr. og bankens modkonto' },
    { key: 'suppliers', label: 'Leverandører koblet til e-conomic', ok: (total ?? 0) > 0 && (mapped ?? 0) === (total ?? 0), hint: `${mapped ?? 0} af ${total ?? 0} har e-conomic-leverandørnr. (sættes på leverandøren)` },
    {
      key: 'customers',
      label: 'Fakturerede kunder koblet til e-conomic',
      ok: unlinkedCustomers === 0,
      hint: unlinkedCustomers === 0
        ? 'Alle kunder med sendte fakturaer er koblet'
        : `${unlinkedCustomers} kunde${unlinkedCustomers === 1 ? '' : 'r'} med sendte fakturaer er ikke koblet — findes de i e-conomic, så kobl kundenr. (kundekort → Fakturaer), ellers oprettes nye debitorer ved eksport`,
    },
  ]
  const ok = (k: string) => items.find((i) => i.key === k)!.ok
  const base = ok('credentials') && ok('connection')
  return {
    items,
    customerInvoices: base && ok('layout') && ok('paymentTerms') && ok('vatZone'),
    supplierInvoices: base && ok('costAccount') && (mapped ?? 0) > 0,
    payments: base && ok('cashbook'),
    suppliersMapped: mapped ?? 0,
    suppliersTotal: total ?? 0,
  }
}

export async function getEconomicIntegrationStatusAction(): Promise<EconomicIntegrationStatus> {
  const fallback: EconomicIntegrationStatus = {
    ok: false,
    configured: false,
    active: false,
    provider: PROVIDER,
    last_sync_at: null,
    encryption_ready: false,
    api_token_masked: null,
    grant_token_masked: null,
    last_tested_at: null,
    last_test_ok: null,
    last_test_message: null,
    config_summary: { layoutNumber: null, paymentTermsNumber: null, vatZoneNumber: null, autoBookOnCreate: false,
      costAccountNumber: null, cashbookNumber: null, bankContraAccountNumber: null, defaultCustomerGroupNumber: null, defaultProductNumber: null },
    readiness: { items: [], customerInvoices: false, supplierInvoices: false, payments: false, suppliersMapped: 0, suppliersTotal: 0 },
  }
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ...fallback, message: 'Manglende tilladelse: settings.economic' }
  }
  try {
    const { getEconomicSettings, isEconomicReady } = await import('@/lib/services/economic-client')
    const { isEncryptionConfigured } = await import('@/lib/utils/encryption')
    const s = await getEconomicSettings() // tokens er dekrypteret in-memory
    const cfg = s?.config ?? {}
    const test = cfg.connectionTest ?? null
    const c = cfg as Record<string, unknown>
    const n = (k: string) => (typeof c[k] === 'number' && Number.isFinite(c[k] as number) ? (c[k] as number) : null)
    const summary: EconomicIntegrationStatus['config_summary'] = {
      layoutNumber: n('layoutNumber'), paymentTermsNumber: n('paymentTermsNumber'), vatZoneNumber: n('vatZoneNumber'),
      autoBookOnCreate: !!cfg.autoBookOnCreate, costAccountNumber: n('costAccountNumber'), cashbookNumber: n('cashbookNumber'),
      bankContraAccountNumber: n('bankContraAccountNumber'), defaultCustomerGroupNumber: n('defaultCustomerGroupNumber'),
      defaultProductNumber: typeof c.defaultProductNumber === 'string' && c.defaultProductNumber ? (c.defaultProductNumber as string) : null,
    }
    return {
      ok: true,
      configured: isEconomicReady(s),
      active: !!s?.active,
      provider: PROVIDER,
      last_sync_at: s?.last_sync_at ?? null,
      encryption_ready: isEncryptionConfigured(),
      api_token_masked: maskToken(s?.api_token),
      grant_token_masked: maskToken(s?.agreement_grant_token),
      last_tested_at: test?.at ?? null,
      last_test_ok: test ? !!test.ok : null,
      last_test_message: test?.message ?? null,
      config_summary: summary,
      readiness: await economicReadiness(isEconomicReady(s), test ? !!test.ok : null, summary),
    }
  } catch (e) {
    logger.error('getEconomicIntegrationStatusAction failed', { error: e })
    return { ...fallback, ok: true } // ingen secrets; bare "ikke opsat"
  }
}

// =====================================================
// Ø6.2 — sikker opsætning (gem/test/ryd)
// =====================================================

export interface SaveEconomicCredentialsInput {
  /** Tom/utdefineret = bevar eksisterende nøgle. */
  api_token?: string
  agreement_grant_token?: string
  active?: boolean
  config?: {
    layoutNumber?: number | null
    paymentTermsNumber?: number | null
    vatZoneNumber?: number | null
    autoBookOnCreate?: boolean
    costAccountNumber?: number | null
    cashbookNumber?: number | null
    bankContraAccountNumber?: number | null
    defaultCustomerGroupNumber?: number | null
    defaultProductNumber?: string | null
  }
}

export interface SaveEconomicResult {
  ok: boolean
  status: 'saved' | 'no_encryption' | 'missing_credentials' | 'denied' | 'error'
  message: string
  configured?: boolean
}

/**
 * Gem e-conomic-credentials KRYPTERET (AES-256-GCM via encryptToken). Rå
 * nøgler forlader aldrig denne funktion — hverken til DB (kun ciphertext),
 * UI, logs eller audit (kun maskeret). Blanke nøglefelter bevarer den
 * eksisterende krypterede værdi.
 */
export async function updateEconomicCredentialsAction(
  input: SaveEconomicCredentialsInput
): Promise<SaveEconomicResult> {
  const { userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ok: false, status: 'denied', message: 'Manglende tilladelse: settings.economic' }
  }

  const { isEncryptionConfigured } = await import('@/lib/utils/encryption')
  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      status: 'no_encryption',
      message: 'Kryptering er ikke konfigureret (ENCRYPTION_KEY mangler). Nøgler kan ikke gemmes sikkert.',
    }
  }

  const { encryptToken } = await import('@/lib/services/economic-client')
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  // Hent eksisterende (rå ciphertext-kolonner) for at kunne bevare nøgler.
  const { data: existing } = await admin
    .from('accounting_integration_settings')
    .select('id, api_token, agreement_grant_token, config, active')
    .eq('provider', PROVIDER)
    .maybeSingle()

  const newApiInput = (input.api_token ?? '').trim()
  const newGrantInput = (input.agreement_grant_token ?? '').trim()

  // Krypter kun nye, ikke-blanke nøgler; ellers bevar eksisterende ciphertext.
  const apiStored = newApiInput ? await encryptToken(newApiInput) : (existing?.api_token ?? null)
  const grantStored = newGrantInput ? await encryptToken(newGrantInput) : (existing?.agreement_grant_token ?? null)

  if (!apiStored || !grantStored) {
    return {
      ok: false,
      status: 'missing_credentials',
      message: 'Begge nøgler (app-hemmelighed og aftale-token) skal angives første gang.',
    }
  }

  // Flet config — bevar eksisterende felter (inkl. connectionTest), opdater de angivne.
  const prevConfig = (existing?.config ?? {}) as Record<string, unknown>
  const mergedConfig: Record<string, unknown> = { ...prevConfig }
  if (input.config) {
    for (const k of ['layoutNumber', 'paymentTermsNumber', 'vatZoneNumber', 'costAccountNumber', 'cashbookNumber', 'bankContraAccountNumber', 'defaultCustomerGroupNumber'] as const) {
      const v = input.config[k]
      if (v === null) delete mergedConfig[k]
      else if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v > 0) mergedConfig[k] = v
    }
    const prod = input.config.defaultProductNumber
    if (prod === null || prod === '') delete mergedConfig.defaultProductNumber
    else if (typeof prod === 'string' && /^[A-Za-z0-9._-]{1,25}$/.test(prod.trim())) mergedConfig.defaultProductNumber = prod.trim()
    if (typeof input.config.autoBookOnCreate === 'boolean') mergedConfig.autoBookOnCreate = input.config.autoBookOnCreate
  }

  // leverandør-/e-conomic-review: aldrig aktiv som standard — at gemme nøgler må ikke tænde live-bogføring uden et
  // eksplicit valg (UI'en sender altid sit afkrydsningsfelt)
  const active = input.active ?? existing?.active ?? false

  const { error } = await admin
    .from('accounting_integration_settings')
    .upsert(
      {
        provider: PROVIDER,
        api_token: apiStored,
        agreement_grant_token: grantStored,
        active,
        config: mergedConfig,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider' }
    )
  if (error) {
    logger.error('updateEconomicCredentialsAction: upsert failed', { error })
    return { ok: false, status: 'error', message: 'Kunne ikke gemme opsætningen.' }
  }

  // Audit — KUN maskeret, aldrig rå nøgle.
  try {
    await admin.from('audit_logs').insert({
      user_id: userId,
      entity_type: 'integration',
      entity_id: null,
      entity_name: 'e-conomic',
      action: 'economic_settings_updated',
      action_description: 'e-conomic-opsætning gemt',
      changes: {
        api_token_changed: !!newApiInput,
        grant_token_changed: !!newGrantInput,
        active,
      },
      metadata: {
        provider: PROVIDER,
        api_token_masked: maskToken(newApiInput || null),
        grant_token_masked: maskToken(newGrantInput || null),
      },
    })
  } catch (e) {
    logger.error('updateEconomicCredentialsAction: audit failed', { error: e })
  }

  return { ok: true, status: 'saved', message: 'e-conomic-opsætning gemt sikkert.', configured: active && !!apiStored && !!grantStored }
}

export interface TestEconomicResult {
  ok: boolean
  status: 'ok' | 'failed' | 'not_configured' | 'denied'
  message: string
  tested_at?: string
}

/**
 * Test forbindelsen med de GEMTE (krypterede) credentials. Kalder e-conomic
 * GET /self via klienten. Logger aldrig token. Gemmer kun et menneskeligt
 * resultat i config.connectionTest.
 */
export async function testEconomicConnectionAction(): Promise<TestEconomicResult> {
  const { userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ok: false, status: 'denied', message: 'Manglende tilladelse: settings.economic' }
  }

  const { pingEconomicConnection } = await import('@/lib/services/economic-client')
  const ping = await pingEconomicConnection()
  const at = new Date().toISOString()

  if (ping.reason === 'ECONOMIC_NOT_CONFIGURED') {
    return { ok: false, status: 'not_configured', message: ping.message, tested_at: at }
  }

  // Persistér testresultat i config (ingen secret) + audit.
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: row } = await admin
      .from('accounting_integration_settings')
      .select('config')
      .eq('provider', PROVIDER)
      .maybeSingle()
    const cfg = (row?.config ?? {}) as Record<string, unknown>
    cfg.connectionTest = { at, ok: ping.ok, message: ping.message }
    await admin
      .from('accounting_integration_settings')
      .update({ config: cfg, updated_at: at })
      .eq('provider', PROVIDER)

    await admin.from('audit_logs').insert({
      user_id: userId,
      entity_type: 'integration',
      entity_id: null,
      entity_name: 'e-conomic',
      action: 'economic_connection_tested',
      action_description: `Forbindelsestest: ${ping.ok ? 'OK' : 'fejlede'}`,
      changes: { ok: ping.ok },
      metadata: { provider: PROVIDER, message: ping.message },
    })
  } catch (e) {
    logger.error('testEconomicConnectionAction: persist failed', { error: e })
  }

  return { ok: ping.ok, status: ping.ok ? 'ok' : 'failed', message: ping.message, tested_at: at }
}

export interface ClearEconomicResult {
  ok: boolean
  status: 'cleared' | 'denied' | 'error'
  message: string
}

/**
 * Ryd/deaktiver integrationen: nulstil krypterede nøgler + active=false, så
 * isEconomicReady() bliver false og bulk-eksport låses igen. Behold config-
 * numre. Audit economic_settings_cleared (ingen secret).
 */
export async function clearEconomicIntegrationAction(): Promise<ClearEconomicResult> {
  const { userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ok: false, status: 'denied', message: 'Manglende tilladelse: settings.economic' }
  }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('accounting_integration_settings')
    .select('id, config')
    .eq('provider', PROVIDER)
    .maybeSingle()
  if (!existing) {
    return { ok: true, status: 'cleared', message: 'Integrationen er allerede ryddet.' }
  }

  const cfg = (existing.config ?? {}) as Record<string, unknown>
  delete cfg.connectionTest

  const { error } = await admin
    .from('accounting_integration_settings')
    .update({ api_token: null, agreement_grant_token: null, active: false, config: cfg, updated_at: new Date().toISOString() })
    .eq('provider', PROVIDER)
  if (error) {
    logger.error('clearEconomicIntegrationAction: update failed', { error })
    return { ok: false, status: 'error', message: 'Kunne ikke rydde integrationen.' }
  }

  try {
    await admin.from('audit_logs').insert({
      user_id: userId,
      entity_type: 'integration',
      entity_id: null,
      entity_name: 'e-conomic',
      action: 'economic_settings_cleared',
      action_description: 'e-conomic-integration ryddet/deaktiveret',
      changes: { active: false },
      metadata: { provider: PROVIDER },
    })
  } catch (e) {
    logger.error('clearEconomicIntegrationAction: audit failed', { error: e })
  }

  return { ok: true, status: 'cleared', message: 'Integrationen er ryddet og deaktiveret.' }
}

// =====================================================
// Ø6.3 — synklog + fejlhåndtering
// =====================================================
// friendlyEconomicError + summary-beregning ligger nu i den delte modul
// @/lib/services/accounting-health (genbruges af cron i Ø6.5).

export interface SyncLogEntry {
  id: string
  created_at: string
  entity_type: AccountingEntityType
  entity_id: string
  action: AccountingAction
  status: AccountingStatus
  external_id: string | null
  /** Menneskelig dansk fejlbesked (kun for fejl). Aldrig rå token/header. */
  error: string | null
  invoice_id: string | null
  invoice_number: string | null
  customer_name: string | null
  case_number: string | null
  /** Best-effort: hvem der startede eksporten (fra audit_logs). */
  started_by: string | null
  /** "Prøv igen" må vises (integration opsat + faktura relevant + ikke eksporteret). */
  retry_eligible: boolean
}

export interface SyncLogResult {
  ok: boolean
  message?: string
  integration_ready: boolean
  entries: SyncLogEntry[]
  counts: { all: number; success: number; failed: number; skipped: number }
}

export type SyncLogStatusFilter = 'all' | 'success' | 'failed' | 'skipped'

const SYNC_LOG_LIMIT = 200

/**
 * Gated (settings.economic) oversigt over eksportforsøg fra accounting_sync_log.
 * Cost-free: kun status/ekstern reference + kundevendte faktura-/kundenavne.
 * Genbruger ikke nogen ny motor — læser kun eksisterende log.
 */
export async function listAccountingSyncLogAction(params?: {
  status?: SyncLogStatusFilter
  days?: 7 | 30 | null
}): Promise<SyncLogResult> {
  const empty: SyncLogResult = {
    ok: false, integration_ready: false, entries: [],
    counts: { all: 0, success: 0, failed: 0, skipped: 0 },
  }
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ...empty, message: 'Manglende tilladelse: settings.economic' }
  }

  let integrationReady = false
  try {
    const { getEconomicSettings, isEconomicReady } = await import('@/lib/services/economic-client')
    integrationReady = isEconomicReady(await getEconomicSettings())
  } catch (e) {
    logger.error('listAccountingSyncLogAction: settings read failed', { error: e })
  }

  // Status-tællere (uafhængigt af valgt filter) — ét lille aggregat.
  const counts = { all: 0, success: 0, failed: 0, skipped: 0 }
  try {
    const { data: allRows } = await supabase
      .from('accounting_sync_log')
      .select('status')
      .in('entity_type', ['invoice', 'customer'])
      .order('created_at', { ascending: false })
      .limit(1000)
    for (const row of allRows ?? []) {
      counts.all++
      const s = row.status as AccountingStatus
      if (s === 'success') counts.success++
      else if (s === 'failed') counts.failed++
      else if (s === 'skipped') counts.skipped++
    }
  } catch {
    /* tællere er best-effort */
  }

  let query = supabase
    .from('accounting_sync_log')
    .select('id, created_at, entity_type, entity_id, action, status, external_id, error_message')
    .in('entity_type', ['invoice', 'customer'])
    .order('created_at', { ascending: false })
    .limit(SYNC_LOG_LIMIT)

  const status = params?.status ?? 'all'
  if (status !== 'all') query = query.eq('status', status)
  if (params?.days) {
    const since = new Date(Date.now() - params.days * 86400_000).toISOString()
    query = query.gte('created_at', since)
  }

  const { data: logs, error } = await query
  if (error) {
    logger.error('listAccountingSyncLogAction: query failed', { error })
    return { ...empty, ok: true, integration_ready: integrationReady, counts }
  }

  const rows = logs ?? []
  const invoiceIds = Array.from(
    new Set(rows.filter((r) => r.entity_type === 'invoice').map((r) => r.entity_id as string))
  )

  // Cost-free batch-hent af fakturaer (ingen kost-kolonner).
  const invMap = new Map<string, {
    invoice_number: string | null; customer_id: string | null; case_id: string | null
    status: string | null; voided_at: string | null; invoice_type: string | null
    external_invoice_id: string | null; external_provider: string | null
  }>()
  if (invoiceIds.length) {
    const { data: invs } = await supabase
      .from('invoices')
      .select('id, invoice_number, customer_id, case_id, status, voided_at, invoice_type, external_invoice_id, external_provider')
      .in('id', invoiceIds)
    for (const i of invs ?? []) {
      invMap.set(i.id as string, {
        invoice_number: (i.invoice_number as string | null) ?? null,
        customer_id: (i.customer_id as string | null) ?? null,
        case_id: (i.case_id as string | null) ?? null,
        status: (i.status as string | null) ?? null,
        voided_at: (i.voided_at as string | null) ?? null,
        invoice_type: (i.invoice_type as string | null) ?? null,
        external_invoice_id: (i.external_invoice_id as string | null) ?? null,
        external_provider: (i.external_provider as string | null) ?? null,
      })
    }
  }

  const customerIds = Array.from(new Set(
    [...invMap.values()].map((i) => i.customer_id).filter(Boolean) as string[]
  ))
  const custMap = new Map<string, string>()
  if (customerIds.length) {
    const { data: custs } = await supabase
      .from('customers')
      .select('id, company_name, contact_person')
      .in('id', customerIds)
    for (const c of custs ?? []) {
      custMap.set(c.id as string, (c.company_name as string | null) ?? (c.contact_person as string | null) ?? '—')
    }
  }

  const caseIds = Array.from(new Set(
    [...invMap.values()].map((i) => i.case_id).filter(Boolean) as string[]
  ))
  const caseMap = new Map<string, string>()
  if (caseIds.length) {
    const { data: cases } = await supabase
      .from('service_cases')
      .select('id, case_number')
      .in('id', caseIds)
    for (const c of cases ?? []) caseMap.set(c.id as string, (c.case_number as string | null) ?? '')
  }

  // Best-effort "hvem": seneste eksport-bruger pr. faktura fra audit_logs.
  const exporterByInvoice = new Map<string, string>()
  try {
    const { data: audits } = await supabase
      .from('audit_logs')
      .select('user_id, entity_id, action, metadata, created_at')
      .in('action', ['invoice_accounting_exported', 'invoice_accounting_export_failed', 'invoices_accounting_bulk_exported', 'invoice_accounting_export_retried'])
      .order('created_at', { ascending: false })
      .limit(500)
    const userIds = new Set<string>()
    const pending: { invoiceId: string; userId: string }[] = []
    for (const a of audits ?? []) {
      const uid = a.user_id as string | null
      if (!uid) continue
      if (a.entity_id) {
        pending.push({ invoiceId: a.entity_id as string, userId: uid })
        userIds.add(uid)
      }
      const ids = (a.metadata as { invoice_ids?: string[] } | null)?.invoice_ids
      if (Array.isArray(ids)) {
        for (const id of ids) { pending.push({ invoiceId: id, userId: uid }); userIds.add(uid) }
      }
    }
    const nameMap = new Map<string, string>()
    if (userIds.size) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(userIds))
      for (const p of profs ?? []) {
        nameMap.set(p.id as string, (p.full_name as string | null) || (p.email as string | null) || 'Ukendt')
      }
    }
    // audits er nyeste-først → første sete pr. faktura vinder (seneste eksportør).
    for (const { invoiceId, userId } of pending) {
      if (!exporterByInvoice.has(invoiceId)) exporterByInvoice.set(invoiceId, nameMap.get(userId) ?? 'Ukendt')
    }
  } catch {
    /* "hvem" er best-effort */
  }

  const entries: SyncLogEntry[] = rows.map((r) => {
    const entityType = r.entity_type as AccountingEntityType
    const isInvoice = entityType === 'invoice'
    const inv = isInvoice ? invMap.get(r.entity_id as string) : undefined
    const exported = !!inv?.external_invoice_id && inv?.external_provider === PROVIDER
    const retryEligible =
      integrationReady &&
      isInvoice &&
      (r.status as AccountingStatus) === 'failed' &&
      !!inv &&
      !exported &&
      !inv.voided_at &&
      inv.invoice_type !== 'credit' &&
      (inv.status === 'sent' || inv.status === 'paid')

    return {
      id: r.id as string,
      created_at: r.created_at as string,
      entity_type: entityType,
      entity_id: r.entity_id as string,
      action: r.action as AccountingAction,
      status: r.status as AccountingStatus,
      external_id: (r.external_id as string | null) ?? null,
      error: (r.status as AccountingStatus) === 'failed'
        ? friendlyEconomicError(r.error_message as string | null)
        : null,
      invoice_id: isInvoice ? (r.entity_id as string) : null,
      invoice_number: inv?.invoice_number ?? null,
      customer_name: inv?.customer_id ? (custMap.get(inv.customer_id) ?? null) : null,
      case_number: inv?.case_id ? (caseMap.get(inv.case_id) || null) : null,
      started_by: isInvoice ? (exporterByInvoice.get(r.entity_id as string) ?? null) : null,
      retry_eligible: retryEligible,
    }
  })

  return { ok: true, integration_ready: integrationReady, entries, counts }
}

export interface RetryExportResult {
  ok: boolean
  status: 'exported' | 'not_configured' | 'already_exported' | 'not_eligible' | 'failed' | 'denied'
  message: string
  external_id?: string | null
}

/**
 * "Prøv igen" for en fejlet faktura. Defensiv (samme regler som bulk) +
 * genbruger den eksisterende eksport-action/klient (INGEN ny motor).
 * Auditerer retry: hvem, invoice_id, tidligere fejl-log-id, resultat.
 */
export async function retryInvoiceExportAction(
  invoiceId: string,
  previousLogId?: string
): Promise<RetryExportResult> {
  try {
    validateUUID(invoiceId, 'id')
  } catch (err) {
    return { ok: false, status: 'failed', message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ok: false, status: 'denied', message: 'Manglende tilladelse: settings.economic' }
  }

  const { getEconomicSettings, isEconomicReady } = await import('@/lib/services/economic-client')
  if (!isEconomicReady(await getEconomicSettings())) {
    return { ok: false, status: 'not_configured', message: 'e-conomic er ikke opsat endnu.' }
  }

  // Defensiv kontrol (cost-free select).
  const { data: inv } = await supabase
    .from('invoices')
    .select('invoice_number, status, voided_at, invoice_type, external_invoice_id, external_provider')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!inv) return { ok: false, status: 'not_eligible', message: 'Fakturaen blev ikke fundet.' }
  if (inv.external_invoice_id && inv.external_provider === PROVIDER) {
    return { ok: true, status: 'already_exported', message: 'Fakturaen er allerede eksporteret.', external_id: inv.external_invoice_id as string }
  }
  if (inv.voided_at) return { ok: false, status: 'not_eligible', message: 'Fakturaen er annulleret.' }
  if (inv.invoice_type === 'credit') return { ok: false, status: 'not_eligible', message: 'Kreditnotaer eksporteres ikke automatisk.' }
  if (inv.status !== 'sent' && inv.status !== 'paid') {
    return { ok: false, status: 'not_eligible', message: 'Fakturaen er ikke klar (kun sendte/betalte).' }
  }

  const { createInvoiceInEconomic } = await import('@/lib/services/economic-client')
  const result = await createInvoiceInEconomic(invoiceId)

  const audit = async (ok: boolean, description: string, extra: Record<string, unknown>) => {
    try {
      await insertAuditRow({
        user_id: userId,
        entity_type: 'invoice',
        entity_id: invoiceId,
        entity_name: (inv.invoice_number as string | null) ?? null,
        action: 'invoice_accounting_export_retried',
        action_description: description,
        changes: { ok },
        metadata: { provider: PROVIDER, previous_log_id: previousLogId ?? null, ...extra },
      })
    } catch (e) {
      logger.error('retryInvoiceExportAction: audit failed', { error: e })
    }
  }

  if (result.ok && result.status === 'success') {
    await audit(true, `Genforsøg: faktura eksporteret til e-conomic (${result.externalId})`, { external_id: result.externalId ?? null })
    return { ok: true, status: 'exported', message: 'Faktura eksporteret til e-conomic.', external_id: result.externalId ?? null }
  }
  if (result.status === 'skipped') {
    return { ok: true, status: 'already_exported', message: 'Fakturaen er allerede eksporteret.', external_id: result.externalId ?? null }
  }
  await audit(false, `Genforsøg fejlede: ${friendlyEconomicError(result.error)}`, { error: friendlyEconomicError(result.error) })
  return { ok: false, status: 'failed', message: `Eksport fejlede: ${friendlyEconomicError(result.error)}` }
}

// =====================================================
// Ø6.4 — regnskabs-dashboardwidget (sammenfatning)
// =====================================================

/**
 * Cost-free sammenfatning til regnskabs-widgeten på dashboardet. Gater
 * settings.economic og delegerer til den delte computeAccountingHealthSummary
 * (genbruges af cron i Ø6.5). Ingen kost/margin/DB; fejl saniteres.
 */
export async function getAccountingHealthSummaryAction(): Promise<AccountingHealthSummary> {
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return {
      ok: false, message: 'Manglende tilladelse: settings.economic', integration_ready: false,
      failed_count: 0, not_exported_count: 0, exported_7d: 0, exported_30d: 0, latest_error: null,
    }
  }
  return computeAccountingHealthSummary(supabase)
}

// =====================================================
// N12 — kobling af kunde til eksisterende e-conomic-debitor
// =====================================================
//
// Eksporten opretter en NY debitor i e-conomic når kunden ikke er koblet →
// dubletter af kunder Elta allerede har i e-conomic. Her kobles kunden til
// det eksisterende debitornr. før første eksport. Kun regnskabsroller
// (settings.economic); ét debitornr. kan kun kobles til én kunde.

export interface CustomerEconomicLink {
  ok: boolean
  message?: string
  can_edit: boolean
  customer_number: string | null
}

export async function getCustomerEconomicLinkAction(customerId: string): Promise<CustomerEconomicLink> {
  try {
    validateUUID(customerId, 'kunde ID')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt id', can_edit: false, customer_number: null }
  }
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ok: false, message: 'Manglende tilladelse: settings.economic', can_edit: false, customer_number: null }
  }
  const { data } = await supabase
    .from('customers')
    .select('external_customer_id, external_provider')
    .eq('id', customerId)
    .maybeSingle()
  if (!data) return { ok: false, message: 'Kunde ikke fundet', can_edit: false, customer_number: null }
  return {
    ok: true,
    can_edit: true,
    customer_number: data.external_provider === PROVIDER ? ((data.external_customer_id as string | null) ?? null) : null,
  }
}

export async function setCustomerEconomicNumberAction(
  customerId: string,
  rawNumber: string
): Promise<{ ok: boolean; message: string; customer_number?: string | null }> {
  try {
    validateUUID(customerId, 'kunde ID')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ok: false, message: 'Manglende tilladelse: settings.economic' }
  }
  const v = (rawNumber ?? '').trim()
  if (v && !/^[1-9]\d{0,8}$/.test(v)) {
    return { ok: false, message: 'Ugyldigt e-conomic-kundenr. — kun tal (fx 1042)' }
  }

  const { data: cust } = await supabase
    .from('customers')
    .select('id, company_name, external_customer_id, external_provider')
    .eq('id', customerId)
    .maybeSingle()
  if (!cust) return { ok: false, message: 'Kunde ikke fundet' }
  const before = cust.external_provider === PROVIDER ? (cust.external_customer_id as string | null) : null

  if (v) {
    const { data: other } = await supabase
      .from('customers')
      .select('id, company_name')
      .eq('external_provider', PROVIDER)
      .eq('external_customer_id', v)
      .neq('id', customerId)
      .limit(1)
      .maybeSingle()
    if (other) {
      return { ok: false, message: `e-conomic-kundenr. ${v} er allerede koblet til ${other.company_name ?? 'en anden kunde'}` }
    }
  }

  const patch = v
    ? { external_customer_id: v, external_provider: PROVIDER }
    : { external_customer_id: null, external_provider: null }
  // bogholderi har ikke UPDATE på customers i RLS (WAVE1) → service-role efter
  // app-gaten ovenfor (settings.economic); kun de to e-conomic-felter skrives.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data: updated, error } = await createAdminClient()
    .from('customers')
    .update(patch)
    .eq('id', customerId)
    .select('id')
  if (error || !updated || updated.length !== 1) {
    logger.error('setCustomerEconomicNumberAction failed', { error, entityId: customerId })
    return { ok: false, message: 'Kunne ikke gemme e-conomic-kundenr.' }
  }

  await insertAuditRow({
    user_id: userId,
    entity_type: 'customer',
    entity_id: customerId,
    entity_name: (cust.company_name as string | null) ?? null,
    action: 'economic_customer_linked',
    action_description: v ? `Koblet til e-conomic-kundenr. ${v}` : 'e-conomic-kobling fjernet',
    changes: { external_customer_id: { from: before, to: v || null } },
    metadata: { provider: PROVIDER },
  })
  return { ok: true, message: v ? `Koblet til e-conomic-kundenr. ${v}` : 'Kobling fjernet', customer_number: v || null }
}
