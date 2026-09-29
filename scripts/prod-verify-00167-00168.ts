/**
 * PRODUCTION read-only pre-/post-check for 00167 (suppliers.vat_number) og 00168 (suppliers admin-only skrivning).
 *   npx tsx scripts/prod-verify-00167-00168.ts pre|post-00167|post-00168
 * Skrive-adfaerd kan ikke proeves i en read-only transaktion; den er bevist dynamisk paa staging
 * (`npm run harness:supplier-vat` V7/V8). Her verificeres struktur, policies, grants og DB/TS-normaliserings-paritet.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { normalizeVatNumber } from '../src/lib/invoice-control/vat'

const mode = ['pre', 'post-00167', 'post-00168'].includes(process.argv[2]) ? process.argv[2] : 'pre'
const problems: string[] = []
const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '❌'} ${label}`); if (!cond) problems.push(label) }

withProdReadOnly('prod-verify-00167-00168', async (run, masked) => {
  console.log(`--- 00167/00168 ${mode} @ prod:${masked} ---`)
  const col = (await run(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers' AND column_name='vat_number'`))[0].n
  const pols = (await run(`SELECT policyname, cmd, coalesce(qual,'') q, coalesce(with_check,'') w FROM pg_policies WHERE schemaname='public' AND tablename='suppliers' ORDER BY 1`)) as any[]
  const openWrite = pols.filter((p) => p.cmd !== 'SELECT' && (p.q.trim() === 'true' || p.w.trim() === 'true'))
  const anonGrants = (await run(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='suppliers' AND grantee='anon'`))[0].n
  const rows = (await run(`SELECT count(*)::int n FROM suppliers`))[0].n
  console.log(`  leverandører: ${rows}`)

  if (mode === 'pre') {
    expect(col === 0, 'før 00167: vat_number findes ikke (forventet)')
    expect(openWrite.length === 3, `før 00168: 3 åbne skrive-policies (forventet): ${openWrite.map((p) => p.policyname).join(', ')}`)
    expect(anonGrants > 0, `før 00168: anon har grants (forventet): ${anonGrants}`)
  }
  if (mode === 'post-00167' || mode === 'post-00168') {
    expect(col === 1, 'vat_number findes')
    const chk = (await run(`SELECT count(*)::int n FROM pg_constraint WHERE conrelid='public.suppliers'::regclass AND conname='suppliers_vat_number_format'`))[0].n
    const trg = (await run(`SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.suppliers'::regclass AND tgname='trg_suppliers_normalize_vat' AND tgenabled <> 'D'`))[0].n
    const idx = (await run(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='suppliers' AND indexdef ILIKE '%vat_number%'`)) as any[]
    const fns = (await run(`SELECT proname, coalesce(proconfig::text,'') cfg FROM pg_proc WHERE proname IN ('normalize_vat_number','suppliers_normalize_vat')`)) as any[]
    expect(chk === 1 && trg === 1, 'CHECK + normaliserings-trigger aktive')
    expect(idx.length === 1 && !idx.some((i) => /UNIQUE/i.test(i.indexdef)), 'opslags-indeks findes, INGEN unik-constraint (bevidst)')
    expect(fns.length === 2 && fns.every((f) => /search_path=/.test(f.cfg)), 'funktioner har låst search_path')
    const inputs = ['12345678', '12 34 56 78', 'DK12345678', 'dk-12.34.56.78', '4512345678', ' SE556677889901 ', '', 'no12/345']
    const db = (await run(`SELECT i, public.normalize_vat_number(i) n FROM unnest(ARRAY[${inputs.map((x) => `'${x}'`).join(',')}]) AS t(i)`)) as any[]
    const mism = db.filter((r) => (r.n ?? null) !== normalizeVatNumber(r.i))
    expect(mism.length === 0, `normalisering DB = TS (${db.length - mism.length}/${db.length})`)
    const dup = (await run(`SELECT count(*)::int n FROM (SELECT vat_number FROM suppliers WHERE vat_number IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x`))[0].n
    console.log(`  info: CVR udfyldt på ${(await run(`SELECT count(*)::int n FROM suppliers WHERE vat_number IS NOT NULL`))[0].n} leverandører · dubletter=${dup}`)
  }
  if (mode === 'post-00168') {
    expect(openWrite.length === 0, `ingen åbne skrive-policies (${pols.length} policies i alt)`)
    expect(['suppliers_insert_admin', 'suppliers_update_admin', 'suppliers_delete_admin'].every((n) => pols.some((p) => p.policyname === n)), 'admin-only skrive-policies findes')
    expect(pols.some((p) => p.cmd === 'SELECT'), 'læse-policy for indloggede bevaret')
    expect(anonGrants === 0, `anon har ingen grants (${anonGrants})`)
  }
  if (mode === 'post-00167') {
    expect(openWrite.length === 3, 'skrive-policies uændrede indtil 00168 (00167 rører dem ikke)')
  }
}).then(() => {
  console.log(problems.length ? `\n❌ ${problems.length} afvigelse(r) — STOP` : '\n✅ som forventet')
  process.exitCode = problems.length ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
