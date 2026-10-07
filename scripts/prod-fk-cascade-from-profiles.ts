/**
 * PRODUCTION read-only: kunde-/leads-review 2026-10-07 — hvilke FK'er til profiles/auth.users har ON DELETE CASCADE, og
 * hvor mange rækker ville forsvinde, hvis den enkelte bruger (anonymiseret) blev slettet? Kun antal.
 *   npx tsx scripts/prod-fk-cascade-from-profiles.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-fk-cascade-from-profiles', async (run, masked) => {
  const fks = (await run(`SELECT c.conrelid::regclass::text tbl, a.attname col, c.confrelid::regclass::text ref,
      CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' ELSE c.confdeltype::text END on_delete
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass) AND c.confdeltype = 'c'
    ORDER BY 1, 2`)) as Array<{ tbl: string; col: string; ref: string; on_delete: string }>
  console.log(`--- ON DELETE CASCADE fra profiles/auth.users @ prod:${masked} (${fks.length}) ---`)
  for (const f of fks) console.log(`${f.tbl}.${f.col} → ${f.ref}`)
  const watched = fks.filter((f) => ['customers', 'leads', 'offers', 'projects', 'service_cases', 'invoices'].includes(f.tbl.replace('public.', '')))
  for (const f of watched) {
    const r = (await run(`SELECT count(*)::int total, count(DISTINCT ${f.col})::int users, max(n)::int max_per_user
      FROM (SELECT ${f.col}, count(*) OVER (PARTITION BY ${f.col}) n FROM ${f.tbl}) x`)) as Array<{ total: number; users: number; max_per_user: number }>
    console.log(`  ${f.tbl}.${f.col}: ${r[0].total} rækker fordelt på ${r[0].users} brugere; største enkeltbruger = ${r[0].max_per_user} rækker`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
