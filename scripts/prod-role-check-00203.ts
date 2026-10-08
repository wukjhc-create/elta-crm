/**
 * PRODUCTION read-only: rolle-tjek for 00203 SOM rigtige prod-brugere (SET LOCAL ROLE authenticated + JWT, READ ONLY,
 * rulles tilbage). offer_snapshots: admin må læse, montør ser intet; INGEN rolle kan skrive. Tilbud/underskrifter læses
 * som før. Kun tjek og antal.   npx tsx scripts/prod-role-check-00203.ts
 */
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'

withProdReadOnlyRoleProbe('prod-role-check-00203', async (probe, run) => {
  const users = await run(`SELECT p.role, (array_agg(p.id ORDER BY p.created_at))[1]::text AS id FROM profiles p
    WHERE p.is_active AND p.role IN ('admin', 'montør', 'salg', 'serviceleder', 'bogholderi') GROUP BY p.role ORDER BY p.role`)
  const res: Array<[string, boolean, string]> = []
  const READERS = new Set(['admin', 'serviceleder', 'salg', 'bogholderi'])
  for (const u of users as Array<{ role: string; id: string }>) {
    const sel = await probe(u.id, `SELECT count(*)::int n FROM public.offer_snapshots`)
    res.push([`${u.role}: offer_snapshots læs ${READERS.has(u.role) ? 'tilladt' : '(0 rækker)'}`, sel.ok, sel.ok ? `${sel.rows[0]?.n} rækker` : sel.code])
    const ins = await probe(u.id, `INSERT INTO public.offer_snapshots (offer_id, revision_number, snapshot) SELECT id, 99, '{}'::jsonb FROM public.offers LIMIT 1`)
    res.push([`${u.role}: offer_snapshots skrivning nægtet`, !ins.ok, ins.ok ? 'SKREV' : ins.code])
    const off = await probe(u.id, `SELECT count(*)::int n, count(revision_number)::int r FROM public.offers`)
    res.push([`${u.role}: tilbud læsbare som før (inkl. revision_number)`, off.ok, off.ok ? JSON.stringify(off.rows[0]) : off.code])
  }
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}  (${note})`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} rolle-tjek som forventet (roller: ${(users as Array<{ role: string }>).map((u) => u.role).join(', ')})`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
