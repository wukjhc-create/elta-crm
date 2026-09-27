/**
 * PRODUCTION fuld databaseaudit — STRENGT READ-ONLY (se prod-readonly.ts).   npm run prod:db-audit
 * Rapport gemmes i harness-reports/ (gitignored). Exit 2 ved HOEJ-fund der ikke er registreret som bevidste.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { runDbAudit, formatDbAudit } from './test-harness/db-audit'

withProdReadOnly('prod-db-audit', async (run, masked) => {
  const r = await runDbAudit(run)
  console.log(formatDbAudit(`prod:${masked}`, r))
  const dir = resolve(process.cwd(), 'harness-reports')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `prod-db-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(r, null, 2))
  process.exitCode = r.findings.some((x) => x.severity === 'HOEJ' && !x.intentional) ? 2 : 0
}).catch((e) => { console.error('[prod-db-audit] FEJL:', maskDbError(e)); process.exit(1) })
