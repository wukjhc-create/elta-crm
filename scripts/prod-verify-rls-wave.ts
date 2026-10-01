/**
 * PRODUCTION read-only pre-/post-check for en P-009-lockdown-runde (matrix: scripts/rls/write-matrix.ts).
 *   npx tsx scripts/prod-verify-rls-wave.ts <WAVE> pre|post
 * pre:  viser nuvaerende aabne skrive-policies (forventet foer migrationen).
 * post: ingen aabne skrive-policies, praecis de genererede policies findes, anon uden grants, og — i separate
 *       read-only sessioner pr. prod-persona — at hver skrive-policys rolle-praedikat evaluerer som matrixen.
 * Selve skrivningen kan ikke proeves read-only; den er bevist dynamisk paa staging (harness:rls-lockdown).
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import * as M from './rls/write-matrix'

const wave = process.argv[2] || 'WAVE1'
const mode = process.argv[3] === 'post' ? 'post' : 'pre'
const policies = (M as unknown as Record<string, M.TableWritePolicy[]>)[wave]
const problems: string[] = []
const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '❌'} ${label}`); if (!cond) problems.push(label) }

async function main() {
  if (!Array.isArray(policies)) throw new Error(`ukendt wave ${wave}`)
  const tables = policies.map((p) => p.table)
  const list = tables.map((t) => `'${t}'`).join(',')
  await withProdReadOnly(`prod-verify-rls-${wave}`, async (run, masked) => {
    console.log(`--- P-009 ${wave} ${mode} @ prod:${masked} ---`)
    const open = (await run(`SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename IN (${list})
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL') AND (trim(coalesce(qual,''))='true' OR trim(coalesce(with_check,''))='true')
      AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[])`)) as any[]
    const anon = (await run(`SELECT table_name, count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN (${list}) AND grantee='anon' GROUP BY 1`)) as any[]
    if (mode === 'pre') {
      console.log(`  åbne skrive-policies nu: ${open.length} på ${new Set(open.map((o) => o.tablename)).size}/${tables.length} tabeller (forventet før)`)
      console.log(`  anon-grants nu: ${anon.map((a) => `${a.table_name}=${a.n}`).join(', ') || 'ingen'}`)
      const missing = tables.filter((t) => !open.some((o) => o.tablename === t))
      expect(missing.length === 0, `alle ${tables.length} tabeller har åbne skrive-policies før migrationen${missing.length ? ` (mangler: ${missing.join(',')})` : ''}`)
      for (const p of policies) {
        const names = ((await run(`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='${p.table}'`)) as any[]).map((x) => x.policyname)
        // ALLE skrive-policies (ogsaa betingede, fx created_by = auth.uid()) skal erstattes — permissive policies OR'es.
        const allWrite = ((await run(`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='${p.table}' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
          AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[])`)) as any[]).map((x) => x.policyname)
        const notCovered = allWrite.filter((x) => !p.dropPolicies.includes(x))
        expect(notCovered.length === 0, `${p.table}: alle skrive-policies droppes af migrationen${notCovered.length ? ` (IKKE DÆKKET: ${notCovered.join(',')})` : ''} [${names.length} policies]`)
      }
      return
    }
    expect(open.length === 0, `ingen åbne skrive-policies (${open.map((o) => `${o.tablename}.${o.policyname}`).join(', ') || '0'})`)
    const kept = new Set(policies.filter((p) => p.keepAnonGrants).map((p) => p.table))
    const unexpectedAnon = anon.filter((a) => !kept.has(a.table_name))
    expect(unexpectedAnon.length === 0, `anon uden grants (${unexpectedAnon.map((a) => a.table_name).join(',') || 'ingen'})${kept.size ? ` · bevidst bevaret (P-003): ${[...kept].join(',')}` : ''}`)
    for (const p of policies) {
      const n = M.policyNames(p.table)
      const have = ((await run(`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='${p.table}'`)) as any[]).map((x) => x.policyname)
      // Policy SKAL findes for operationer med roller/betingelse — og maa IKKE findes for tomme (= kun service-role).
      const want = { [n.ins]: p.insert.length > 0 || !!p.insertConditional, [n.upd]: p.update.length > 0 || !!p.updateConditional, [n.del]: p.delete.length > 0 || !!p.deleteConditional }
      const wrong = Object.entries(want).filter(([name, should]) => have.includes(name) !== should).map(([name, should]) => `${name} ${should ? 'mangler' : 'burde ikke findes'}`)
      const writePols = ((await run(`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='${p.table}' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
        AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[])`)) as any[]).map((x) => x.policyname)
      const foreign = writePols.filter((x) => ![n.ins, n.upd, n.del].includes(x))
      if (foreign.length) wrong.push(`fremmede skrive-policies: ${foreign.join(',')}`)
      if (p.recreateOpenSelect && !have.includes(n.sel)) wrong.push(`${n.sel} mangler`)
      expect(wrong.length === 0, `${p.table}: præcis de genererede skrive-policies${wrong.length ? ` (${wrong.join('; ')})` : ''}`)
      // extraSql: trigger-funktioner skal vaere SECURITY DEFINER, have laast search_path og ingen EXECUTE for klienter
      for (const fn of (p.extraSql ?? []).map((x) => /ALTER FUNCTION public\.(\w+)\(\)\s+SECURITY DEFINER/i.exec(x)?.[1]).filter(Boolean) as string[]) {
        const f = (await run(`SELECT p.prosecdef d, coalesce(p.proconfig::text,'') cfg, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
          has_function_privilege('anon', p.oid, 'EXECUTE') anon_x FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${fn}'`))[0]
        expect(!!f && f.d && /search_path=/.test(f.cfg) && !f.auth_x && !f.anon_x, `${fn}(): SECURITY DEFINER, search_path låst, ingen EXECUTE for klienter`)
      }
    }
  })
  if (mode !== 'post') return
  const personas = await withProdReadOnly('prod-rls-personas', async (run) =>
    (await run(`SELECT DISTINCT ON (role) id, role::text role FROM profiles WHERE coalesce(is_active,true) ORDER BY role, created_at`)) as Array<{ id: string; role: string }>)
  expect(personas.length >= 2, `prod-personaer til prædikat-test: ${personas.map((p) => p.role).join(', ')}`)
  for (const pr of personas) {
    const got = await withProdReadOnly(`prod-rls-${pr.role}`, async (run) => {
      await run(`SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: pr.id, role: 'authenticated' })}', true)`)
      await run(`SELECT set_config('role', 'authenticated', true)`)
      return (await run(`SELECT public.user_role()::text r`))[0].r as string
    })
    const mism: string[] = []
    for (const p of policies) for (const op of ['insert', 'update', 'delete'] as const) {
      const exp = (p[op] as string[]).includes(pr.role)
      const act = (p[op] as string[]).includes(got)
      if (exp !== act) mism.push(`${p.table}.${op}`)
    }
    expect(got === pr.role && mism.length === 0, `${pr.role}: user_role()=${got} → skrive-prædikater som matrixen${mism.length ? ` (AFVIGER: ${mism.join(',')})` : ''}`)
  }
}

main().then(() => {
  console.log(problems.length ? `\n❌ ${problems.length} afvigelse(r) — STOP` : '\n✅ som forventet')
  process.exitCode = problems.length ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
