/**
 * PRODUCTION read-only (P-009): EFFEKTIV skriveadgang pr. persona, beregnet ud fra de faktiske policy-udtryk i
 * pg_policies evalueret mod de rigtige raekker i en persona-session (set_config jwt-claims + role). Skrivning kan
 * ikke proeves i en read-only transaktion — men UPDATE/DELETE-policyens USING-udtryk afgoer praecis hvilke raekker
 * rollen kan ramme, og INSERT-udtrykkets rolle-del kan evalueres uden raekke.
 *   npx tsx scripts/prod-rls-effective.ts [WAVE ...]       (default: alle runder)
 * Forventning (matrix): rolle i basis-listen -> alle raekker; kun betinget -> delmaengde; ellers 0 raekker.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import * as M from './rls/write-matrix'

const waves = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(M).filter((k) => /^WAVE/.test(k))
const policies = waves.flatMap((w) => (M as unknown as Record<string, M.TableWritePolicy[]>)[w] ?? [])
const problems: string[] = []

async function main() {
  const personas = await withProdReadOnly('rls-eff-personas', async (run) =>
    (await run(`SELECT DISTINCT ON (role) id, role::text role FROM profiles WHERE coalesce(is_active,true) ORDER BY role, created_at`)) as Array<{ id: string; role: string }>)
  const pols = await withProdReadOnly('rls-eff-pols', async (run) => {
    const list = policies.map((p) => `'${p.table}'`).join(',')
    return (await run(`SELECT tablename t, cmd, coalesce(qual,'') q, coalesce(with_check,'') w FROM pg_policies WHERE schemaname='public' AND tablename IN (${list})
      AND cmd IN ('INSERT','UPDATE','DELETE') AND (roles @> ARRAY['authenticated']::name[])`)) as Array<{ t: string; cmd: string; q: string; w: string }>
  })
  for (const pr of personas) {
    const out = await withProdReadOnly(`rls-eff-${pr.role}`, async (run) => {
      await run(`SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: pr.id, role: 'authenticated' })}', true)`)
      const totals = new Map<string, number>()
      for (const p of policies) totals.set(p.table, Number((await run(`SELECT count(*)::int n FROM public.${p.table}`))[0].n)) // som postgres (foer role-skift)
      await run(`SELECT set_config('role', 'authenticated', true)`)
      // UPDATE/DELETE rammer kun rækker rollens SELECT-policy viser (fx montør-mailscope 00180) → forventning = synlige
      const visible = new Map<string, number>()
      for (const p of policies) {
        // kun hvis rollen overhovedet må læse tabellen (læse-lockdown fjerner SELECT-grant) — ellers gammel forventning
        const canRead = Boolean((await run(`SELECT has_table_privilege('authenticated', 'public.${p.table}', 'SELECT') ok`))[0].ok)
        if (canRead) visible.set(p.table, Number((await run(`SELECT count(*)::int n FROM public.${p.table}`))[0].n))
      }
      const res: string[] = []
      for (const p of policies) {
        for (const op of ['update', 'delete', 'insert'] as const) {
          const base = (p[op] as string[]).includes(pr.role)
          const cond = (op === 'insert' ? p.insertConditional : op === 'update' ? p.updateConditional : p.deleteConditional)?.roles.includes(pr.role as M.Role) ?? false
          const pol = pols.filter((x) => x.t === p.table && x.cmd === op.toUpperCase())
          if (op === 'insert') {
            // rolle-delen af WITH CHECK kan evalueres uden raekke (betingede/kolonne-udtryk springes over)
            const exprs = pol.map((x) => x.w).filter((w) => /^\(?user_role\(\) = ANY \(ARRAY\[[^\]]+\]\)\)?$/.test(w.trim()))
            if (!exprs.length) continue
            const ok = Boolean((await run(`SELECT (${exprs.join(' OR ')}) ok`))[0].ok)
            if (ok !== base) res.push(`${p.table}.insert: ${ok ? 'TILLADT' : 'afvist'} (forventet ${base ? 'tilladt' : 'afvist'})`)
            continue
          }
          const total = visible.get(p.table) ?? totals.get(p.table) ?? 0
          const using = pol.map((x) => x.q).filter(Boolean)
          const n = using.length ? Number((await run(`SELECT count(*)::int n FROM public.${p.table} WHERE (${using.join(') OR (')})`))[0].n) : 0
          const expect = base ? total : cond ? null : 0
          if (expect !== null && n !== expect) res.push(`${p.table}.${op}: kan ramme ${n}/${total} (forventet ${expect})`)
          if (expect === null && n > total) res.push(`${p.table}.${op}: betinget men rammer ${n}/${total}`)
        }
      }
      return res
    })
    if (out.length) problems.push(...out.map((x) => `${pr.role}: ${x}`))
    console.log(`  ${out.length ? '❌' : '✓'} ${pr.role}: effektiv skriveadgang som matrixen på ${policies.length} tabeller${out.length ? ` — ${out.slice(0, 6).join(' · ')}` : ''}`)
  }
}

main().then(() => {
  console.log(problems.length ? `\n❌ ${problems.length} afvigelse(r)` : '\n✅ effektiv skriveadgang = matrixen for alle prod-personaer')
  process.exitCode = problems.length ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
