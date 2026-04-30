'use server'

/**
 * Go-Live admin panel — server actions.
 *
 * RBAC: read (`getGoLiveStatus`) is allowed for any authenticated user;
 * every write action requires role='admin'. Non-admin write attempts
 * return ok=false with a clear message and never touch state.
 *
 * Every write action emits a go_live_audit_log row. Critical failures
 * also trigger an admin email alert via sendAdminAlert (with cooldown).
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Status payload
// =====================================================

export interface GoLiveStatus {
  generated_at: string
  current_user: { id: string; role: string | null; is_admin: boolean }
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
  const { supabase, userId } = await getAuthenticatedClient()
  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  const role = (prof?.role as string | null) ?? null
  const isAdmin = role === 'admin'

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
    current_user: { id: userId, role, is_admin: isAdmin },
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
// RBAC + audit helpers
// =====================================================

export interface ActionOutcome {
  ok: boolean
  message: string
  data?: Record<string, unknown>
}

interface AdminCtx {
  supabase: Awaited<ReturnType<typeof getAuthenticatedClient>>['supabase']
  userId: string
}

async function requireAdmin(): Promise<AdminCtx | { ok: false; message: string }> {
  const { supabase, userId } = await getAuthenticatedClient()
  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if ((prof?.role as string | null) !== 'admin') {
    return { ok: false, message: 'Kun administratorer kan udføre denne handling.' }
  }
  return { supabase, userId }
}

async function logAudit(input: {
  userId: string
  action: string
  entityId?: string | null
  previousValue?: unknown
  newValue?: unknown
  ok: boolean
  message?: string
}): Promise<void> {
  try {
    const { supabase } = await getAuthenticatedClient()
    await supabase.from('go_live_audit_log').insert({
      user_id: input.userId,
      action: input.action,
      entity_id: input.entityId ?? null,
      previous_value: input.previousValue ?? null,
      new_value: input.newValue ?? null,
      ok: input.ok,
      message: input.message ?? null,
    })
  } catch (err) {
    logger.warn('go_live_audit_log insert failed', { error: err })
  }
}

async function alertOnFailure(label: string, message: string): Promise<void> {
  try {
    const { sendAdminAlert } = await import('@/lib/services/admin-alerts')
    await sendAdminAlert({
      key: `go_live:${label}`,
      severity: 'error',
      subject: `[Elta CRM] ${label} fejlede`,
      body: message,
      cooldownMinutes: 30,
    })
  } catch { /* never crash */ }
}

// =====================================================
// Actions (admin-only)
// =====================================================

