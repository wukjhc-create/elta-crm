/**
 * PRODUCTION read-only: antal system_health_log-rækker pr. service/status/dag (seneste N dage, default 14).
 * Ingen beskedtekster ud (kan indeholde persondata). Bruges til at dimensionere alarm-politikken (spam-risiko).
 *   npx tsx scripts/prod-health-error-counts.ts [dage]
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const days = Math.min(90, Math.max(1, Number(process.argv[2] ?? 14) || 14))
withProdReadOnly('prod-health-error-counts', async (run, masked) => {
  const rows = (await run(`SELECT service, status, (created_at AT TIME ZONE 'Europe/Copenhagen')::date::text AS d, count(*)::int n
    FROM public.system_health_log WHERE created_at > now() - interval '${days} days' AND status IN ('error','warning')
    GROUP BY 1,2,3 ORDER BY 1,2,3`)) as Array<{ service: string; status: string; d: string; n: number }>
  console.log(`system_health_log error/warning seneste ${days} d @ prod:${masked}`)
  const agg = new Map<string, { days: number; total: number; max: number }>()
  for (const r of rows) {
    const k = `${r.service}/${r.status}`
    const a = agg.get(k) ?? { days: 0, total: 0, max: 0 }
    a.days++; a.total += r.n; a.max = Math.max(a.max, r.n)
    agg.set(k, a)
  }
  for (const [k, a] of agg) console.log(`  ${k.padEnd(28)} dage=${a.days} i alt=${a.total} maks/dag=${a.max}`)
  const kinds = (await run(`SELECT service, left(regexp_replace(message, '[0-9a-f-]{8,}|[0-9]+', '#', 'g'), 40) AS kind, count(*)::int n
    FROM public.system_health_log WHERE created_at > now() - interval '${days} days' AND status = 'error' AND service <> 'health_check'
    GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15`)) as Array<{ service: string; kind: string; n: number }>
  console.log('Hyppigste fejltyper (tal/id maskeret, 40 tegn):')
  for (const k of kinds) console.log(`  ${String(k.n).padStart(4)}  [${k.service}] ${k.kind}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
