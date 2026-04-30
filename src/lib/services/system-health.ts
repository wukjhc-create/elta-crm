/**
 * System health (Phase 6).
 *
 * `logHealth` is the public surface used by every critical flow. It is
 * fire-and-forget and FULLY try/catch-wrapped — a logging failure must
 * never propagate up to the caller and crash a real flow.
 *
 * `getSystemHealth()` aggregates the last hour into a per-service
 * snapshot for dashboards and the cron health-check.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  HealthService,
  HealthStatus,
  ServiceHealth,
  SystemHealthLogRow,
  SystemHealthSnapshot,
} from '@/types/system-health.types'

const ALL_SERVICES: HealthService[] = [
  'email',
  'email_intel',
  'auto_case',
  'auto_offer',
  'invoice',
  'bank',
  'economic',
  'health_check',
]

const ERRORS_THRESHOLD_PER_HOUR = 5

// =====================================================
// Logging
// =====================================================

/**
 * Fire-and-forget health log. Always returns void; never throws. Safe
 * to await OR ignore — both behave the same for callers.
 */
export async function logHealth(
  service: HealthService,
  status: HealthStatus,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const tag = `HEALTH ${status.toUpperCase()} [${service}]`
  // Always console.log first so we still see the signal even if DB
  // insert is failing.
  try {
    if (status === 'error') console.error(tag, message, metadata ?? '')
    else if (status === 'warning') console.warn(tag, message, metadata ?? '')
    else console.log(tag, message, metadata ?? '')
  } catch { /* ignore console failures */ }

  try {
    const supabase = createAdminClient()
    await supabase.from('system_health_log').insert({
      service,
      status,
      message: message.slice(0, 2000),
      metadata: metadata ?? null,
    })
  } catch {
    // Swallow — never crash the calling flow because logging failed.
  }
}

// =====================================================
// Snapshot / aggregation
// =====================================================

export async function getSystemHealth(): Promise<SystemHealthSnapshot> {
  const generatedAt = new Date().toISOString()
  const fallback: SystemHealthSnapshot = {
    generatedAt,
    overall: 'ok',
    services: ALL_SERVICES.map<ServiceHealth>((s) => ({
      service: s,
      status: 'ok',
      errorsLastHour: 0,
      warningsLastHour: 0,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastOkAt: null,
    })),
    recentErrors: [],
  }

  try {
    const supabase = createAdminClient()
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data: rows } = await supabase
      .from('system_health_log')
      .select('*')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(2000)

    const list = (rows ?? []) as SystemHealthLogRow[]
    const byService = new Map<HealthService, SystemHealthLogRow[]>()
    for (const r of list) {
      const arr = byService.get(r.service as HealthService) ?? []
      arr.push(r)
      byService.set(r.service as HealthService, arr)
    }

    const services: ServiceHealth[] = ALL_SERVICES.map((s) => {
      const items = byService.get(s) ?? []
      const errors = items.filter((i) => i.status === 'error')
      const warns = items.filter((i) => i.status === 'warning')
      const oks = items.filter((i) => i.status === 'ok')

      let status: HealthStatus = 'ok'
      if (errors.length > 0) status = 'error'
      else if (errors.length + warns.length > ERRORS_THRESHOLD_PER_HOUR) status = 'warning'
      else if (warns.length > 0) status = 'warning'

      return {
        service: s,
        status,
        errorsLastHour: errors.length,
        warningsLastHour: warns.length,
        lastErrorAt: errors[0]?.created_at ?? null,
        lastErrorMessage: errors[0]?.message ?? null,
        lastOkAt: oks[0]?.created_at ?? null,
      }
    })

    const overall: HealthStatus = services.some((s) => s.status === 'error')
      ? 'error'
      : services.some((s) => s.status === 'warning')
      ? 'warning'
      : 'ok'

    const recentErrors = list.filter((r) => r.status === 'error').slice(0, 25)

    return { generatedAt, overall, services, recentErrors }
  } catch {
    return fallback
  }
}

// =====================================================
// Active probes (used by cron every 5 min)
// =====================================================

interface ProbeOutcome {
  service: HealthService
  status: HealthStatus
  message: string
  metadata?: Record<string, unknown>
}

