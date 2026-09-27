/**
 * PRODUCTION pilot-overvaagning — STRENGT READ-ONLY (se prod-readonly.ts).
 *   npm run prod:pilot-health
 * Daglig kontrol i pilotperioden. Exit 2 ved alarm. Snapshot gemmes i harness-reports/ (gitignored).
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { collectPilotHealth, formatPilotHealth } from './test-harness/pilot-metrics'

withProdReadOnly('prod-pilot-health', async (run, masked) => {
  const h = await collectPilotHealth(`prod:${masked}`, run)
  console.log(formatPilotHealth(h))
  const dir = resolve(process.cwd(), 'harness-reports')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `prod-pilot-health-${h.at.replace(/[:.]/g, '-')}.json`), JSON.stringify(h, null, 2))
  process.exitCode = h.alarms.length ? 2 : 0
}).catch((e) => { console.error('[prod-pilot-health] FEJL:', maskDbError(e)); process.exit(1) })
