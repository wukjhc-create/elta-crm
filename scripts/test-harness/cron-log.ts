/**
 * P1 #9 — withCronRun paa staging: hver autoriseret koersel giver én raekke i system_health_log med korrekt status,
 * 401 giver ingen raekke, exception logges og kastes videre. Probe-raekker (cron-navn 'harness-probe-*') slettes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CronLogCheck { id: string; ok: boolean; note: string }

export async function runCronLog(c: { admin: SupabaseClient }): Promise<CronLogCheck[]> {
  const { withCronRun } = await import('../../src/lib/services/cron-run')
  const { runCronRegistryCheck } = await import('../cron-registry-check')
  const tag = `harness-probe-${Date.now()}`
  const out: CronLogCheck[] = []
  const rowsFor = async (name: string) => ((await c.admin.from('system_health_log').select('status, message, metadata').eq('service', 'cron').eq('metadata->>cron', name)).data ?? []) as Array<{ status: string; metadata: Record<string, unknown> }>
  const req = new Request('https://staging.invalid/api/cron/x')
  try {
    const cases: Array<[string, () => Promise<Response>, string | null]> = [
      ['ok', async () => Response.json({ sent: 0 }), 'ok'],
      ['4xx', async () => Response.json({ error: 'ikke konfigureret' }, { status: 400 }), 'warning'],
      ['5xx', async () => Response.json({ error: 'boom' }, { status: 500 }), 'error'],
      ['401', async () => Response.json({ error: 'Unauthorized' }, { status: 401 }), null],
    ]
    for (const [label, fn, expected] of cases) {
      const name = `${tag}-${label}`
      const res = await withCronRun(name, fn)(req)
      const rows = await rowsFor(name)
      const ok = expected === null ? rows.length === 0 : rows.length === 1 && rows[0].status === expected && typeof rows[0].metadata?.duration_ms === 'number'
      out.push({ id: `R ${label}`, ok: ok && res.status === (await fn()).status, note: `http=${res.status} · raekker=${rows.length}${rows[0] ? ` status=${rows[0].status}` : ''} (forventet ${expected ?? 'ingen'})` })
    }
    const name = `${tag}-throw`
    let rethrown = false
    try { await withCronRun(name, async () => { throw new Error('probe-exception') })(req) } catch { rethrown = true }
    const rows = await rowsFor(name)
    out.push({ id: 'R exception', ok: rethrown && rows.length === 1 && rows[0].status === 'error', note: `kastet videre=${rethrown} · raekker=${rows.length} status=${rows[0]?.status}` })
  } finally {
    await c.admin.from('system_health_log').delete().eq('service', 'cron').like('metadata->>cron', `${tag}%`)
  }
  const f = runCronRegistryCheck()
  out.push({ id: 'R register/routes (statisk)', ok: f.length === 0, note: f.length ? f.slice(0, 2).join(' | ') : '15 crons: register = vercel.json, alle pakket' })
  return out
}

export function formatCronLog(c: CronLogCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'CRON-KOERSELSLOG:', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(28)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} cron-log-checks som forventet`].join('\n')
}
