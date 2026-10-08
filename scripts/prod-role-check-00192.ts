/**
 * PRODUCTION read-only: rolle-tjek efter 00192 — SOM rigtige prod-brugere (admin, montør; salg/serviceleder/
 * bogholderi findes ikke i prod), præcis som PostgREST: SET LOCAL ROLE authenticated + JWT-claims, i en READ ONLY-
 * transaktion der rulles tilbage. Printer kun rolle, tjek og resultat (ingen bruger-id'er eller data).
 *   npx tsx scripts/prod-role-check-00192.ts
 */
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'

withProdReadOnlyRoleProbe('prod-role-check-00192', async (probe, run) => {
  const users = await run(`SELECT p.role, (array_agg(p.id ORDER BY p.created_at))[1]::text AS id FROM profiles p
    WHERE p.is_active AND p.role IN ('admin', 'montør', 'salg', 'serviceleder', 'bogholderi') GROUP BY p.role ORDER BY p.role`)
  const res: Array<[string, boolean, string]> = []
  const denied = (r: Awaited<ReturnType<typeof probe>>) => !r.ok && r.code === '42501'
  for (const u of users as Array<{ role: string; id: string }>) {
    const tag = u.role
    for (const [t, c] of [['offer_line_items', 'cost_price'], ['offer_line_items', 'supplier_cost_price_at_creation'], ['offer_line_items', 'margin_percentage'],
      ['supplier_products', 'cost_price'], ['supplier_products', 'margin_percentage'], ['time_logs', 'cost_amount'], ['time_logs', 'cost_rate_snapshot']]) {
      const r = await probe(u.id, `SELECT ${c} FROM public.${t} LIMIT 1`)
      res.push([`${tag}: ${t}.${c} nægtet`, denied(r), r.ok ? 'LÆSBAR' : r.code])
    }
    for (const [t, c] of [['offer_line_items', 'unit_price'], ['supplier_products', 'list_price'], ['time_logs', 'hours']]) {
      const r = await probe(u.id, `SELECT count(${c})::int n FROM public.${t}`)
      res.push([`${tag}: ${t}.${c} læsbar`, r.ok, r.ok ? `${r.rows[0]?.n} rækker` : r.code])
    }
    const wop = await probe(u.id, `SELECT count(*)::int n FROM public.work_order_profit`)
    res.push([`${tag}: work_order_profit forespørgsel virker`, wop.ok, wop.ok ? `${wop.rows[0]?.n} rækker (prod-tabellen er tom)` : wop.code])
    const fn = await probe(u.id, `SELECT public.calculate_work_order_profit('00000000-0000-0000-0000-000000000000'::uuid)`)
    res.push([`${tag}: calculate_work_order_profit nægtet`, denied(fn), fn.ok ? 'KALDBAR' : fn.code])
    const pe = await probe(u.id, `SELECT has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE') e, has_column_privilege('authenticated', 'public.profiles', 'avatar_storage_path', 'UPDATE') a, has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE') n`)
    const pr = pe.ok ? pe.rows[0] : null
    res.push([`${tag}: profil-e-mail/avatar ikke skrivbar, navn skrivbar`, !!pr && pr.e === false && pr.a === false && pr.n === true, pr ? JSON.stringify(pr) : (pe as { code: string }).code])
    // RLS-scope uændret: rækker i de vigtigste tabeller pr. rolle (kun antal)
    const scope = await probe(u.id, `SELECT (SELECT count(*) FROM public.offers)::int o, (SELECT count(*) FROM public.customers)::int c, (SELECT count(*) FROM public.service_cases)::int s`)
    res.push([`${tag}: RLS-scope (tilbud/kunder/sager) læsbar`, scope.ok, scope.ok ? JSON.stringify(scope.rows[0]) : scope.code])
  }
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}  (${note})`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} rolle-tjek som forventet (roller: ${(users as Array<{ role: string }>).map((u) => u.role).join(', ')})`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
