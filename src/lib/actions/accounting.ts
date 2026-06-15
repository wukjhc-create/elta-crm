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

export interface EconomicIntegrationStatus {
  ok: boolean
  message?: string
  configured: boolean
  active: boolean
  provider: string
  last_sync_at: string | null
  /** Ikke-hemmelige konfig-numre (layout/betalingsbetingelser/momszone). */
  config_summary: {
    layoutNumber: number | null
    paymentTermsNumber: number | null
    vatZoneNumber: number | null
    autoBookOnCreate: boolean
  }
}

export async function getEconomicIntegrationStatusAction(): Promise<EconomicIntegrationStatus> {
  const fallback: EconomicIntegrationStatus = {
    ok: false,
    configured: false,
    active: false,
    provider: PROVIDER,
    last_sync_at: null,
    config_summary: { layoutNumber: null, paymentTermsNumber: null, vatZoneNumber: null, autoBookOnCreate: false },
  }
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.economic')) {
    return { ...fallback, message: 'Manglende tilladelse: settings.economic' }
  }
  try {
    const { getEconomicSettings, isEconomicReady } = await import('@/lib/services/economic-client')
    const s = await getEconomicSettings()
    const cfg = s?.config ?? {}
    return {
      ok: true,
      configured: isEconomicReady(s),
      active: !!s?.active,
      provider: PROVIDER,
      last_sync_at: s?.last_sync_at ?? null,
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
