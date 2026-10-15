/**
 * Sprint Ø6.5 — delt regnskabs-health-logik (cost-free).
 *
 * Udtrukket fra Ø6.3/Ø6.4 så BÅDE server-action (bruger-klient) og cron
 * (admin-klient) kan genbruge præcis samme summary + fejl-sanitering uden
 * dobbelt system. Ingen 'use server' → importérbar fra cron-route og action.
 *
 * Cost-free: kun salgs-/fakturadata + ekstern reference. INGEN secrets.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

const PROVIDER = 'economic'

/**
 * Oversæt en rå e-conomic-/system-fejl til menneskeligt dansk og fjern alt
 * der kunne ligne en hemmelighed (tokens/headers).
 */
export function friendlyEconomicError(raw: string | null | undefined): string {
  if (!raw) return 'Ukendt fejl.'
  const r = raw.toLowerCase()
  if (r.includes('not_configured')) return 'Integrationen er ikke opsat.'
  if (r.includes('cashbook_or_bank')) return 'Kassekladde/bankkonto er ikke konfigureret.'
  if (r.includes('no invoice lines') || r.includes('no lines')) return 'Fakturaen har ingen linjer.'
  if (r.includes('customer not found')) return 'Kunden blev ikke fundet.'
  if (r.includes('customer sync failed')) return 'Kunden kunne ikke synkroniseres til e-conomic.'
  if (r.includes('invoice not found')) return 'Fakturaen blev ikke fundet.'
  if (r.includes('invoice has no customer')) return 'Fakturaen mangler en kunde.'
  if (r.includes('missing economic config')) return 'Manglende e-conomic-opsætning (layout, betalingsbetingelser eller momszone).'
  if (r.includes('already linked')) return 'Allerede eksporteret.'
  if (r.includes('booking failed') || r.includes('book')) return 'Kladde oprettet, men bogføring i e-conomic fejlede.'
  if (r.includes('http 401') || r.includes('http 403') || r.includes('unauthorized') || r.includes('adgang nægtet'))
    return 'Adgang nægtet — kontroller e-conomic-nøglerne.'
  if (r.includes('http 0') || r.includes('network')) return 'Kunne ikke nå e-conomic (netværksfejl).'
  if (r.startsWith('http ')) return `e-conomic svarede med en fejl (${raw.slice(0, 12)}).`
  const sanitized = raw
    .replace(/x-(appsecret|agreementgrant)token[^\s]*/gi, '')
    .replace(/token[=:]\s*\S+/gi, 'token: •••')
    .slice(0, 160)
  return sanitized.trim() || 'Ukendt fejl.'
}

export interface AccountingHealthSummary {
  ok: boolean
  message?: string
  integration_ready: boolean
  /** Sat når opslaget kaster. integration_ready er da false, men det er ikke "ikke opsat". */
  integration_error?: string | null
  /** Sat når optællingen fejler. Tallet er da 0, men det er ikke et ægte nul. */
  not_exported_error?: string | null
  exported_error?: string | null
  failed_error?: string | null
  /** Fejlede fakturaer der stadig kan handles på (ikke eksporteret endnu). */
  failed_count: number
  /** Sendte/betalte fakturaer der endnu ikke er eksporteret. */
  not_exported_count: number
  exported_7d: number
  exported_30d: number
  latest_error: {
    invoice_id: string | null
    invoice_number: string | null
    message: string
    at: string
  } | null
}

/**
 * Beregn cost-free regnskabs-summary fra eksisterende kilder
 * (accounting_sync_log + invoices + isEconomicReady). Tager en hvilken som
 * helst Supabase-klient (bruger- eller admin-) så både action og cron kan
 * genbruge den. INGEN permission-check her — kalderen gater.
 */
