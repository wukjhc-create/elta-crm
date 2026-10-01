/**
 * PRODUCTION read-only (P-009 laese-side): kolonner med hemmeligheds-agtige navne som authenticated/anon kan LAESE.
 * Kun metadata (tabel/kolonne/antal raekker med vaerdi) — aldrig vaerdier.
 *   npx tsx scripts/prod-sensitive-columns.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const PATTERN = `(token|secret|password|passwd|api_key|apikey|private_key|credential|signature_data|cpr|bank_account|iban|otp|refresh|access_key)`

withProdReadOnly('prod-sensitive-columns', async (run, masked) => {
  console.log(`--- følsomme kolonner læsbare for klienter @ prod:${masked} ---`)
  const cols = (await run(`SELECT c.table_name t, c.column_name col,
      has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, 'SELECT') auth,
      has_column_privilege('anon', format('public.%I', c.table_name), c.column_name, 'SELECT') anon
    FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.column_name ~* '${PATTERN}'
    ORDER BY 1, 2`)) as Array<{ t: string; col: string; auth: boolean; anon: boolean }>
  for (const x of cols.filter((c) => c.auth || c.anon)) {
    const pol = (await run(`SELECT string_agg(coalesce(qual,'?'), ' | ') q FROM pg_policies WHERE schemaname='public' AND tablename='${x.t}' AND cmd IN ('SELECT','ALL')`))[0].q
    const n = (await run(`SELECT count(*) FILTER (WHERE ${x.col.replace(/[^a-z_0-9]/g, '')} IS NOT NULL)::int n FROM public.${x.t.replace(/[^a-z_0-9]/g, '')}`))[0].n
    console.log(`  ${`${x.t}.${x.col}`.padEnd(52)} auth=${x.auth ? 'JA' : 'nej'} anon=${x.anon ? 'JA' : 'nej'} · rækker m. værdi=${n} · SELECT-policy: ${String(pol ?? '(ingen)').replace(/\s+/g, ' ').slice(0, 70)}`)
  }
  console.log(`  (${cols.length} kolonner matcher mønsteret; ${cols.filter((c) => !c.auth && !c.anon).length} er allerede skjult)`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
