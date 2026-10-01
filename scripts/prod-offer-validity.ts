/** PRODUCTION read-only: tilbud uden gyldighedsdato (udløber aldrig) pr. status + oprettet af rolle. Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-offer-validity', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'tilbud_i_alt', (SELECT count(*)::int FROM offers WHERE NOT is_proposal),
    'uden_gyldighed', (SELECT count(*)::int FROM offers WHERE NOT is_proposal AND valid_until IS NULL),
    'uden_gyldighed_sendt_eller_set', (SELECT count(*)::int FROM offers WHERE NOT is_proposal AND valid_until IS NULL AND status IN ('sent', 'viewed')),
    'uden_gyldighed_pr_rolle', (SELECT json_object_agg(r, n) FROM (SELECT coalesce(p.role, '?') r, count(*)::int n FROM offers o LEFT JOIN profiles p ON p.id = o.created_by
       WHERE NOT o.is_proposal AND o.valid_until IS NULL GROUP BY 1) x)
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
