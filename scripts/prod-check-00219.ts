/**
 * PRODUCTION-tjek for 00219 (kalkulationsrækkers tilbudstilstand, godkendt 2026-10-14). Kun antal/tjeksummer.
 *   npx tsx scripts/prod-check-00219.ts [pre|post]
 * pre/post: rækker pr. show_on_offer, kalkulationstotaler (tjeksum) og ikke-kladde-tilbud (tjeksum over beløb) — skal
 *           være uændrede af migrationen. post: backfill (show_on_offer=false → hidden_included) + flow i ROLLBACK:
 *           visible + hidden_included tæller, excluded tæller ikke, DB efter avance/rabat.
 */
import { Client } from 'pg'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'pre' ? 'pre' : 'post'

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-check-00219', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  try {
    await client.query('BEGIN')
    const hasCol = (await client.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='calculation_rows' AND column_name='offer_mode'`)).rows[0].n === 1
    const rows = (await client.query(`SELECT count(*)::int total, count(*) FILTER (WHERE show_on_offer = false)::int hidden FROM calculation_rows`)).rows[0] as { total: number; hidden: number }
    const calcSum = (await client.query(`SELECT count(*)::int n, md5(coalesce(string_agg(id::text || ':' || coalesce(subtotal,0) || ':' || coalesce(final_amount,0), '|' ORDER BY id), '')) s FROM calculations`)).rows[0] as { n: number; s: string }
    const offerSum = (await client.query(`SELECT count(*)::int n, md5(coalesce(string_agg(id::text || ':' || coalesce(total_amount,0) || ':' || coalesce(final_amount,0) || ':' || coalesce(tax_amount,0), '|' ORDER BY id), '')) s FROM offers WHERE status <> 'draft'`)).rows[0] as { n: number; s: string }
    console.log(`kolonne=${hasCol ? 'findes' : 'mangler'} · rækker=${rows.total} (skjulte=${rows.hidden}) · kalkulationer=${calcSum.n} tjeksum=${calcSum.s.slice(0, 8)} · ikke-kladde-tilbud=${offerSum.n} tjeksum=${offerSum.s.slice(0, 8)}`)
    if (mode === 'pre') {
      res.push(['kolonnen findes endnu ikke', !hasCol, ''])
    } else {
      res.push(['kolonnen findes', hasCol, ''])
      const m = (await client.query(`SELECT count(*) FILTER (WHERE offer_mode = 'hidden_included')::int hi,
          count(*) FILTER (WHERE offer_mode = 'visible')::int vis, count(*) FILTER (WHERE offer_mode = 'excluded')::int exc,
          count(*) FILTER (WHERE show_on_offer = false AND offer_mode <> 'hidden_included')::int mismatch FROM calculation_rows`)).rows[0] as { hi: number; vis: number; exc: number; mismatch: number }
      res.push(['eksisterende skjulte rækker → hidden_included', m.hi === rows.hidden && m.mismatch === 0 && m.exc === 0, `hidden_included=${m.hi}/${rows.hidden} visible=${m.vis}`])
      // flow (rulles tilbage)
      const owner = (await client.query(`SELECT id FROM profiles WHERE is_active AND role = 'admin' ORDER BY created_at LIMIT 1`)).rows[0].id as string
      const calc = (await client.query(`INSERT INTO calculations (name, created_by, margin_percentage, discount_percentage, tax_percentage)
        VALUES ('[CHECK-00219]', $1, 20, 10, 25) RETURNING id`, [owner])).rows[0].id as string
      const ins = (d: string, total: number, cost: number, om: string) => client.query(`INSERT INTO calculation_rows
        (calculation_id, row_type, position, description, quantity, unit, cost_price, sale_price, total, offer_mode, show_on_offer)
        VALUES ($1, 'manual', 0, $2, 1, 'stk', $3, $4, $4, $5, $6)`, [calc, d, cost, total, om, om === 'visible'])
      await ins('synlig', 10000, 6000, 'visible'); await ins('skjult', 2000, 1200, 'hidden_included'); await ins('udeladt', 500, 300, 'excluded')
      const c = (await client.query(`SELECT subtotal, final_amount, gross_profit FROM calculations WHERE id = $1`, [calc])).rows[0] as { subtotal: string; final_amount: string; gross_profit: string }
      res.push(['visible + hidden_included tæller, excluded ikke (subtotal 12.000)', Number(c.subtotal) === 12000, c.subtotal])
      res.push(['total = 12.000 × 1,2 × 0,9 × 1,25 = 16.200', Number(c.final_amount) === 16200, c.final_amount])
      res.push(['DB efter avance/rabat (12.960 − 7.200 = 5.760)', Number(c.gross_profit) === 5760, c.gross_profit])
    }
    res.push([`${mode}: tjeksummer noteret (sammenlign pre/post)`, true, `kalk=${calcSum.s.slice(0, 8)} tilbud=${offerSum.s.slice(0, 8)}`])
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}${note ? `  (${note})` : ''}`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r) (${mode}) — alt rullet tilbage` : `✅ ${res.length} tjek som forventet (${mode}) — alt rullet tilbage`)
  process.exitCode = bad ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
