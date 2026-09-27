/**
 * PRODUCTION read-only verifikation af migration 00161 (R1–R4) — struktur OG adfaerd.
 *   npm run prod:verify-00161
 *
 * Adfaerd: i en READ ONLY-transaktion saettes role=authenticated og request.jwt.claims (sub = en eksisterende bruger)
 * transaktions-lokalt med set_config(..., true), og der maales hvad brugeren faktisk ser. Ingen skrivning; hver
 * persona koeres i sin egen read-only session, der afsluttes med ROLLBACK. Bruger-id'er printes ikke.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const uuidRe = /^[0-9a-f-]{36}$/i

async function main() {
  const problems: string[] = []
  const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '❌'} ${label}`); if (!cond) problems.push(label) }

  // ---- struktur + personaer (som service-forbindelsen)
  const personas = await withProdReadOnly('prod-verify-00161', async (run, masked) => {
    console.log(`--- 00161 @ prod:${masked} — struktur ---`)
    const fns = await run(`SELECT p.proname, p.prosecdef AS definer, coalesce(array_to_string(p.proconfig, ','), '') AS cfg,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('current_employee_id', 'can_view_case_finance', 'can_view_time_log', 'can_write_time_log') ORDER BY 1`)
    expect(fns.length === 4, `4 hjaelpefunktioner findes (${fns.length})`)
    for (const f of fns as any[]) expect(f.definer && /search_path=public/.test(f.cfg) && f.auth_exec && !f.anon_exec, `${f.proname}: SECURITY DEFINER, search_path laast, EXECUTE kun authenticated`)
    const meta = (await run(`SELECT bool_and(has_column_privilege('authenticated', 'public.supplier_credentials', c, 'SELECT')) AS ok
      FROM unnest(ARRAY['id','supplier_id','credential_type','is_active','api_endpoint','last_test_status']) AS c`))[0]
    expect(meta.ok === true, 'metadata-kolonner i supplier_credentials stadig laesbare for authenticated (tilbuds-embed/admin-UI)')
    const rows = await run(`SELECT p.id, p.role FROM public.profiles p JOIN auth.users u ON u.id = p.id
      WHERE coalesce(u.email, '') NOT LIKE '%@harness.test' AND coalesce(p.is_active, true) ORDER BY p.role, p.created_at NULLS LAST`)
    const byRole = new Map<string, string>()
    for (const r of rows as any[]) if (!byRole.has(r.role) && uuidRe.test(r.id)) byRole.set(r.role, r.id)
    const totals = (await run(`SELECT (SELECT count(*) FROM public.invoices) AS inv, (SELECT count(*) FROM public.time_logs) AS tl,
      (SELECT count(*) FROM public.audit_logs) AS audit, (SELECT count(*) FROM public.supplier_credentials) AS cred`))[0]
    const own: Record<string, number> = {}
    for (const [role, id] of byRole) own[role] = Number((await run(`SELECT count(*) AS n FROM public.audit_logs WHERE user_id = '${id}'`))[0].n)
    return { byRole, totals, own }
  })

  // ---- adfaerd pr. rolle (egen read-only session pr. persona)
  for (const [role, uid] of personas.byRole) {
    await withProdReadOnly(`prod-verify-00161-${role}`, async (run) => {
      const claims = JSON.stringify({ sub: uid, role: 'authenticated' }).replace(/'/g, "''")
      await run(`SELECT set_config('request.jwt.claims', '${claims}', true)`)
      await run(`SELECT set_config('role', 'authenticated', true)`)
      const who = (await run(`SELECT current_user AS cu, public.user_role() AS r`))[0]
      const c = (await run(`SELECT (SELECT count(*) FROM public.invoices) AS inv, (SELECT count(*) FROM public.time_logs) AS tl,
        (SELECT count(*) FROM public.v_recent_audit_logs) AS audit, (SELECT count(*) FROM public.supplier_credentials) AS cred`))[0]
      console.log(`--- adfaerd som ${role} (${who.cu}, user_role=${who.r}) ---`)
      const T = personas.totals
      if (role === 'admin') {
        expect(Number(c.inv) === Number(T.inv), `admin ser alle fakturaer (${c.inv}/${T.inv})`)
        expect(Number(c.tl) === Number(T.tl), `admin ser alle tidsregistreringer (${c.tl}/${T.tl})`)
        expect(Number(c.audit) === Number(T.audit), `admin ser hele audit-loggen via view (${c.audit}/${T.audit})`)
        expect(Number(c.cred) === Number(T.cred), `admin ser credential-metadata (${c.cred}/${T.cred})`)
      } else if (role === 'montør') {
        expect(Number(c.inv) === 0, `montør ser 0 fakturaer (${c.inv})`)
        expect(Number(c.tl) <= Number(T.tl), `montør ser kun tidsregistreringer i eget scope (${c.tl}/${T.tl})`)
        expect(Number(c.audit) === personas.own[role], `montør ser kun egne audit-raekker via view (${c.audit}, egne=${personas.own[role]})`)
        expect(Number(c.cred) === Number(T.cred), `montør ser credential-metadata (til tilbud) (${c.cred}/${T.cred})`)
      } else {
        console.log(`  · ${role}: fakturaer=${c.inv} tid=${c.tl} audit=${c.audit} cred-metadata=${c.cred}`)
      }
      const sec = await run(`SELECT has_column_privilege(current_user, 'public.supplier_credentials', 'credentials_encrypted', 'SELECT') AS can`)
      expect(sec[0].can === false, `${role} kan ikke laese credentials_encrypted`)
    })
  }

  console.log(problems.length ? `\n❌ ${problems.length} afvigelse(r)` : '\n✅ 00161 verificeret i production (struktur + adfaerd; ingen skrivning)')
  process.exitCode = problems.length ? 2 : 0
}

main().catch((e) => { console.error('[prod-verify-00161] FEJL:', maskDbError(e)); process.exit(1) })
