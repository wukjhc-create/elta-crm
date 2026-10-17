/**
 * PRODUCTION read-only: seneste offer-reminders cron-rækker i system_health_log — kun status, tidspunkt og hvilke
 * nøgler/tal svaret havde (ingen tekst, ingen persondata).
 *   npx tsx scripts/prod-offer-reminders-health.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-offer-reminders-health', async (run, masked) => {
  const rows = (await run(`SELECT created_at::text t, status, message,
      (metadata->>'http_status') http, left(coalesce(metadata->>'summary',''), 400) summary
    FROM public.system_health_log WHERE service = 'cron' AND message LIKE 'offer-reminders:%'
    ORDER BY created_at DESC LIMIT 3`)) as Array<{ t: string; status: string; message: string; http: string | null; summary: string }>
  console.log(`prod:${masked}`)
  for (const r of rows) {
    let shape = ''
    try {
      const j = JSON.parse(r.summary) as Record<string, unknown>
      shape = JSON.stringify(Object.fromEntries(Object.entries(j).map(([k, v]) => [k, typeof v === 'number' ? v : Array.isArray(v) ? `array(${v.length})` : typeof v === 'object' && v ? `{${Object.keys(v as object).join(',')}}` : typeof v])))
    } catch { shape = '(ikke JSON/afkortet)' }
    console.log(r.t, r.status, r.message, 'http', r.http, shape)
    try {
      const j = JSON.parse(r.summary) as { errors?: unknown[] }
      for (const e of j.errors ?? []) console.log('   fejl:', String(e).replace(/[\w.+-]+@[\w.-]+/g, '<mail>').replace(/\d{3,}/g, '<n>').slice(0, 200))
    } catch { /* afkortet */ }
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
