/**
 * PRODUCTION read-only verifikation af migration 00159 (offers.source_case_id) — foer og efter anvendelse.
 *   npm run prod:verify-00159
 * Foer: forventer "IKKE ANVENDT" + optaelling. Efter: kolonne/FK/indexes/konsistens. Skriver intet.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { run00159Checks, format00159 } from './test-harness/migration-checks'

withProdReadOnly('prod-verify-00159', async (run, masked) => {
  const r = await run00159Checks(run)
  // Backfill-forudsigelse (read-only): udfoerte agent-actions der ville koble et tilbud.
  const pending = (await run(`SELECT count(*) AS n FROM public.agent_actions WHERE capability = 'offer.propose_draft_from_case' AND status = 'executed'`))[0]
  console.log(format00159(`prod:${masked}`, r))
  console.log(`udfoerte offer.propose_draft_from_case-actions (backfill-kandidater): ${pending.n}`)
  process.exitCode = r.problems.length ? 2 : 0
}).catch((e) => { console.error('[prod-verify-00159] FEJL:', maskDbError(e)); process.exit(1) })
