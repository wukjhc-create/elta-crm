/**
 * PRODUCTION read-only: NOT NULL-kolonner uden default for givne tabeller (til probe-data i tests).
 *   npx tsx scripts/prod-required-columns.ts tabel ...
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const tables = process.argv.slice(2).filter((t) => /^[a-z_0-9]+$/.test(t))
withProdReadOnly('prod-required-columns', async (run) => {
  for (const t of tables) {
    const r = (await run(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}'
      AND is_nullable='NO' AND column_default IS NULL ORDER BY ordinal_position`)) as any[]
    const chk = (await run(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid='public.${t}'::regclass AND contype='c'`)) as any[]
    console.log(`${t}: ${r.map((c) => `${c.column_name}(${c.data_type})`).join(', ') || '-'}${chk.length ? `\n   CHECK: ${chk.map((c) => c.d).join(' | ').slice(0, 400)}` : ''}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
