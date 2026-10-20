/**
 * PRODUCTION read-only (FIN3-1 Kalkia, Henrik 2026-10-20: "forbered 5–10 konkrete eksempler, ingen aktivering"):
 * hvad ændrer sig for Kalkia-materialer, hvis Kalkia bruger samme avanceforrang som tilbudslinjerne
 * (produkt-/kunderegel → kundeaftalens avance → generel regel → varens avance → standard)?
 * Viser vare (navn/varenr. — ingen persondata), kost, nuværende/foreslået salgspris og DB, og hvilken regel der slår igennem.
 * Kun SELECT (+ den læsende DB-funktion get_effective_margin). Ingen skrivning.
 *   npx tsx scripts/prod-kalkia-pricing-diff.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { calculateSalePrice } from '../src/lib/logic/pricing'

const MATERIALS_DEFAULT = 25 // CALC_DEFAULTS.MARGINS.MATERIALS (src/lib/constants.ts)
const r2 = (n: number) => Math.round(n * 100) / 100
const db = (sale: number, cost: number) => (sale > 0 ? r2(((sale - cost) / sale) * 100) : 0)

withProdReadOnly('prod-kalkia-pricing-diff', async (run, masked) => {
  console.log(`--- Kalkia-prisforrang: nuværende vs foreslået @ prod:${masked} (READ ONLY) ---`)
  const counts = (await run(`SELECT
      (SELECT count(*)::int FROM kalkia_variant_materials WHERE supplier_product_id IS NOT NULL) linked,
      (SELECT count(*)::int FROM supplier_margin_rules WHERE is_active) rules,
      (SELECT count(*)::int FROM customer_supplier_prices WHERE is_active) agreements`)) as Array<{ linked: number; rules: number; agreements: number }>
  console.log(`Kalkia-materialer med leverandørvare: ${counts[0].linked} · aktive avanceregler: ${counts[0].rules} · aktive kundeaftaler: ${counts[0].agreements}`)
  const ruleTypes = await run(`SELECT rule_type, count(*)::int n, min(margin_percentage)::float lo, max(margin_percentage)::float hi FROM supplier_margin_rules WHERE is_active GROUP BY 1 ORDER BY 1`)
  console.log(`Regler pr. type: ${JSON.stringify(ruleTypes)}`)

  const mats = (await run(`SELECT DISTINCT ON (v.id) v.id sp_id, v.supplier_id, v.supplier_sku, v.supplier_name, v.cost_price::float cost,
      v.margin_percentage::float pm, v.default_margin_percentage::float dm, v.category, v.sub_category
    FROM kalkia_variant_materials m JOIN v_supplier_products_with_supplier v ON v.id = m.supplier_product_id
    WHERE v.cost_price > 0 ORDER BY v.id LIMIT 400`)) as Array<{ sp_id: string; supplier_id: string; supplier_sku: string | null; supplier_name: string | null; cost: number; pm: number | null; dm: number | null; category: string | null; sub_category: string | null }>

  type Ex = { vare: string; scenarie: string; kost: number; nu_salg: number; ny_salg: number; nu_db: number; ny_db: number; regel: string }
  const changes: Ex[] = []
  let unchanged = 0
  for (const m of mats) {
    const fallback = m.pm || m.dm || MATERIALS_DEFAULT
    const rules = (await run(`SELECT rule_type, margin_percentage::float mp, fixed_markup::float fm, round_to::float rt
      FROM get_effective_margin('${m.supplier_id}'::uuid, '${m.sp_id}'::uuid, ${m.category ? `'${m.category.replace(/'/g, "''")}'` : 'NULL'}, ${m.sub_category ? `'${m.sub_category.replace(/'/g, "''")}'` : 'NULL'}, NULL) LIMIT 1`)) as Array<{ rule_type: string; mp: number; fm: number | null; rt: number | null }>
    const rule = rules[0]
    const cur = r2(calculateSalePrice(m.cost, fallback))
    // uden kunde: enhver regel går foran varens avance (samme som tilbudslinjer uden kundeaftale)
    const prop = rule ? r2(calculateSalePrice(m.cost, rule.mp, { fixedMarkup: rule.fm ?? 0, roundTo: rule.rt ?? undefined })) : cur
    const vare = `${m.supplier_sku ?? '—'} ${String(m.supplier_name ?? '').slice(0, 40)}`
    if (Math.abs(prop - cur) > 0.004) {
      changes.push({ vare, scenarie: 'uden kundeaftale', kost: r2(m.cost), nu_salg: cur, ny_salg: prop, nu_db: db(cur, m.cost), ny_db: db(prop, m.cost),
        regel: `${rule!.rule_type} ${rule!.mp} %${rule!.fm ? ` + ${rule!.fm} kr` : ''}${rule!.rt ? ` (afrund ${rule!.rt})` : ''} i stedet for varens/standard ${fallback} %` })
    } else unchanged++
  }
  console.log(`\nMaterialer gennemgået: ${mats.length} · uændret: ${unchanged} · ændret: ${changes.length}`)
  const show = changes.sort((a, b) => Math.abs(b.ny_salg - b.nu_salg) / (b.nu_salg || 1) - Math.abs(a.ny_salg - a.nu_salg) / (a.nu_salg || 1)).slice(0, 10)
  for (const e of show) {
    console.log(`  • ${e.vare} [${e.scenarie}] kost ${e.kost} → salg ${e.nu_salg} (DB ${e.nu_db} %) ⇒ ${e.ny_salg} (DB ${e.ny_db} %) · ${e.regel}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