export async function toggleRuleDryRunAction(
  ruleId: string,
  dryRun: boolean
): Promise<ActionOutcome> {
  const ctx = await requireAdmin()
  if ('ok' in ctx) return ctx

  try {
    const { data: prev } = await ctx.supabase
      .from('automation_rules')
      .select('id, name, dry_run')
      .eq('id', ruleId)
      .maybeSingle()
    if (!prev) {
      await logAudit({ userId: ctx.userId, action: 'toggle_rule', entityId: ruleId, ok: false, message: 'rule not found' })
      return { ok: false, message: 'Regel ikke fundet.' }
    }

    const { error } = await ctx.supabase
      .from('automation_rules')
      .update({ dry_run: dryRun })
      .eq('id', ruleId)
    if (error) {
      await logAudit({ userId: ctx.userId, action: 'toggle_rule', entityId: ruleId, ok: false, message: error.message })
      return { ok: false, message: error.message }
    }

    await logAudit({
      userId: ctx.userId,
      action: 'toggle_rule',
      entityId: ruleId,
      previousValue: { name: prev.name, dry_run: prev.dry_run },
      newValue:      { name: prev.name, dry_run: dryRun },
      ok: true,
      message: dryRun ? `Rule '${prev.name}' set to dry_run` : `Rule '${prev.name}' set to LIVE`,
    })
    revalidatePath('/dashboard/go-live')
    return {
      ok: true,
      message: dryRun ? 'Regel sat til dry-run' : 'Regel sat til LIVE',
      data: { ruleId, dry_run: dryRun, previous: prev.dry_run },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logAudit({ userId: ctx.userId, action: 'toggle_rule', entityId: ruleId, ok: false, message: msg })
    return { ok: false, message: msg }
  }
}

export async function testEconomicAction(): Promise<ActionOutcome> {
  const ctx = await requireAdmin()
  if ('ok' in ctx) return ctx

  try {
    const { getEconomicSettings, isEconomicReady } = await import('@/lib/services/economic-client')
    const settings = await getEconomicSettings()
    if (!settings) {
      const msg = 'Ingen e-conomic settings-row fundet — opret én før go-live.'
      await logAudit({ userId: ctx.userId, action: 'test_economic', ok: false, message: msg })
      await alertOnFailure('e-conomic test', msg)
      return { ok: false, message: msg }
    }
    if (!isEconomicReady(settings)) {
      const msg = `Konfiguration ufuldstændig: active=${settings.active}, api_token=${!!settings.api_token}, grant_token=${!!settings.agreement_grant_token}`
      await logAudit({ userId: ctx.userId, action: 'test_economic', ok: false, message: msg })
      await alertOnFailure('e-conomic test', msg)
      return { ok: false, message: msg }
    }
    const cfg = settings.config || {}
    const required = ['layoutNumber', 'paymentTermsNumber', 'vatZoneNumber', 'defaultProductNumber'] as const
    const missing = required.filter((k) => !cfg[k as keyof typeof cfg])
    if (missing.length > 0) {
      const msg = `Konfiguration mangler felter: ${missing.join(', ')}`
      await logAudit({ userId: ctx.userId, action: 'test_economic', ok: false, message: msg })
      await alertOnFailure('e-conomic test', msg)
      return { ok: false, message: msg, data: { missing } }
    }
    await logAudit({ userId: ctx.userId, action: 'test_economic', ok: true, message: 'e-conomic OK' })
    return {
      ok: true,
      message: 'e-conomic settings OK — credentials + config-felter til stede.',
      data: { active: settings.active, last_sync_at: settings.last_sync_at, config: cfg },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logAudit({ userId: ctx.userId, action: 'test_economic', ok: false, message: msg })
    await alertOnFailure('e-conomic test', msg)
    return { ok: false, message: msg }
  }
}

export async function testBankImportAction(): Promise<ActionOutcome> {
  const ctx = await requireAdmin()
  if ('ok' in ctx) return ctx

  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { count } = await ctx.supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .gte('date', since7d)
    const { count: unmatched } = await ctx.supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('match_status', 'unmatched')
    if ((count ?? 0) === 0) {
      const msg = 'Ingen bankposteringer importeret de sidste 7 dage.'
      await logAudit({ userId: ctx.userId, action: 'test_bank_import', ok: false, message: msg })
      await alertOnFailure('bank import', msg)
      return { ok: false, message: msg, data: { count: 0, unmatched: unmatched ?? 0 } }
    }
    await logAudit({ userId: ctx.userId, action: 'test_bank_import', ok: true, message: `${count} rows last 7 days` })
    return {
      ok: true,
      message: `${count} bankposteringer sidste 7 dage, ${unmatched ?? 0} umatchede.`,
      data: { count, unmatched: unmatched ?? 0 },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logAudit({ userId: ctx.userId, action: 'test_bank_import', ok: false, message: msg })
    return { ok: false, message: msg }
  }
}

export async function runEmailSyncNowAction(): Promise<ActionOutcome> {
  const ctx = await requireAdmin()
  if ('ok' in ctx) return ctx

  try {
    const { runEmailSync } = await import('@/lib/services/email-sync-orchestrator')
    const result = await runEmailSync()
    revalidatePath('/dashboard/go-live')
    const inserted = result.emailsInserted ?? 0
    const fetched = result.emailsFetched ?? 0
    const message = result.success
      ? `Email sync OK: hentede ${fetched}, indsatte ${inserted} (${result.mailboxResults?.length ?? 0} mailboxes, ${result.durationMs ?? 0}ms)`
      : `Email sync fejlede: ${(result.errors ?? []).join('; ') || 'unknown error'}`
    await logAudit({ userId: ctx.userId, action: 'run_email_sync', ok: result.success, message, newValue: { inserted, fetched } })
    if (!result.success) await alertOnFailure('email sync', message)
    return { ok: result.success, message, data: result as unknown as Record<string, unknown> }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error('runEmailSyncNowAction failed', { error: err })
    await logAudit({ userId: ctx.userId, action: 'run_email_sync', ok: false, message: msg })
    await alertOnFailure('email sync', msg)
    return { ok: false, message: msg }
  }
}

export async function runInvoiceRemindersNowAction(): Promise<ActionOutcome> {
  const ctx = await requireAdmin()
  if ('ok' in ctx) return ctx

  try {
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
    const message = `Rykker-tjek: scannet ${summary.checked}, sendt ${summary.sent}, manual ${summary.manual_review}, skip ${summary.skipped}, fejl ${summary.failed}`
    await logAudit({ userId: ctx.userId, action: 'run_invoice_reminders', ok: true, message, newValue: summary })
    return { ok: true, message, data: summary as unknown as Record<string, unknown> }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error('runInvoiceRemindersNowAction failed', { error: err })
    await logAudit({ userId: ctx.userId, action: 'run_invoice_reminders', ok: false, message: msg })
    return { ok: false, message: msg }
  }
}
