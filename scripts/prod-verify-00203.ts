/**
 * PRODUCTION read-only: pre/post for 00203 (tilbudsrevisioner; flag OFFER_REVISIONS_ENABLED forbliver OFF).
 *   npx tsx scripts/prod-verify-00203.ts pre    — kolonner/tabel findes ikke; tjeksum af tilbud + underskrifter gemmes
 *   npx tsx scripts/prod-verify-00203.ts post   — skema/politikker korrekte; tilbud + underskrifter UÆNDREDE (tjeksum)
 * Tjeksum = md5 over sorterede id|status|beløb|… — ingen data printes. Pre-værdier gemmes i .prod-verify-00203.json
 * (lokalt, gitignoreret mappe-uafhængigt: kun hashes og antal).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const STATE = join(tmpdir(), 'elta-prod-verify-00203.json')

withProdReadOnly(`prod-verify-00203-${mode}`, async (run, masked) => {
  const cols = (await run(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND
      ((table_name = 'offers' AND column_name IN ('revision_number', 'revision_of', 'superseded_by', 'superseded_at'))
       OR (table_name = 'offer_signatures' AND column_name = 'snapshot_id'))`)) as Array<{ column_name: string }>
  const tbl = (await run(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'offer_snapshots'`)) as Array<{ n: number }>
  const [off] = (await run(`SELECT count(*)::int n, md5(coalesce(string_agg(id::text || '|' || status::text || '|' || coalesce(final_amount::text, '') || '|' ||
      coalesce(offer_number, '') || '|' || coalesce(customer_id::text, '') || '|' || coalesce(updated_at::text, ''), ',' ORDER BY id), '')) h FROM offers`)) as Array<{ n: number; h: string }>
  const [sig] = (await run(`SELECT count(*)::int n, md5(coalesce(string_agg(id::text || '|' || offer_id::text || '|' || coalesce(signer_name, '') || '|' ||
      md5(coalesce(signature_data, '')), ',' ORDER BY id), '')) h FROM offer_signatures`)) as Array<{ n: number; h: string }>
  const checks: Array<[string, boolean, string]> = []
  if (mode === 'pre') {
    checks.push(['revisionskolonner findes ikke endnu', cols.length === 0, String(cols.length)])
    checks.push(['offer_snapshots findes ikke endnu', tbl[0].n === 0, String(tbl[0].n)])
    writeFileSync(STATE, JSON.stringify({ offers: off, signatures: sig }))
  } else {
    if (!existsSync(STATE)) throw new Error('pre-tilstand mangler — kør pre først')
    const pre = JSON.parse(readFileSync(STATE, 'utf8')) as { offers: { n: number; h: string }; signatures: { n: number; h: string } }
    checks.push(['5 revisionskolonner tilføjet', cols.length === 5, cols.map((c) => c.column_name).join(',')])
    checks.push(['offer_snapshots oprettet', tbl[0].n === 1, ''])
    const [def] = (await run(`SELECT count(*)::int n, count(*) FILTER (WHERE revision_number = 1 AND revision_of IS NULL AND superseded_by IS NULL AND superseded_at IS NULL)::int neutral FROM offers`)) as Array<{ n: number; neutral: number }>
    checks.push(['eksisterende tilbud har neutrale revisionsværdier (rev 1, ingen kæde)', def.n === def.neutral, `${def.neutral}/${def.n}`])
    checks.push(['tilbud uændrede (antal + tjeksum)', off.n === pre.offers.n && off.h === pre.offers.h, `${pre.offers.n}→${off.n}`])
    checks.push(['underskrifter intakte (antal + tjeksum)', sig.n === pre.signatures.n && sig.h === pre.signatures.h, `${pre.signatures.n}→${sig.n}`])
    const [sn] = (await run(`SELECT count(*) FILTER (WHERE snapshot_id IS NOT NULL)::int n FROM offer_signatures`)) as Array<{ n: number }>
    checks.push(['ingen underskrift har snapshot_id endnu', sn.n === 0, String(sn.n)])
    const [rls] = (await run(`SELECT relrowsecurity r FROM pg_class WHERE oid = 'public.offer_snapshots'::regclass`)) as Array<{ r: boolean }>
    checks.push(['RLS slået til på offer_snapshots', rls.r === true, ''])
    const pols = (await run(`SELECT cmd, roles::text roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'offer_snapshots'`)) as Array<{ cmd: string; roles: string }>
    checks.push(['kun SELECT-politik (ingen skrive-politik for brugere)', pols.length === 1 && pols[0].cmd === 'SELECT', JSON.stringify(pols)])
    const [g] = (await run(`SELECT has_table_privilege('anon', 'public.offer_snapshots', 'SELECT') anon_sel,
      has_table_privilege('authenticated', 'public.offer_snapshots', 'INSERT') auth_ins, has_table_privilege('authenticated', 'public.offer_snapshots', 'UPDATE') auth_upd,
      has_table_privilege('authenticated', 'public.offer_snapshots', 'DELETE') auth_del, has_table_privilege('authenticated', 'public.offer_snapshots', 'SELECT') auth_sel`)) as Array<Record<string, boolean>>
    checks.push(['grants: authenticated kun SELECT, anon intet', !g.anon_sel && !g.auth_ins && !g.auth_upd && !g.auth_del && g.auth_sel, JSON.stringify(g)])
  }
  console.log(`--- 00203 ${mode} @ prod:${masked} — tilbud ${off.n}, underskrifter ${sig.n} ---`)
  for (const [l, ok, n] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${n ? ` (${n})` : ''}`)
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