export async function computeAccountingHealthSummary(
  supabase: SupabaseClient
): Promise<AccountingHealthSummary> {
  let integrationReady = false
  let integrationError: string | null = null
  try {
    const { getEconomicSettings, isEconomicReady } = await import('@/lib/services/economic-client')
    integrationReady = isEconomicReady(await getEconomicSettings())
  } catch (e) {
    logger.error('computeAccountingHealthSummary: settings read failed', { error: e })
    integrationError = 'Kunne ikke tjekke e-conomic'
  }

  const now = Date.now()
  const since7 = new Date(now - 7 * 86400_000).toISOString()
  const since30 = new Date(now - 30 * 86400_000).toISOString()

  let notExported = 0
  let notExportedError: string | null = null
  try {
    const { count, error } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .in('status', ['sent', 'paid'])
      .is('voided_at', null)
      .neq('invoice_type', 'credit')
      .is('external_invoice_id', null)
    if (error) notExportedError = 'Kunne ikke tælle ventende fakturaer'
    else notExported = count ?? 0
  } catch (e) {
    logger.error('computeAccountingHealthSummary: not_exported count failed', { error: e })
    notExportedError = 'Kunne ikke tælle ventende fakturaer'
  }

  const exportedSince = async (sinceIso: string): Promise<{ n: number; failed: boolean }> => {
    try {
      const { count, error } = await supabase
        .from('accounting_sync_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'invoice')
        .eq('action', 'create')
        .eq('status', 'success')
        .gte('created_at', sinceIso)
      if (error) return { n: 0, failed: true }
      return { n: count ?? 0, failed: false }
    } catch {
      return { n: 0, failed: true }
    }
  }
  const [exported7, exported30] = await Promise.all([exportedSince(since7), exportedSince(since30)])
  const exported7d = exported7.n
  const exported30d = exported30.n
  const exportedError = exported7.failed || exported30.failed ? 'Kunne ikke tælle eksporterede fakturaer' : null

  let failedCount = 0
  let failedError: string | null = null
  let latestError: AccountingHealthSummary['latest_error'] = null
  try {
    const { data: failedLogs, error: failedQueryError } = await supabase
      .from('accounting_sync_log')
      .select('entity_id, error_message, created_at')
      .eq('entity_type', 'invoice')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(300)
    if (failedQueryError) {
      failedError = 'Kunne ikke tælle fejlede eksporter'
    }
    const failedRows = failedQueryError ? [] : (failedLogs ?? [])
    const failedInvoiceIds = Array.from(new Set(failedRows.map((r) => r.entity_id as string)))

    const stillOpen = new Set<string>()
    const numberById = new Map<string, string | null>()
    if (failedInvoiceIds.length) {
      const { data: invs, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, external_invoice_id, external_provider, voided_at')
        .in('id', failedInvoiceIds)
      if (invErr) failedError = 'Kunne ikke tælle fejlede eksporter'
      for (const i of invErr ? [] : (invs ?? [])) {
        numberById.set(i.id as string, (i.invoice_number as string | null) ?? null)
        const exported = !!i.external_invoice_id && i.external_provider === PROVIDER
        if (!exported && !i.voided_at) stillOpen.add(i.id as string)
      }
    }
    failedCount = failedError ? 0 : stillOpen.size

    const newestOpen = failedRows.find((r) => stillOpen.has(r.entity_id as string)) ?? failedRows[0]
    if (newestOpen) {
      latestError = {
        invoice_id: (newestOpen.entity_id as string) ?? null,
        invoice_number: numberById.get(newestOpen.entity_id as string) ?? null,
        message: friendlyEconomicError(newestOpen.error_message as string | null),
        at: newestOpen.created_at as string,
      }
    }
  } catch (e) {
    logger.error('computeAccountingHealthSummary: failed summary failed', { error: e })
    failedError = 'Kunne ikke tælle fejlede eksporter'
  }

  return {
    ok: true,
    integration_ready: integrationReady,
    integration_error: integrationError,
    not_exported_error: notExportedError,
    exported_error: exportedError,
    failed_error: failedError,
    failed_count: failedCount,
    not_exported_count: notExported,
    exported_7d: exported7d,
    exported_30d: exported30d,
    latest_error: latestError,
  }
}
