/**
 * PRODUCTION READ ONLY: medarbejder-/login-integritet (Employee Setup Integrity). Ændrer intet.
 *   npx tsx scripts/prod-employee-integrity.ts
 * Klassificerer aktive logins og medarbejderrækker efter samme regler som src/lib/employees/setup-integrity.ts, og
 * tæller KANDIDATER til en manuel kobling (samme e-mail, uden at koble noget). Ingen personværdier ud — kun rolle,
 * pseudonymt løbenummer, ja/nej og antal.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-employee-integrity', async (run) => {
  const profiles = await run(`SELECT p.id, p.role::text role, coalesce(p.is_active, true) active,
      (SELECT count(*)::int FROM public.employees e WHERE e.profile_id = p.id) emp_all,
      (SELECT count(*)::int FROM public.employees e WHERE e.profile_id = p.id AND e.active) emp_active,
      (SELECT count(*)::int FROM public.employees e WHERE e.profile_id = p.id AND e.active AND e.hourly_rate IS NULL) no_sale,
      (SELECT count(*)::int FROM public.employees e WHERE e.profile_id = p.id AND e.active AND e.cost_rate IS NULL) no_cost,
      (SELECT count(*)::int FROM public.employees e WHERE e.profile_id IS NULL AND lower(e.email) = lower(p.email)) cand_unlinked,
      (SELECT count(*)::int FROM public.employees e WHERE e.profile_id IS NULL AND lower(e.email) = lower(p.email) AND e.active) cand_unlinked_active,
      (SELECT count(*)::int FROM public.employees e WHERE e.profile_id IS NOT NULL AND e.profile_id <> p.id AND lower(e.email) = lower(p.email)) cand_other_profile,
      (SELECT count(*)::int FROM public.time_logs t JOIN public.employees e ON e.id = t.employee_id WHERE e.profile_id = p.id) logs,
      (SELECT count(*)::int FROM public.work_orders w JOIN public.employees e ON e.id = w.assigned_employee_id WHERE e.profile_id = p.id) wos
    FROM public.profiles p ORDER BY p.role, p.created_at`) as Array<Record<string, any>>
  const emps = (await run(`SELECT count(*)::int n, count(*) FILTER (WHERE active)::int act, count(*) FILTER (WHERE profile_id IS NULL)::int unlinked,
      count(*) FILTER (WHERE active AND (hourly_rate IS NULL OR cost_rate IS NULL))::int act_missing_rate,
      count(*) FILTER (WHERE hourly_rate = 0 OR cost_rate = 0)::int zero_rate
    FROM public.employees`))[0]
  const dupProfiles = (await run(`SELECT count(*)::int n FROM (SELECT profile_id FROM public.employees WHERE profile_id IS NOT NULL AND active GROUP BY profile_id HAVING count(*) > 1) d`))[0].n
  const nullCostLogs = (await run(`SELECT count(*)::int n, count(*) FILTER (WHERE cost_amount IS NULL AND end_time IS NOT NULL)::int null_cost, count(*) FILTER (WHERE cost_amount = 0 AND end_time IS NOT NULL AND coalesce(hours, 0) > 0)::int zero_cost FROM public.time_logs`))[0]

  console.log(`INFO  medarbejderrækker: ${emps.n} (aktive ${emps.act}, uden login ${emps.unlinked}, aktive uden time-/kostpris ${emps.act_missing_rate}, med sats = 0: ${emps.zero_rate})`)
  console.log(`INFO  logins med >1 aktiv medarbejderrække: ${dupProfiles}`)
  console.log(`INFO  timer: ${nullCostLogs.n} (afsluttede uden kost: ${nullCostLogs.null_cost}, afsluttede med kost 0 trods timer: ${nullCostLogs.zero_cost})`)
  const seq: Record<string, number> = {}
  for (const p of profiles) {
    seq[p.role] = (seq[p.role] ?? 0) + 1
    const tag = `${p.role}#${seq[p.role]}${p.active ? '' : ' (inaktiv)'}`
    const state = p.emp_active === 0 ? (p.emp_all > 0 ? 'kun INAKTIV medarbejderrække' : 'INGEN medarbejderrække')
      : p.emp_active > 1 ? 'FLERE aktive medarbejderrækker' : 'én aktiv medarbejderrække'
    const rates = p.emp_active ? `timepris ${p.no_sale ? 'MANGLER' : 'ok'} · kostpris ${p.no_cost ? 'MANGLER' : 'ok'}` : '—'
    const cand = p.emp_active ? '' : ` · e-mail-kandidater: uden login ${p.cand_unlinked} (aktive ${p.cand_unlinked_active}), på andet login ${p.cand_other_profile}`
    console.log(`      ${tag.padEnd(22)} ${state.padEnd(32)} ${rates.padEnd(34)} timer ${p.logs} · AO ${p.wos}${cand}`)
  }
}).catch((e) => { console.error('FEJL', maskDbError(e)); process.exit(1) })
