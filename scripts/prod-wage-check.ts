/** PRODUCTION read-only: løndata pr. rolle (som rigtige brugere via SET LOCAL ROLE + claims, READ ONLY). Kun antal. */
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'
withProdReadOnlyRoleProbe('prod-wage-check', async (probe, run) => {
  const users = await run(`SELECT p.role, (array_agg(p.id ORDER BY p.created_at))[1]::text AS id FROM profiles p WHERE p.is_active GROUP BY p.role ORDER BY p.role`)
  for (const u of users as Array<{ role: string; id: string }>) {
    const e = await probe(u.id, `SELECT count(*)::int n, count(hourly_rate)::int timeloen, count(cost_rate)::int kostsats FROM public.employees`)
    const c = await probe(u.id, `SELECT count(*)::int n FROM public.employee_compensation`)
    const own = await probe(u.id, `SELECT count(*)::int n FROM public.employee_compensation ec JOIN public.employees em ON em.id = ec.employee_id WHERE em.profile_id = '${u.id}'`)
    console.log(`${u.role}: employees ${e.ok ? JSON.stringify(e.rows[0]) : e.code} · employee_compensation ${c.ok ? c.rows[0].n : c.code} (egne ${own.ok ? own.rows[0].n : own.code})`)
  }
  const [t] = await run(`SELECT (SELECT count(*) FROM employees)::int employees, (SELECT count(*) FROM employee_compensation)::int compensation`)
  console.log(`i alt: ${JSON.stringify(t)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
