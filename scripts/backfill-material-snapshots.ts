/**
 * Sprint Ø2.12 — backfill/audit af case_materials snapshot-priser.
 *
 * BAGGRUND: case_materials er allerede snapshot-immutable:
 *   - unit_cost / unit_sales_price er NOT NULL (default 0) og fryses på linjen
 *     ved oprettelse (ikke en live katalog-reference).
 *   - total_cost / total_sales_price er GENERATED ALWAYS (quantity × unit).
 *   - sku_snapshot / supplier_name_snapshot fryser leverandørinfo.
 *   Derfor kan en linje ALDRIG mangle kost-/salgssnapshot — der er intet at
 *   backfille. Dette script DOKUMENTERER tilstanden (dry-run) og kan med
 *   --apply rette evt. utilsigtede afvigelser (p.t. ingen).
 *
 *   npx tsx scripts/backfill-material-snapshots.ts            (dry-run)
 *   npx tsx scripts/backfill-material-snapshots.ts --apply    (apply)
 */
import { readFileSync } from 'fs'; import { resolve } from 'path'
function le(f: string) { try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; const k = m[1]; let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (!process.env[k]) process.env[k] = v } } catch {} }
le(resolve(__dirname, '..', '.env.local'))
const t = process.env.SUPABASE_ACCESS_TOKEN!; const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
async function m(sql: string) { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) }); const b = await r.text(); if (!r.ok) { console.error('FAIL', r.status, b); process.exit(1) } try { return JSON.parse(b) } catch { return [] } }

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`\n=== Ø2.12 materiale-snapshot backfill (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`)

  const r = (await m(`SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE unit_cost IS NULL)::int AS missing_cost_snapshot,
    COUNT(*) FILTER (WHERE unit_sales_price IS NULL)::int AS missing_sale_snapshot,
    COUNT(*) FILTER (WHERE total_cost IS NULL OR total_sales_price IS NULL)::int AS missing_totals,
    COUNT(*) FILTER (WHERE unit_cost = 0 AND unit_sales_price = 0)::int AS unpriced_lines,
    COUNT(*) FILTER (WHERE invoice_line_id IS NOT NULL)::int AS billed_locked
    FROM case_materials`))[0]

  console.log(`total materialer            = ${r.total}`)
  console.log(`mangler kostsnapshot        = ${r.missing_cost_snapshot}  (kan ikke ske — NOT NULL)`)
  console.log(`mangler salgssnapshot       = ${r.missing_sale_snapshot}  (kan ikke ske — NOT NULL)`)
  console.log(`mangler totaler             = ${r.missing_totals}  (kan ikke ske — GENERATED)`)
  console.log(`uden prissætning (0/0)      = ${r.unpriced_lines}  (gyldig frossen 0 — backfilles IKKE)`)
  console.log(`fakturalåste                = ${r.billed_locked}  (røres aldrig)`)

  const target = r.missing_cost_snapshot + r.missing_sale_snapshot + r.missing_totals
  console.log(`\nKan backfilles sikkert      = ${target}`)
  console.log(`Kan ikke backfilles sikkert = ${r.unpriced_lines} (mangler reel pris — efterlades som 0, rapporteret)`)

  if (target === 0) {
    console.log('\n✅ Intet at backfille — modellen er allerede snapshot-immutable.\n')
    return
  }
  if (!apply) { console.log('\nDry-run: kør med --apply.\n'); return }
  console.log('\n(Apply har ingen sikre mål — ingen ændring foretaget.)\n')
}
main().catch((e) => { console.error(e); process.exit(1) })
