'use server'

/**
 * Go-Live admin panel — server actions.
 *
 * Read-only status fetch + a small set of write actions wrapping
 * existing services (no new business logic).
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Status payload
// =====================================================

export interface GoLiveStatus {
  generated_at: string
  economic: {
    configured: boolean
    active: boolean
    last_sync_at: string | null
  }
  autopilot: {
    rules: Array<{
      id: string
      name: string
      trigger: string
      action: string
      active: boolean
      dry_run: boolean
    }>
    dry_run_count: number
    live_count: number
  }
  bank: {
    total_transactions: number
    last_imported_at: string | null
    unmatched_count: number
    ambiguous_count: number
  }
  email_sync: {
    last_sync_at: string | null
    last_status: string | null
    mailbox_count: number
  }
  invoice_reminder_cron: {
    last_run_at: string | null
    last_24h_sent: number
  }
  system_errors_last_24h: number
}

export async function getGoLiveStatus(): Promise<GoLiveStatus> {
  const { supabase } = await getAuthenticatedClient()
  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // Run all probes in parallel; each falls back individually.
  const [
    econRes,
    rulesRes,
    bankCount,
    bankLast,
    bankUnmatched,
    bankAmbig,
    syncRes,
    reminderLast,
    reminderSent24h,
    sysErr,
  ] = await Promise.all([
    supabase
      .from('accounting_integration_settings')
      .select('active, api_token, agreement_grant_token, last_sync_at')
      .eq('provider', 'economic')
      .maybeSingle(),
    supabase
      .from('automation_rules')
      .select('id, name, trigger, action, active, dry_run')
      .order('trigger', { ascending: true }),
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true }),
    supabase
      .from('bank_transactions')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('match_status', 'unmatched'),
    supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('match_status', 'ambiguous'),
    supabase
      .from('graph_sync_state')
      .select('mailbox, last_sync_at, last_sync_status')
      .order('last_sync_at', { ascending: false }),
    supabase
      .from('invoice_reminder_log')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('invoice_reminder_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('created_at', since24h),
    supabase
      .from('system_health_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'error')
      .gte('created_at', since24h),
  ])

  const econ = econRes.data
  const rules = (rulesRes.data ?? []) as GoLiveStatus['autopilot']['rules']
  const syncRows = syncRes.data ?? []
  const latestSync = syncRows[0]

  return {
    generated_at: now.toISOString(),
    economic: {
      configured: !!(econ?.api_token && econ?.agreement_grant_token),
      active: !!econ?.active,
      last_sync_at: econ?.last_sync_at ?? null,
    },
    autopilot: {
      rules,
      dry_run_count: rules.filter((r) => r.dry_run).length,
      live_count: rules.filter((r) => !r.dry_run && r.active).length,
    },
    bank: {
      total_transactions: bankCount.count ?? 0,
      last_imported_at: bankLast.data?.created_at ?? null,
      unmatched_count: bankUnmatched.count ?? 0,
      ambiguous_count: bankAmbig.count ?? 0,
    },
    email_sync: {
      last_sync_at: latestSync?.last_sync_at ?? null,
      last_status: latestSync?.last_sync_status ?? null,
      mailbox_count: syncRows.length,
    },
    invoice_reminder_cron: {
      last_run_at: reminderLast.data?.created_at ?? null,
      last_24h_sent: reminderSent24h.count ?? 0,
    },
    system_errors_last_24h: sysErr.count ?? 0,
  }
}

// =====================================================
// Actions
// =====================================================

export interface ActionOutcome {
  ok: boolean
  message: string
  data?: Record<string, unknown>
}

export async function toggleRuleDryRunAction(
  ruleId: string,
  dryRun: boolean
): Promise<ActionOutcome> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const { error } = await supabase
      .from('automation_rules')
      .update({ dry_run: dryRun })
      .eq('id', ruleId)
    if (error) return { ok: false, message: error.message }
    revalidatePath('/dashboard/go-live')
    return {
      ok: true,
      message: dryRun ? 'Regel sat til dry-run' : 'Regel sat til LIVE',
      data: { ruleId, dry_run: dryRun },
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function testEconomicAction(): Promise<ActionOutcome> {
  try {
    await getAuthenticatedClient()
    const { getEconomicSettings, isEconomicReady } = await import('@/lib/services/economic-client')
    const settings = await getEconomicSettings()
    if (!settings) {
      return { ok: false, message: 'Ingen e-conomic settings-row fundet — opret én før go-live.' }
    }
    if (!isEconomicReady(settings)) {
      return {
        ok: false,
        message: `Konfiguration ufuldstændig: active=${settings.active}, api_token=${!!settings.api_token}, grant_token=${!!settings.agreement_grant_token}`,
        data: { active: settings.active, hasApiToken: !!settings.api_token, hasGrantToken: !!settings.agreement_grant_token },
      }
    }
    // Light readiness ping — verify mandatory config fields without
    // hitting e-conomic's network endpoints (those are exercised by
    // the real createCustomerInEconomic call).
    const cfg = settings.config || {}
    const required = ['layoutNumber', 'paymentTermsNumber', 'vatZoneNumber', 'defaultProductNumber'] as const
    const missing = required.filter((k) => !cfg[k as keyof typeof cfg])
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Konfiguration mangler felter: ${missing.join(', ')}`,
        data: { missing },
      }
    }
    return {
      ok: true,
      message: 'e-conomic settings OK — credentials + config-felter til stede.',
      data: {
        active: settings.active,
        last_sync_at: settings.last_sync_at,
        config: cfg,
      },
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function testBankImportAction(): Promise<ActionOutcome> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { count } = await supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .gte('date', since7d)
    const { count: unmatched } = await supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('match_status', 'unmatched')
    if ((count ?? 0) === 0) {
      return {
        ok: false,
        message: 'Ingen bankposteringer importeret de sidste 7 dage.',
        data: { count: 0, unmatched: unmatched ?? 0 },
      }
    }
    return {
      ok: true,
      message: `${count} bankposteringer sidste 7 dage, ${unmatched ?? 0} umatchede.`,
      data: { count, unmatched: unmatched ?? 0 },
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function runEmailSyncNowAction(): Promise<ActionOutcome> {
  try {
    await getAuthenticatedClient()
    const { runEmailSync } = await import('@/lib/services/email-sync-orchestrator')
    const result = await runEmailSync()
    revalidatePath('/dashboard/go-live')
    const inserted = result.emailsInserted ?? 0
    const fetched = result.emailsFetched ?? 0
    return {
      ok: result.success,
      message: result.success
        ? `Email sync OK: hentede ${fetched}, indsatte ${inserted} (${result.mailboxResults?.length ?? 0} mailboxes, ${result.durationMs ?? 0}ms)`
        : `Email sync fejlede: ${(result.errors ?? []).join('; ') || 'unknown error'}`,
      data: result as unknown as Record<string, unknown>,
    }
  } catch (err) {
    logger.error('runEmailSyncNowAction failed', { error: err })
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function runInvoiceRemindersNowAction(): Promise<ActionOutcome> {
  try {
    await getAuthenticatedClient()
    const { getOverdueInvoices, sendInvoiceReminder } = await import('@/lib/services/invoices')
    const overdue = await getOverdueInvoices()
    const summary = { checked: overdue.length, sent: 0, manual_review: 0, skipped: 0, failed: 0 }
    for (const inv of overdue) {
      try {
        const r = await sendInvoiceReminder(inv.id)
        if (r.status === 'sent') summary.sent++
        else if (r.status === 'manual_review') summary.manual_review++
        else if (r.status === 'skipped') summary.skipped++
        else summary.failed++
      } catch {
        summary.failed++
      }
    }
    revalidatePath('/dashboard/go-live')
    return {
      ok: true,
      message: `Rykker-tjek: scannet ${summary.checked}, sendt ${summary.sent}, manual ${summary.manual_review}, skip ${summary.skipped}, fejl ${summary.failed}`,
      data: summary as unknown as Record<string, unknown>,
    }
  } catch (err) {
    logger.error('runInvoiceRemindersNowAction failed', { error: err })
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}
