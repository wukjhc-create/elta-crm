/**
 * PRODUCTION READ ONLY — Relatel-observationstilstand (efter "Send testlevering" / testopkald).
 *   npx tsx scripts/prod-relatel-observation.ts --since ISO
 * Viser kun det webhooken selv har logget i system_health_log (service 'telephony'): hændelsestype, udfald, HTTP-status,
 * nøgleplads (current/previous) og payloadens feltnavne/typer. Ingen værdier findes i loggen. Tjekker samtidig, at intet
 * er gemt i telefoni-tabellerne og at der ikke er oprettet tilbageringnings-opgaver (lagring skal være FRA).
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const i = process.argv.indexOf('--since')
const since = i > 0 ? String(process.argv[i + 1]) : new Date(Date.now() - 24 * 3600_000).toISOString()
if (Number.isNaN(Date.parse(since))) throw new Error('ugyldig --since')

withProdReadOnly('prod-relatel-observation', async (run) => {
  const rows = await run(`SELECT created_at, status, metadata FROM system_health_log WHERE service = 'telephony' AND created_at >= '${since}'::timestamptz ORDER BY created_at`)
  console.log(`INFO  observationer siden ${since}: ${rows.length}`)
  for (const r of rows) {
    const m = (r.metadata ?? {}) as Record<string, unknown>
    console.log(`      ${new Date(r.created_at).toISOString()}  ${m.event_type} → ${m.outcome} (HTTP ${m.http_status}, nøgle ${m.key_slot})`)
    console.log(`        felter: ${JSON.stringify(m.payload_shape)}`)
  }
  const c = (await run(`SELECT (SELECT count(*) FROM telephony_calls WHERE created_at >= '${since}'::timestamptz)::int calls,
      (SELECT count(*) FROM telephony_events WHERE received_at >= '${since}'::timestamptz)::int events,
      (SELECT count(*) FROM customer_tasks WHERE auto_rule IN ('assistant_callback','assistant_missed_call') AND created_at >= '${since}'::timestamptz)::int callbacks`))[0]
  const ok = c.calls === 0 && c.events === 0 && c.callbacks === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  intet gemt siden ${since} (opkald=${c.calls}, hændelser=${c.events}, tilbageringninger=${c.callbacks})`)
  process.exitCode = ok ? 0 : 2
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
