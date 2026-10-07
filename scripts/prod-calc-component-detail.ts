/**
 * PRODUCTION read-only: ALLE beskrivende felter for udvalgte calc_components (fx tavler) — til entydig mapping.
 *   npx tsx scripts/prod-calc-component-detail.ts TAVLE-LILLE,TAVLE-S,TAVLE-NY,TAVLE-L
 * Kun katalogdata (ingen personværdier).
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const codes = String(process.argv[2] || '').split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9.\-]+$/.test(s))
if (!codes.length) { console.error('brug: <KODE,KODE,…>'); process.exit(2) }

withProdReadOnly('prod-calc-component-detail', async (run) => {
  const rows = await run(`
    SELECT c.code, c.name, c.description, c.notes, c.offer_description, c.installation_notes,
           c.default_cost_price::float AS kost, c.default_sale_price::float AS salg, c.base_time_minutes AS min,
           c.first_unit_time_minutes, c.subsequent_unit_time_minutes, c.setup_time_minutes, c.cleanup_time_minutes,
           c.min_quantity, c.max_quantity, c.optimal_batch_size, c.time_profile, c.labor_type,
           c.price_includes_material, c.labor_only, c.difficulty_level, c.complexity_factor::float AS cf,
           c.offer_obs_points, c.dependencies, c.requires_components, c.suggested_with, c.is_active,
           c.created_at::date::text AS oprettet, cat.name AS kategori
      FROM calc_components c LEFT JOIN calc_component_categories cat ON cat.id = c.category_id
     WHERE c.code = ANY(ARRAY[${codes.map((c) => `'${c}'`).join(',')}])
     ORDER BY c.default_sale_price`)
  for (const r of rows) {
    console.log(`\n=== ${r.code} — ${r.name} [${r.kategori ?? '-'}] (aktiv=${r.is_active}, oprettet ${r.oprettet})`)
    for (const [k, v] of Object.entries(r)) {
      if (['code', 'name', 'kategori', 'is_active', 'oprettet'].includes(k)) continue
      const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : v
      if (val === null || val === '' || val === '[]') continue
      console.log(`  ${k.padEnd(30)} ${val}`)
    }
  }
  // Sammenhæng til kalkia-varianter/materialer, hvis der findes en kobling på koden (kun antal)
  const [kn] = await run(`SELECT count(*)::int n FROM kalkia_nodes WHERE code = ANY(ARRAY[${codes.map((c) => `'${c}'`).join(',')}])`).catch(() => [{ n: -1 }])
  console.log(`\nkalkia_nodes med samme kode: ${kn.n}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
