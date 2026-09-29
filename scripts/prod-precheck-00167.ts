/**
 * PRODUCTION read-only pre-check for 00167 (suppliers.vat_number). Kun struktur + antal.
 *   npx tsx scripts/prod-precheck-00167.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-precheck-00167', async (run, masked) => {
  console.log(`--- 00167 pre-check @ prod:${masked} ---`)
  const cols = (await run(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers' ORDER BY ordinal_position`)) as any[]
  console.log('  suppliers-kolonner:', cols.map((c) => c.column_name).join(', '))
  console.log('  vat_number findes:', cols.some((c) => c.column_name === 'vat_number'))
  console.log('  rækker:', JSON.stringify((await run(`SELECT count(*)::int n, count(*) FILTER (WHERE is_active)::int aktive FROM suppliers`))[0]))
  console.log('  policies:', JSON.stringify(await run(`SELECT policyname, cmd, roles::text, qual IS NOT NULL has_using FROM pg_policies WHERE schemaname='public' AND tablename='suppliers' ORDER BY 1`)))
  console.log('  policy-udtryk:', JSON.stringify(await run(`SELECT policyname, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='suppliers' ORDER BY 1`)))
  console.log('  tabel-grants:', JSON.stringify(await run(`SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) p FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='suppliers' AND grantee IN ('anon','authenticated') GROUP BY 1`)))
  console.log('  kolonne-grants (authenticated, udvalg):', JSON.stringify((await run(`SELECT count(*)::int n FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name='suppliers' AND grantee='authenticated'`))[0]))
  console.log('  triggere:', JSON.stringify(await run(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.suppliers'::regclass AND NOT tgisinternal`)))
  console.log('  CVR i fakturaer (supplier_vat_number):', JSON.stringify((await run(`SELECT count(*) FILTER (WHERE supplier_vat_number IS NOT NULL)::int med_cvr,
      count(DISTINCT supplier_vat_number)::int distinkte, count(DISTINCT supplier_id) FILTER (WHERE supplier_vat_number IS NOT NULL)::int leverandoerer FROM incoming_invoices`))[0]))
  console.log('  samme CVR på flere leverandører (fra fakturaer):', JSON.stringify((await run(`SELECT count(*)::int n FROM (SELECT supplier_vat_number FROM incoming_invoices
      WHERE supplier_vat_number IS NOT NULL AND supplier_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT supplier_id) > 1) x`))[0]))
  console.log('  leverandører med flere CVR (fra fakturaer):', JSON.stringify((await run(`SELECT count(*)::int n FROM (SELECT supplier_id FROM incoming_invoices
      WHERE supplier_vat_number IS NOT NULL AND supplier_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT supplier_vat_number) > 1) x`))[0]))
  console.log('  funktion normalize_vat_number findes:', JSON.stringify(await run(`SELECT count(*)::int n FROM pg_proc WHERE proname='normalize_vat_number'`)))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
