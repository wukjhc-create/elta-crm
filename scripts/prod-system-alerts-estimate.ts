/**
 * PRODUCTION read-only: hvad den natlige intelligence-check ville lægge i klokken ved FØRSTE kørsel efter 00194.
 * Spejler reglerne i src/app/api/cron/intelligence-check/route.ts (tærskler fra MONITORING_CONFIG). Kun antal + titler
 * på leverandører/tilbudsnumre (ingen personværdier).
 *   npx tsx scripts/prod-system-alerts-estimate.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { MONITORING_CONFIG as M } from '../src/lib/constants'

withProdReadOnly('prod-system-alerts-estimate', async (run) => {
  const [t] = await run(`SELECT to_regclass('public.system_alerts') IS NOT NULL AS findes, to_regclass('public.price_alert_rules') IS NOT NULL AS regler`)
  console.log(`system_alerts findes: ${t.findes} · price_alert_rules findes: ${t.regler} (sektion 1 'prisændringer' springes over uden regler)`)

  const margin = await run(`
    SELECT o.offer_number, sum(coalesce(li.cost_price, 0))::float AS cost, sum(li.total)::float AS sale
      FROM offers o JOIN offer_line_items li ON li.offer_id = o.id
     WHERE o.status IN ('draft', 'sent')
     GROUP BY o.id, o.offer_number`)
  const low = margin.filter((r) => r.cost > 0 && r.sale > 0 && ((r.sale - r.cost) / r.sale) * 100 < M.MARGIN_WARNING_THRESHOLD)
  const crit = low.filter((r) => ((r.sale - r.cost) / r.sale) * 100 < M.MARGIN_CRITICAL_THRESHOLD)
  console.log(`margin_below: ${low.length} tilbud under ${M.MARGIN_WARNING_THRESHOLD}% (heraf ${crit.length} kritiske under ${M.MARGIN_CRITICAL_THRESHOLD}%) af ${margin.length} kladde/sendte`)

  const [pc] = await run(`
    SELECT count(DISTINCT o.id)::int AS tilbud, count(*)::int AS linjer
      FROM offers o JOIN offer_line_items li ON li.offer_id = o.id JOIN supplier_products sp ON sp.id = li.supplier_product_id
     WHERE o.status IN ('draft', 'sent') AND coalesce(li.cost_price, 0) > 0
       AND abs((sp.cost_price - li.cost_price) / li.cost_price * 100) > ${M.PRICE_CHANGE_OFFER_THRESHOLD}`)
  console.log(`prisændring påvirker tilbud: ${pc.linjer} linjer på ${pc.tilbud} tilbud (> ${M.PRICE_CHANGE_OFFER_THRESHOLD}%)`)

  const sup = await run(`
    SELECT s.name,
           l.completed_at IS NOT NULL OR l.status IS NOT NULL AS har_sync,
           extract(epoch FROM (now() - l.completed_at)) / 86400 AS dage,
           l.status,
           (SELECT count(*) FROM supplier_products p WHERE p.supplier_id = s.id)::int AS produkter
      FROM suppliers s LEFT JOIN (SELECT DISTINCT ON (supplier_id) supplier_id, completed_at, status FROM supplier_sync_logs ORDER BY supplier_id, completed_at DESC NULLS LAST) l ON l.supplier_id = s.id
     WHERE s.is_active`)
  for (const s of sup) {
    const msgs: string[] = []
    if (s.har_sync) {
      if (Number(s.dage) > M.SYNC_STALE_WARNING_DAYS) msgs.push(`sync forældet ${Math.round(Number(s.dage))} d (${Number(s.dage) > M.SYNC_STALE_CRITICAL_DAYS ? 'kritisk' : 'advarsel'})`)
      if (s.status === 'failed') msgs.push('sidste sync fejlet (kritisk)')
    } else if (s.produkter === 0) msgs.push('ingen produkter (info)')
    console.log(`leverandør ${s.name}: ${msgs.length ? msgs.join(', ') : 'ingen advarsel'}`)
  }

  const [st] = await run(`SELECT count(*)::int n FROM supplier_products WHERE is_available AND last_synced_at < now() - interval '${M.STALE_PRODUCT_DAYS} days'`)
  console.log(`forældede produktpriser: ${st.n} (advarsel hvis > ${M.STALE_PRODUCT_MIN_COUNT})`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
