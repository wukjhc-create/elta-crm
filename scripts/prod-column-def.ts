/** PRODUCTION read-only: kolonnedefinition (nullable/default/type).  npx tsx scripts/prod-column-def.ts tabel kolonne ... */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const [table, ...cols] = process.argv.slice(2)
withProdReadOnly('prod-column-def', async (run) => {
  if (!/^[a-z_0-9]+$/.test(table)) throw new Error('ugyldig tabel')
  for (const c of cols.filter((x) => /^[a-z_0-9]+$/.test(x)))
    console.log(JSON.stringify((await run(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${c}'`))[0] ?? { column_name: c, findes: false }))
  console.log('rækker med cost_price NULL:', JSON.stringify((await run(`SELECT count(*) FILTER (WHERE cost_price IS NULL)::int n_null, count(*) FILTER (WHERE cost_price = 0)::int n_zero FROM ${table}`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
