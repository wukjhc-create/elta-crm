/**
 * Phase C0 + C1 — PRODUCTION READ-ONLY måling (kun SELECT; intet skrives; ingen emner/afsendere/navne/indhold i output).
 *   npx tsx scripts/prod-phase-c-shadow.ts baseline [--since YYYY-MM-DD]   (C0: nøgletal for perioden, standard 30 dage)
 *   npx tsx scripts/prod-phase-c-shadow.ts shadow   [--since YYYY-MM-DD]   (C1: klassificér mails i hukommelsen og
 *                                                                            sammenlign med eksisterende arbejdsgange)
 * Staging: `npx tsx scripts/test-harness/cli.ts phase-c-shadow baseline|shadow [--since …]` (samme kerne).
 * Kerner: scripts/test-harness/phase-c-baseline-core.ts og inquiry-shadow-core.ts. Runbook: docs/runbooks/PHASE_C0_C1.md.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { copenhagenParts } from '../src/lib/utils/copenhagen-time'
import { baselineSql, baselineReport } from './test-harness/phase-c-baseline-core'
import { SHADOW_DATA_SQL, classifyAll, shadowReport, type ShadowData } from './test-harness/inquiry-shadow-core'

const mode = process.argv[2]
const i = process.argv.indexOf('--since')
const since = i > 0 ? process.argv[i + 1] : copenhagenParts(new Date(Date.now() - 30 * 86_400_000)).date
if ((mode !== 'baseline' && mode !== 'shadow') || !/^\d{4}-\d{2}-\d{2}$/.test(since ?? '')) {
  console.error('brug: baseline|shadow [--since YYYY-MM-DD]'); process.exit(2)
}

withProdReadOnly(`prod-phase-c-${mode}`, async (run) => {
  if (mode === 'baseline') {
    const j = (await run(baselineSql(since)))[0].j
    for (const l of baselineReport(j)) console.log(l)
    return
  }
  const d = (await run(SHADOW_DATA_SQL))[0].j as ShadowData
  const rows = classifyAll(d, { since })
  console.log(`SHADOW C1 fra ${since} (kontekst som på modtagelsestidspunktet; intet ændret)`)
  for (const l of shadowReport(rows)) console.log(l)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
