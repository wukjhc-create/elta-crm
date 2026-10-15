/**
 * PRODUCTION read-only pre/post for 00228: employee_absences (tabel, RLS, politikker, ACL — anon uden adgang, ingen
 * fritekstkolonne). Kun metadata.   npx tsx scripts/prod-check-00228.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-check-00228', async (run, masked) => {
  const t = (await run(`SELECT c.relrowsecurity rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='employee_absences'`)) as Array<{ rls: boolean }>
  if (!t.length) { console.log(`prod:${masked} employee_absences FINDES IKKE`); return }
  const cols = (await run(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_absences' ORDER BY ordinal_position`)) as Array<{ column_name: string }>
  const pol = (await run(`SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='employee_absences' ORDER BY 1`)) as Array<{ policyname: string; cmd: string }>
  const acl = (await run(`SELECT has_table_privilege('anon','public.employee_absences','SELECT') anon_sel, has_table_privilege('authenticated','public.employee_absences','SELECT') auth_sel`)) as Array<{ anon_sel: boolean; auth_sel: boolean }>
  const n = (await run(`SELECT count(*)::int n FROM public.employee_absences`)) as Array<{ n: number }>
  console.log(`prod:${masked} rls=${t[0].rls} kolonner=[${cols.map((c) => c.column_name).join(',')}] politikker=[${pol.map((p) => `${p.policyname}:${p.cmd}`).join(', ')}] anon_select=${acl[0].anon_sel} authenticated_select=${acl[0].auth_sel} rækker=${n[0].n}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
