/** PRODUCTION read-only: aabne skrive-policies (navn + cmd) + om SELECT er via ALL, pr. tabel som JSON. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const tables = process.argv.slice(2).filter((t) => /^[a-z_0-9]+$/.test(t))
withProdReadOnly('prod-open-write-json', async (run) => {
  const list = tables.map((t) => `'${t}'`).join(',')
  const rows = (await run(`SELECT tablename t, policyname p, cmd FROM pg_policies WHERE schemaname='public' AND tablename IN (${list})
    AND cmd IN ('INSERT','UPDATE','DELETE','ALL') AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[])
    AND (trim(coalesce(qual,''))='true' OR trim(coalesce(with_check,''))='true') ORDER BY 1,2`)) as Array<{ t: string; p: string; cmd: string }>
  const sel = (await run(`SELECT tablename t, count(*) FILTER (WHERE cmd='SELECT')::int s FROM pg_policies WHERE schemaname='public' AND tablename IN (${list}) GROUP BY 1`)) as Array<{ t: string; s: number }>
  const out: Record<string, { drop: string[]; hasAll: boolean; selectPolicies: number }> = {}
  for (const t of tables) out[t] = { drop: rows.filter((r) => r.t === t).map((r) => r.p), hasAll: rows.some((r) => r.t === t && r.cmd === 'ALL'), selectPolicies: sel.find((x) => x.t === t)?.s ?? 0 }
  console.log(JSON.stringify(out))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
