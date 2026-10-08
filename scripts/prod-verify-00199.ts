/**
 * PRODUCTION read-only: pre/post-tjek for 00199 (customers.created_by → ON DELETE SET NULL). Kun metadata + antal.
 *   npx tsx scripts/prod-verify-00199.ts pre    — forventer CASCADE + NOT NULL (før migrationen)
 *   npx tsx scripts/prod-verify-00199.ts post   — forventer SET NULL + nullable, samme antal kunder som før
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'

withProdReadOnly(`prod-verify-00199-${mode}`, async (run, masked) => {
  const [fk] = (await run(`SELECT CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' END on_delete
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'public.customers'::regclass AND c.contype = 'f' AND a.attname = 'created_by'`)) as Array<{ on_delete: string }>
  const [col] = (await run(`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'created_by'`)) as Array<{ is_nullable: string }>
  const [cnt] = (await run(`SELECT count(*)::int customers, count(*) FILTER (WHERE created_by IS NULL)::int without_creator FROM customers`)) as Array<{ customers: number; without_creator: number }>
  const cascades = (await run(`SELECT c.conrelid::regclass::text tbl FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass) AND c.confdeltype = 'c'
      AND c.conrelid::regclass::text NOT LIKE 'auth.%' AND c.conrelid::regclass::text NOT IN ('profiles', 'assistant_links', 'personal_reminders')`)) as Array<{ tbl: string }>
  const want = mode === 'pre' ? { on_delete: 'CASCADE', is_nullable: 'NO' } : { on_delete: 'SET NULL', is_nullable: 'YES' }
  const checks: Array<[string, boolean, string]> = [
    [`FK on delete = ${want.on_delete}`, fk?.on_delete === want.on_delete, fk?.on_delete ?? '-'],
    [`created_by nullable = ${want.is_nullable}`, col?.is_nullable === want.is_nullable, col?.is_nullable ?? '-'],
    [mode === 'pre' ? 'kun customers kaskaderer (forretningsdata)' : 'ingen forretningstabel kaskaderer fra brugere', mode === 'pre' ? cascades.every((c) => c.tbl === 'customers') : cascades.length === 0, cascades.map((c) => c.tbl).join(',') || '-'],
    ['kunder uden opretter', cnt.without_creator === 0, String(cnt.without_creator)],
  ]
  console.log(`--- 00199 ${mode} @ prod:${masked} — kunder i alt: ${cnt.customers} ---`)
  for (const [label, ok, note] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} (${note})`)
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
