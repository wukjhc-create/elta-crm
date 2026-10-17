/**
 * PRODUCTION read-only (DF-1, review 2026-10-17): er reglen "auto-faktura ved tilbud accepteret" aktiv, og har den
 * oprettet fakturaer UDEN sag (case_id NULL) for tilbud der OGSÅ har en sag? Kun aggregater, ingen personværdier.
 *   npx tsx scripts/prod-auto-invoice-rule.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-auto-invoice-rule', async (run, masked) => {
  const rules = (await run(`SELECT active, dry_run, action FROM public.automation_rules WHERE trigger = 'offer_accepted' ORDER BY created_at`)) as Array<{ active: boolean; dry_run: boolean; action: string }>
  const execs2 = (await run(`SELECT e.status, count(*)::int n FROM public.automation_executions e JOIN public.automation_rules r ON r.id = e.rule_id
      WHERE r.trigger = 'offer_accepted' GROUP BY 1 ORDER BY 1`).catch(() => [])) as Array<{ status: string; n: number }>
  const execs = (await run(`SELECT count(*)::int n, max(e.created_at)::text last FROM public.automation_executions e
      JOIN public.automation_rules r ON r.id = e.rule_id WHERE r.trigger = 'offer_accepted'`).catch((e) => { console.error(maskDbError(e)); return [{ n: -1, last: null }] })) as Array<{ n: number; last: string | null }>
  const dbl = (await run(`SELECT count(*)::int n FROM public.invoices i
      WHERE i.case_id IS NULL AND i.offer_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.service_cases s WHERE s.source_offer_id = i.offer_id)`).catch((e) => { console.error(maskDbError(e)); return [{ n: -1 }] })) as Array<{ n: number }>
  const noCase = (await run(`SELECT count(*)::int n FROM public.invoices WHERE case_id IS NULL AND offer_id IS NOT NULL`).catch((e) => { console.error(maskDbError(e)); return [{ n: -1 }] })) as Array<{ n: number }>
  console.log(`prod:${masked} regler(offer_accepted)=${JSON.stringify(rules)} · kørsler=${execs[0]?.n} (seneste ${execs[0]?.last ?? '-'}; status ${JSON.stringify(execs2)}) · fakturaer uden sag fra tilbud=${noCase[0]?.n} · heraf tilbud der OGSÅ har en sag=${dbl[0]?.n}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
