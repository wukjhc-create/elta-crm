/** PRODUCTION read-only: findes tabellerne? Brug: npx tsx scripts/prod-table-exists.ts tabel1 tabel2 … (kun ja/nej) */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const names = process.argv.slice(2).filter((n) => /^[a-z_][a-z0-9_]*$/.test(n))
withProdReadOnly('prod-table-exists', async (run) => {
  const list = names.map((n) => `'${n}'`).join(',') || `''`
  console.log(JSON.stringify((await run(`SELECT json_object_agg(n, to_regclass('public.' || n) IS NOT NULL) s FROM unnest(ARRAY[${list}]::text[]) n`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
