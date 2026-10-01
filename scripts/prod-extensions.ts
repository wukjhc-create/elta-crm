/** PRODUCTION read-only: installerede + tilgængelige udvidelser (navne) og eksisterende indeks på en tabel. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const table = process.argv[2] || 'supplier_products'
withProdReadOnly('prod-extensions', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'installeret', (SELECT json_agg(extname || '@' || extnamespace::regnamespace::text) FROM pg_extension),
    'pg_trgm_tilgaengelig', (SELECT count(*)::int FROM pg_available_extensions WHERE name = 'pg_trgm'),
    'indeks', (SELECT json_agg(indexname || ': ' || indexdef) FROM pg_indexes WHERE schemaname = 'public' AND tablename = '${table.replace(/'/g, '')}')
  ) r`))[0].r, null, 1))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
