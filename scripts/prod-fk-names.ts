/** PRODUCTION read-only: FK-navne mellem to tabeller (til entydige PostgREST-embeds). Brug: npx tsx scripts/prod-fk-names.ts tabelA tabelB */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const [a, b] = process.argv.slice(2).filter((n) => /^[a-z_][a-z0-9_]*$/.test(n))
withProdReadOnly('prod-fk-names', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_agg(json_build_object('fk', conname, 'fra', conrelid::regclass::text, 'til', confrelid::regclass::text)) s
    FROM pg_constraint WHERE contype = 'f' AND (
      (conrelid = 'public.${a}'::regclass AND confrelid = 'public.${b}'::regclass) OR (conrelid = 'public.${b}'::regclass AND confrelid = 'public.${a}'::regclass))`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
