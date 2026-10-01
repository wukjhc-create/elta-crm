/** PRODUCTION read-only: 00183 (N4) — trigram-indeks på supplier_products. pre|post. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const phase = process.argv[2]
if (phase !== 'pre' && phase !== 'post') { console.error('brug: pre|post'); process.exit(2) }
withProdReadOnly(`prod-verify-00183 ${phase}`, async (run) => {
  const r = (await run(`SELECT json_build_object(
    'trgm', (SELECT count(*)::int FROM pg_extension WHERE extname = 'pg_trgm'),
    'indeks', (SELECT json_agg(json_build_object('navn', c.relname, 'gyldig', i.indisvalid)) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
               WHERE c.relname IN ('idx_supplier_products_sku_trgm','idx_supplier_products_name_trgm','idx_supplier_products_ean_trgm'))
  ) r`))[0].r as { trgm: number; indeks: Array<{ navn: string; gyldig: boolean }> | null }
  const idx = r.indeks ?? []
  const ok = phase === 'pre' ? idx.length === 0 : r.trgm === 1 && idx.length === 3 && idx.every((x) => x.gyldig)
  console.log(JSON.stringify({ phase, pg_trgm: r.trgm, indeks: idx }))
  console.log(ok ? `✅ ${phase}: som forventet` : `❌ ${phase}: afviger`)
  if (!ok) process.exitCode = 1
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
