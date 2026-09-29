/**
 * PRODUCTION read-only pre-/post-check for 00164 (supplier_settings) og 00165 (price_history change_source).
 *   npx tsx scripts/prod-verify-00164-00165.ts pre
 *   npx tsx scripts/prod-verify-00164-00165.ts post-00164
 *   npx tsx scripts/prod-verify-00164-00165.ts post-00165
 * Persona-adfaerd koeres i SEPARATE read-only sessioner (rollen kan ikke skiftes tilbage i samme transaktion).
 * Et tomt persona-saet er en FEJL (ellers ville et manglende bevis se groent ud).
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] ?? 'pre'
const problems: string[] = []
const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '❌'} ${label}`); if (!cond) problems.push(label) }

async function main() {
  const base = await withProdReadOnly('prod-verify-00164-00165', async (run, masked) => {
    console.log(`--- ${mode} @ prod:${masked} ---`)
    const creds = (await run(`SELECT count(*) FILTER (WHERE api_credentials IS NOT NULL AND api_credentials::text NOT IN ('{}','null')) a,
      count(*) FILTER (WHERE ftp_credentials IS NOT NULL AND ftp_credentials::text NOT IN ('{}','null')) f, count(*)::int n FROM supplier_settings`))[0]
    const pols = (await run(`SELECT policyname, cmd, coalesce(qual,'') q, coalesce(with_check,'') w FROM pg_policies WHERE schemaname='public' AND tablename='supplier_settings' ORDER BY 1`)) as any[]
    const colPriv = async (role: string, col: string, priv: string) => (await run(`SELECT has_column_privilege('${role}', 'public.supplier_settings', '${col}', '${priv}') p`))[0].p as boolean
    const chk = ((await run(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'price_history_change_source_check'`))[0]?.d ?? '') as string
    const ids = (await run(`SELECT p.role, (array_agg(p.id::text ORDER BY p.created_at))[1] AS id FROM profiles p JOIN auth.users u ON u.id = p.id
      WHERE p.role IN ('admin','montør') AND coalesce(p.is_active,true) AND coalesce(u.email,'') NOT LIKE '%@harness.test' GROUP BY p.role`)) as Array<{ role: string; id: string }>

    if (mode === 'pre') {
      expect(Number(creds.a) === 0 && Number(creds.f) === 0, `jsonb-credentials tomme (api=${creds.a}, ftp=${creds.f})`)
      expect(pols.some((p) => p.policyname === 'Authenticated users can update supplier settings' && p.q === 'true'), 'før 00164: åben UPDATE-policy findes (forventet)')
      expect(await colPriv('authenticated', 'api_credentials', 'SELECT'), 'før 00164: authenticated kan læse api_credentials (forventet)')
      expect(!/ftp_sync/.test(chk), 'før 00165: CHECK afviser ftp_sync (forventet)')
    }
    if (mode === 'post-00164') {
      const writePols = pols.filter((p) => ['INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(p.cmd))
      expect(writePols.every((p) => /user_role\(\) = 'admin'/.test(p.q + p.w)) && writePols.length === 3,
        `skrive-policies kun admin (${writePols.map((p) => `${p.policyname}:${p.cmd}`).join(', ')})`)
      const sel = pols.filter((p) => p.cmd === 'SELECT')
      expect(sel.length === 1, `læse-policy bevaret for indloggede (bevidst; hemmelige kolonner fjernet via kolonne-grants): ${sel.map((p) => p.policyname).join(', ')}`)
      for (const col of ['api_credentials', 'ftp_credentials']) {
        expect(!(await colPriv('authenticated', col, 'SELECT')) && !(await colPriv('anon', col, 'SELECT')), `${col} ulæselig for authenticated/anon`)
        expect(!(await colPriv('authenticated', col, 'UPDATE')) && !(await colPriv('authenticated', col, 'INSERT')), `${col} kan ikke skrives af authenticated`)
      }
      for (const col of ['default_margin_percentage', 'sync_config', 'credential_encrypted']) expect(await colPriv('authenticated', col, 'SELECT'), `${col} fortsat læsbar for authenticated`)
      expect(!(await run(`SELECT has_table_privilege('anon', 'public.supplier_settings', 'SELECT') p`))[0].p, 'anon ingen tabel-SELECT')
    }
    if (mode === 'post-00165') {
      expect(/'ftp_sync'/.test(chk) && /'ftp_manual'/.test(chk) && /'import'/.test(chk) && /'api_sync'/.test(chk), `CHECK: ${chk}`)
      const ph = (await run(`SELECT count(*)::int n, count(*) FILTER (WHERE change_source NOT IN ('import','manual','api_sync','email_detection','ftp_sync','ftp_manual'))::int ugyldige FROM price_history`))[0]
      expect(Number(ph.ugyldige) === 0, `price_history: ${ph.n} rækker, alle med gyldig change_source (fyldes først ved næste LM-sync)`)
    }
    return { total: Number(creds.n), ids }
  })

  if (mode === 'post-00164') {
    expect(base.ids.length === 2, `personaer til adfærdstest fundet: ${base.ids.map((x) => x.role).join(', ') || 'INGEN'}`)
    for (const { role, id } of base.ids) {
      const res = await withProdReadOnly(`prod-verify-00164-${role}`, async (run) => {
        await run(`SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: id, role: 'authenticated' })}', true)`)
        await run(`SELECT set_config('role', 'authenticated', true)`)
        const n = Number((await run(`SELECT count(*)::int n FROM supplier_settings`))[0].n)
        const cols = (await run(`SELECT default_margin_percentage FROM supplier_settings LIMIT 1`)).length
        return { n, cols }
      })
      expect(res.n === base.total && res.cols === (base.total > 0 ? 1 : 0), `${role} læser offentlige kolonner (${res.n}/${base.total} rækker)`)
      let denied = false
      await withProdReadOnly(`prod-verify-00164-${role}-secret`, async (run) => {
        await run(`SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: id, role: 'authenticated' })}', true)`)
        await run(`SELECT set_config('role', 'authenticated', true)`)
        await run(`SELECT api_credentials FROM supplier_settings LIMIT 1`)
      }).catch((e) => { denied = /permission denied/i.test(maskDbError(e)) })
      expect(denied, `${role} kan IKKE læse api_credentials (permission denied)`)
    }
  }
  console.log(problems.length ? `\n=== ❌ ${problems.length} afvigelse(r) ===` : `\n=== ✅ ${mode} grøn (ingen skrivning udført) ===`)
  process.exitCode = problems.length ? 2 : 0
}

main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
