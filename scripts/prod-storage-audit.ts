/**
 * PRODUCTION storage-audit — STRENGT READ-ONLY (se prod-readonly.ts for de lagdelte garantier).
 *   npm run prod:storage-audit
 * Kun faste SELECT-forespoergsler fra storage-audit.ts. Snapshot gemmes i harness-reports/ (gitignored).
 * Exit 2 hvis et sikkerhedshul findes.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { collectSnapshot, evaluateSnapshot, formatSnapshot } from './test-harness/storage-audit'

async function main() {
  const snap = await withProdReadOnly('prod-storage-audit', (run, masked) => collectSnapshot(`prod:${masked}`, run))
  console.log(formatSnapshot(snap))
  const findings = evaluateSnapshot(snap)
  const holes = findings.filter((x) => x.severity === 'hole')
  for (const x of findings) console.log(`  ${x.severity === 'hole' ? '❌ HUL ' : 'ℹ️ info'} ${x.message}`)

  const dir = resolve(process.cwd(), 'harness-reports')
  mkdirSync(dir, { recursive: true })
  const file = `prod-storage-audit-${snap.at.replace(/[:.]/g, '-')}.json`
  writeFileSync(resolve(dir, file), JSON.stringify({ snapshot: snap, findings }, null, 2))
  console.log(`[prod-audit] snapshot gemt: harness-reports/${file}`)
  console.log(`\n=== PROD STORAGE: ${holes.length ? `❌ ${holes.length} HUL — STOP, ret ikke prod uden godkendelse` : '✅ ingen huller'} (ingen skrivning udfoert) ===`)
  process.exitCode = holes.length ? 2 : 0
}

main().catch((e) => { console.error('[prod-audit] FEJL:', maskDbError(e)); process.exit(1) })
