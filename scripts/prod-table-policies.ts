/**
 * PRODUCTION read-only: policies, RLS-status, grants og kolonner for givne tabeller (struktur, ingen data).
 *   npx tsx scripts/prod-table-policies.ts tabel [tabel ...]
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const tables = process.argv.slice(2).filter((t) => /^[a-z_0-9]+$/.test(t))
withProdReadOnly('prod-table-policies', async (run, masked) => {
  console.log(`--- policies @ prod:${masked} ---`)
  for (const t of tables) {
    const meta = (await run(`SELECT c.relrowsecurity rls, c.relforcerowsecurity force FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='${t}'`))[0]
    const n = (await run(`SELECT count(*)::int n FROM public.${t}`))[0].n
    console.log(`\n=== ${t} (rls=${meta?.rls} rækker=${n})`)
    for (const p of (await run(`SELECT policyname, cmd, roles::text roles, coalesce(qual,'') q, coalesce(with_check,'') w FROM pg_policies WHERE schemaname='public' AND tablename='${t}' ORDER BY cmd, policyname`)) as any[])
      console.log(`  ${p.cmd.padEnd(6)} ${p.policyname} ${p.roles} USING(${p.q.replace(/\s+/g, ' ').slice(0, 140)})${p.w ? ` CHECK(${p.w.replace(/\s+/g, ' ').slice(0, 140)})` : ''}`)
    console.log('  grants:', JSON.stringify(await run(`SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) p FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='${t}' AND grantee IN ('anon','authenticated') GROUP BY 1`)))
    const colGrants = (await run(`SELECT count(*)::int n FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='${t}' AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE')`))[0].n
    console.log(`  kolonne-grants (authenticated ins/upd): ${colGrants}`)
    console.log('  kolonner:', ((await run(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`)) as any[]).map((c) => c.column_name).join(', '))
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
