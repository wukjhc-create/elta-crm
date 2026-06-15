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

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'

export type InvoiceAccountingStatus = 'not_exported' | 'ready' | 'exported' | 'error'

export interface InvoiceAccountingState {
  ok: boolean
  message?: string
  status: InvoiceAccountingStatus
  external_id: string | null
  exported_at: string | null
  error: string | null
  provider: string
  integration_ready: boolean
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

  return {
    ok: true,
    status,
    external_id: (inv.external_invoice_id as string | null) ?? null,
    exported_at: exported ? ((log?.created_at as string | null) ?? null) : null,
    error: status === 'error' ? ((log?.error_message as string | null) ?? null) : null,
    provider: PROVIDER,
    integration_ready: integrationReady,
  }
}

export interface ExportInvoiceResult {
  ok: boolean
  status: 'exported' | 'not_configured' | 'already_exported' | 'failed'
  message: string
  external_id?: string | null
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
      await supabase.from('audit_logs').insert({
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
    await supabase.from('audit_logs').insert({
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
  }
}

/** Maskér en hemmelighed til visning: "••••" + sidste 4 tegn. Aldrig rå. */
function maskToken(token: string | null | undefined): string | null {
  if (!token) return null
  const last4 = token.length >= 4 ? token.slice(-4) : token
  return '••••' + last4
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
    config_summary: { layoutNumber: null, paymentTermsNumber: null, vatZoneNumber: null, autoBookOnCreate: false },
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
      config_summary: {
        layoutNumber: cfg.layoutNumber ?? null,
        paymentTermsNumber: cfg.paymentTermsNumber ?? null,
        vatZoneNumber: cfg.vatZoneNumber ?? null,
        autoBookOnCreate: !!cfg.autoBookOnCreate,
      },
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
    for (const k of ['layoutNumber', 'paymentTermsNumber', 'vatZoneNumber'] as const) {
      const v = input.config[k]
      if (v === null) delete mergedConfig[k]
      else if (typeof v === 'number' && Number.isFinite(v)) mergedConfig[k] = v
    }
    if (typeof input.config.autoBookOnCreate === 'boolean') mergedConfig.autoBookOnCreate = input.config.autoBookOnCreate
  }

  const active = input.active ?? existing?.active ?? true

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
