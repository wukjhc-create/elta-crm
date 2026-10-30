/**
 * PRODUCTION read-only: tjek efter/mellem pilot-sessioner (Henrik 2026-10-30). STRENGT READ-ONLY (se prod-readonly.ts).
 *   npx tsx scripts/prod-pilot-session-check.ts              # sidste 24 timer
 *   npx tsx scripts/prod-pilot-session-check.ts --hours 72
 *   npx tsx scripts/prod-pilot-session-check.ts --since 2026-11-03   # fra kl. 00:00 dansk tid
 *
 * Viser: hvad piloten brugte (antal pr. person P1…, samme numre som prod-pilot-readiness) · mislykkede handlinger og
 * rettighedsafvisninger (system_health_log 'user_action', se lib/pilot/action-failure-log) · klientcrash · forældreløse
 * timer · timer på forkert AO · materialer på forkert sag · dokument-/billedfejl · opgavefejl · ufuldstændige
 * afleveringer · medarbejder-/satsproblemer.
 * Ingen kundenavne, adresser, mails, beløb eller fritekst — kun sagsnr., korte id'er (8 tegn), etiketter og antal.
 * Exit 0 = intet at handle på · 2 = fund (se ❌) · 1 = scriptfejl.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { runPilotSessionCheck, sinceSql } from './test-harness/pilot-session-check'

withProdReadOnly('prod-pilot-session-check', async (run, masked) => {
  const { sql, label } = sinceSql()
  process.exitCode = (await runPilotSessionCheck(run, `prod:${masked}`, sql, label)) ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