export async function runHealthProbes(): Promise<ProbeOutcome[]> {
  const supabase = createAdminClient()
  const outcomes: ProbeOutcome[] = []

  // ---- 1. Email sync — most recent successful sync per mailbox should be < 30 min
  try {
    const { data: states } = await supabase
      .from('graph_sync_state')
      .select('mailbox, last_sync_at, last_sync_status, last_sync_error')
    const now = Date.now()
    const stale: string[] = []
    const failed: string[] = []
    for (const s of states ?? []) {
      const lastMs = s.last_sync_at ? new Date(s.last_sync_at).getTime() : 0
      const ageMin = (now - lastMs) / 60000
      if (s.last_sync_status === 'failed') failed.push(`${s.mailbox}: ${s.last_sync_error || 'failed'}`)
      else if (!lastMs || ageMin > 30) stale.push(`${s.mailbox} (${Math.round(ageMin)} min ago)`)
    }
    if (failed.length > 0) {
      outcomes.push({ service: 'email', status: 'error', message: `email sync failures: ${failed.join('; ')}` })
    } else if (stale.length > 0) {
      outcomes.push({ service: 'email', status: 'warning', message: `email sync stale: ${stale.join(', ')}` })
    } else if ((states ?? []).length === 0) {
      outcomes.push({ service: 'email', status: 'warning', message: 'no graph_sync_state rows — sync not initialised' })
    } else {
      outcomes.push({ service: 'email', status: 'ok', message: `email sync ok (${(states ?? []).length} mailboxes)` })
    }
  } catch (err) {
    outcomes.push({
      service: 'email',
      status: 'error',
      message: 'email probe threw: ' + (err instanceof Error ? err.message : String(err)),
    })
  }

  // ---- 2. Bank import — at least one bank_transactions row in the last 7 days
  try {
    const cutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { count } = await supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .gte('date', cutoffIso)
    if (!count || count === 0) {
      outcomes.push({ service: 'bank', status: 'warning', message: 'no bank_transactions in last 7 days' })
    } else {
      outcomes.push({ service: 'bank', status: 'ok', message: `${count} bank rows last 7 days`, metadata: { count } })
    }
  } catch (err) {
    outcomes.push({
      service: 'bank',
      status: 'error',
      message: 'bank probe threw: ' + (err instanceof Error ? err.message : String(err)),
    })
  }

  // ---- 3. Economic active flag
  try {
    const { data: ec } = await supabase
      .from('accounting_integration_settings')
      .select('active, api_token, agreement_grant_token, last_sync_at')
      .eq('provider', 'economic')
      .maybeSingle()
    if (!ec) {
      outcomes.push({ service: 'economic', status: 'warning', message: 'ECONOMIC_NOT_CONFIGURED (no settings row)' })
    } else if (!ec.active || !ec.api_token || !ec.agreement_grant_token) {
      outcomes.push({ service: 'economic', status: 'warning', message: 'economic not active or credentials missing' })
    } else {
      outcomes.push({
        service: 'economic',
        status: 'ok',
        message: 'economic active',
        metadata: { last_sync_at: ec.last_sync_at },
      })
    }
  } catch (err) {
    outcomes.push({
      service: 'economic',
      status: 'error',
      message: 'economic probe threw: ' + (err instanceof Error ? err.message : String(err)),
    })
  }

  // ---- 4. AI usage cap (00074_phase1_dedup_and_ai_cap)
  try {
    const today = new Date().toISOString().slice(0, 10)
    const { data: aiToday } = await supabase
      .from('ai_usage_daily')
      .select('day, call_count')
      .eq('day', today)
      .maybeSingle()
    const used = Number(aiToday?.call_count ?? 0)
    const cap = Number(process.env.AI_DAILY_CALL_CAP ?? 1000)
    const pct = cap > 0 ? used / cap : 0
    if (pct >= 1) {
      outcomes.push({ service: 'email_intel', status: 'error', message: `AI cap exceeded: ${used}/${cap}` })
    } else if (pct >= 0.8) {
      outcomes.push({ service: 'email_intel', status: 'warning', message: `AI usage ${used}/${cap} (${Math.round(pct * 100)}%)` })
    } else {
      outcomes.push({ service: 'email_intel', status: 'ok', message: `AI usage ${used}/${cap}`, metadata: { used, cap } })
    }
  } catch (err) {
    outcomes.push({
      service: 'email_intel',
      status: 'error',
      message: 'ai usage probe threw: ' + (err instanceof Error ? err.message : String(err)),
    })
  }

  // ---- 5. Invoice subsystem — count failed invoice flows in last hour
  try {
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: invErr } = await supabase
      .from('system_health_log')
      .select('id', { count: 'exact', head: true })
      .eq('service', 'invoice')
      .eq('status', 'error')
      .gte('created_at', sinceIso)
    if ((invErr ?? 0) > ERRORS_THRESHOLD_PER_HOUR) {
      outcomes.push({ service: 'invoice', status: 'error', message: `${invErr} invoice errors in last hour` })
    } else if ((invErr ?? 0) > 0) {
      outcomes.push({ service: 'invoice', status: 'warning', message: `${invErr} invoice errors in last hour` })
    } else {
      outcomes.push({ service: 'invoice', status: 'ok', message: 'no invoice errors last hour' })
    }
  } catch (err) {
    outcomes.push({
      service: 'invoice',
      status: 'error',
      message: 'invoice probe threw: ' + (err instanceof Error ? err.message : String(err)),
    })
  }

  return outcomes
}
