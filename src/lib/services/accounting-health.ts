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
  // EC-12: kun egentlige bogføringsfejl (før matchede 'book' også fx 'cash-books')
  if (r.includes('booking failed')) return 'Kladde oprettet, men bogføring i e-conomic fejlede.'
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
  /** Fejlede fakturaer der stadig kan handles på (ikke eksporteret endnu). */
  failed_count: number
  /** Sendte/betalte fakturaer der endnu ikke er eksporteret. */
  not_exported_count: number
  exported_7d: number
  exported_30d: number
  /**
   * EC-4 (e-conomic-review 2026-10-17): sendte kreditnotaer hvis original ER eksporteret — kreditnotaer sendes ikke til
   * e-conomic, så de skal krediteres manuelt dér (ellers bliver omsætning/udgående moms stående)
   */
  credit_manual_count?: number
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
  try {
    const { getEconomicSettings, isEconomicReady } = await import('@/lib/services/economic-client')
    integrationReady = isEconomicReady(await getEconomicSettings())
  } catch (e) {
    logger.error('computeAccountingHealthSummary: settings read failed', { error: e })
  }

  const now = Date.now()
  const since7 = new Date(now - 7 * 86400_000).toISOString()
  const since30 = new Date(now - 30 * 86400_000).toISOString()

  let notExported = 0
  try {
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .in('status', ['sent', 'paid'])
      .is('voided_at', null)
      .neq('invoice_type', 'credit')
      // DB-10 (dashboard-review 2026-10-18): en kladde i e-conomic ("draft-N") er IKKE eksporteret (A-5) — tæller med
      .or('external_invoice_id.is.null,external_invoice_id.like.draft-%')
    notExported = count ?? 0
  } catch (e) {
    logger.error('computeAccountingHealthSummary: not_exported count failed', { error: e })
  }

  const exportedSince = async (sinceIso: string): Promise<number> => {
    try {
      const { count } = await supabase
        .from('accounting_sync_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'invoice')
        .eq('action', 'create')
        .eq('status', 'success')
        .gte('created_at', sinceIso)
      return count ?? 0
    } catch {
      return 0
    }
  }
  const [exported7d, exported30d] = await Promise.all([exportedSince(since7), exportedSince(since30)])

  let failedCount = 0
  let latestError: AccountingHealthSummary['latest_error'] = null
  try {
    const { data: failedLogs } = await supabase
      .from('accounting_sync_log')
      .select('entity_id, error_message, created_at')
      .eq('entity_type', 'invoice')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(300)
    const failedRows = failedLogs ?? []
    const failedInvoiceIds = Array.from(new Set(failedRows.map((r) => r.entity_id as string)))

    const stillOpen = new Set<string>()
    const numberById = new Map<string, string | null>()
    if (failedInvoiceIds.length) {
      const { data: invs } = await supabase
        .from('invoices')
        .select('id, invoice_number, external_invoice_id, external_provider, voided_at')
        .in('id', failedInvoiceIds)
      for (const i of invs ?? []) {
        numberById.set(i.id as string, (i.invoice_number as string | null) ?? null)
        // DB-10: "draft-N" = ikke bogført (A-5) → stadig åben fejl
        const exported = !!i.external_invoice_id && !String(i.external_invoice_id).startsWith('draft-') && i.external_provider === PROVIDER
        if (!exported && !i.voided_at) stillOpen.add(i.id as string)
      }
    }
    failedCount = stillOpen.size

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
  }

  // EC-4: kreditnotaer på eksporterede originaler (skal krediteres manuelt i e-conomic)
  let creditManual = 0
  try {
    const { fetchAllRows } = await import('@/lib/supabase/fetch-all')
    const credits = await fetchAllRows<{ id: string; credit_of_invoice_id: string | null }>((f, t) => supabase.from('invoices')
      .select('id, credit_of_invoice_id').eq('invoice_type', 'credit').in('status', ['sent', 'paid']).is('voided_at', null)
      .not('credit_of_invoice_id', 'is', null).order('id').range(f, t))
    const originals = Array.from(new Set(credits.map((c) => c.credit_of_invoice_id).filter((x): x is string => !!x)))
    const exported = new Set<string>()
    for (let i = 0; i < originals.length; i += 200) {
      const { data } = await supabase.from('invoices').select('id').in('id', originals.slice(i, i + 200)).not('external_invoice_id', 'is', null)
      for (const r of (data ?? []) as Array<{ id: string }>) exported.add(r.id)
    }
    creditManual = credits.filter((c) => c.credit_of_invoice_id && exported.has(c.credit_of_invoice_id)).length
  } catch (e) {
    logger.error('computeAccountingHealthSummary: credit-note count failed', { error: e })
  }

  return {
    ok: true,
    integration_ready: integrationReady,
    failed_count: failedCount,
    not_exported_count: notExported,
    exported_7d: exported7d,
    exported_30d: exported30d,
    credit_manual_count: creditManual,
    latest_error: latestError,
  }
}
