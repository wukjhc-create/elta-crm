/** PRODUCTION read-only: ALLE skrive-policies (authenticated/public) pr. tabel som JSON — ikke kun de aabne. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const tables = process.argv.slice(2).filter((t) => /^[a-z_0-9]+$/.test(t))
withProdReadOnly('prod-all-write-json', async (run) => {
  const list = tables.map((t) => `'${t}'`).join(',')
  const rows = (await run(`SELECT tablename t, policyname p FROM pg_policies WHERE schemaname='public' AND tablename IN (${list})
    AND cmd IN ('INSERT','UPDATE','DELETE','ALL') AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[]) ORDER BY 1,2`)) as Array<{ t: string; p: string }>
  const out: Record<string, string[]> = {}
  for (const t of tables) out[t] = rows.filter((r) => r.t === t).map((r) => r.p)
  console.log(JSON.stringify(out))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
