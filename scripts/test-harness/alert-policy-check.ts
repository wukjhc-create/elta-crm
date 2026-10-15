/**
 * Alarm-politik (Henrik 2026-10-15) på staging. INGEN mail: Graph-/alarm-env nulstilles i processen før modulerne
 * indlæses, så mail-stien ender i "graph_not_configured" (beviser at den blev forsøgt).
 *   A1  klassifikation: kun error i invoice/bank/economic/email/cron er kritisk
 *   A2  advarsel → klokken (én åben pr. nøgle), ingen mail-forsøg
 *   A3  kritisk logHealth → klokke-række 'critical' + mail-forsøg
 *   A4  kritisk igen inden for cooldown → intet nyt mail-forsøg, ingen ny klokke-række
 *   A5  UI-fejl (ikke-kritisk) → ingen alarm
 *   A6  modtagere = aktive admin + serviceleder (ingen montør/salg/bogholderi, ingen inaktive)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ApCheck { id: string; ok: boolean; note: string }

export async function runAlertPolicyCheck(c: { admin: SupabaseClient }): Promise<ApCheck[]> {
  for (const k of ['AZURE_TENANT_ID', 'AZURE_AD_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_AD_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_AD_CLIENT_SECRET', 'ADMIN_ALERT_EMAIL']) delete process.env[k]
  const out: ApCheck[] = []
  const { isCriticalHealthEvent } = await import('../../src/lib/alerts/alert-policy')
  const { sendAdminAlert, resolveAlertRecipients } = await import('../../src/lib/services/admin-alerts')
  const { logHealth } = await import('../../src/lib/services/system-health')
  const { isGraphConfigured } = await import('../../src/lib/services/microsoft-graph')
  if (isGraphConfigured()) return [{ id: 'guard', ok: false, note: 'Graph stadig konfigureret — afbrudt (ingen mail)' }]

  const start = new Date().toISOString()
  const warnKey = 'harness_warning_probe'
  const critType = 'admin_alert:critical:invoice'
  const cleanup = async () => {
    await c.admin.from('system_alerts').delete().in('alert_type', [`admin_alert:${warnKey}`, critType])
    await c.admin.from('system_health_log').delete().like('message', `admin_alert:${warnKey}%`)
    await c.admin.from('system_health_log').delete().like('message', 'admin_alert:critical:invoice%')
    await c.admin.from('system_health_log').delete().like('message', '[HARNESS-ALERT]%')
  }
  const healthRows = async (prefix: string) => ((await c.admin.from('system_health_log').select('message').like('message', `${prefix}%`).gte('created_at', start)).data ?? []) as Array<{ message: string }>
  const bell = async (t: string) => ((await c.admin.from('system_alerts').select('severity').eq('alert_type', t).eq('is_dismissed', false)).data ?? []) as Array<{ severity: string }>

  await cleanup()
  try {
    out.push({
      id: 'A1 klassifikation',
      ok: isCriticalHealthEvent('invoice', 'error') && isCriticalHealthEvent('cron', 'error') && !isCriticalHealthEvent('ui', 'error')
        && !isCriticalHealthEvent('invoice', 'warning') && !isCriticalHealthEvent('email_intel', 'error'),
      note: 'invoice/cron error = kritisk; ui/email_intel/advarsler = ikke',
    })

    const w1 = await sendAdminAlert({ key: warnKey, severity: 'warning', subject: '[ELTA Drift] harness advarsel', body: 'probe' })
    await sendAdminAlert({ key: warnKey, severity: 'warning', subject: '[ELTA Drift] harness advarsel', body: 'probe' })
    const wb = await bell(`admin_alert:${warnKey}`)
    const wh = await healthRows(`admin_alert:${warnKey}`)
    out.push({
      id: 'A2 advarsel → klokken, ingen mail',
      ok: !w1.sent && w1.reason === 'notification_only' && wb.length === 1 && wb[0].severity === 'warning' && wh.every((r) => r.message.endsWith('notification_only')),
      note: `reason=${w1.reason} klokke=${wb.length} health=${wh.map((r) => r.message.split(' ')[1]).join(',')}`,
    })

    await logHealth('invoice', 'error', '[HARNESS-ALERT] kritisk probe 1')
    const cb = await bell(critType)
    const ch = await healthRows('admin_alert:critical:invoice')
    out.push({
      id: 'A3 kritisk → klokke + mail-forsøg',
      ok: cb.length === 1 && cb[0].severity === 'critical' && ch.length === 1 && /graph_not_configured|no_recipients/.test(ch[0].message),
      note: `klokke=${cb.map((b) => b.severity).join(',')} mail=${ch.map((r) => r.message.split(' ')[1]).join(',')}`,
    })

    await logHealth('invoice', 'error', '[HARNESS-ALERT] kritisk probe 2')
    const cb2 = await bell(critType)
    const ch2 = await healthRows('admin_alert:critical:invoice')
    out.push({ id: 'A4 cooldown: ingen ny mail/klokke', ok: cb2.length === 1 && ch2.length === 1, note: `klokke=${cb2.length} mail-forsøg=${ch2.length}` })

    await logHealth('ui', 'error', '[HARNESS-ALERT] ui probe')
    const ui = ((await c.admin.from('system_alerts').select('id').like('alert_type', 'admin_alert:critical:ui%')).data ?? []).length
    out.push({ id: 'A5 UI-fejl → ingen alarm', ok: ui === 0, note: `alarmer=${ui}` })

    const rec = await resolveAlertRecipients()
    const { data: all } = await c.admin.from('profiles').select('role, is_active, email').in('role', ['admin', 'serviceleder'])
    const diag = ((all ?? []) as Array<{ role: string; is_active: boolean | null; email: string | null }>).reduce<Record<string, number>>((a, p) => {
      const k = `${p.role}/aktiv=${p.is_active}/mail=${p.email?.includes('@') ? 'ja' : 'nej'}`
      return { ...a, [k]: (a[k] ?? 0) + 1 }
    }, {})
    // Modtagerne slås op via Auth-e-mail → profil-id → rolle
    const roles: Array<{ role: string; is_active: boolean }> = []
    for (let page = 1; page <= 10 && rec.length; page++) {
      const { data: lu } = await c.admin.auth.admin.listUsers({ page, perPage: 200 })
      const hits = (lu?.users ?? []).filter((u) => rec.includes((u.email ?? '').toLowerCase()))
      if (hits.length) {
        const { data: ps } = await c.admin.from('profiles').select('role, is_active').in('id', hits.map((h) => h.id))
        roles.push(...((ps ?? []) as Array<{ role: string; is_active: boolean }>))
      }
      if ((lu?.users ?? []).length < 200) break
    }
    const { count: activeSl } = await c.admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'serviceleder').eq('is_active', true)
    out.push({
      id: 'A6 modtagere = aktive admin + serviceleder',
      ok: rec.length > 0 && roles.length === rec.length && roles.every((p) => ['admin', 'serviceleder'].includes(p.role) && p.is_active) && (!activeSl || roles.some((p) => p.role === 'serviceleder')),
      note: `diag ${JSON.stringify(diag)} · ${rec.length} modtagere: ${Object.entries(roles.reduce<Record<string, number>>((a, p) => ({ ...a, [p.role]: (a[p.role] ?? 0) + 1 }), {})).map(([r, n]) => `${r}=${n}`).join(' ')}`,
    })
  } finally {
    await cleanup()
  }
  return out
}

export function formatAlertPolicyCheck(checks: ApCheck[]): string {
  return ['Alarm-politik — staging, ingen mail', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
