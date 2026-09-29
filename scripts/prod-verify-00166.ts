/**
 * PRODUCTION read-only pre-/post-check for 00166 (RLS paa incoming_invoice_lines + incoming_invoice_audit_log).
 *   npx tsx scripts/prod-verify-00166.ts pre|post
 * Persona-adfaerd i separate read-only sessioner. Et tomt persona-saet er en FEJL.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const problems: string[] = []
const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '❌'} ${label}`); if (!cond) problems.push(label) }
const TABLES = ['incoming_invoices', 'incoming_invoice_lines', 'incoming_invoice_audit_log']

async function main() {
  const base = await withProdReadOnly('prod-verify-00166', async (run, masked) => {
    console.log(`--- 00166 ${mode} @ prod:${masked} ---`)
    const pols = (await run(`SELECT tablename, policyname, cmd, coalesce(qual,'') q, coalesce(with_check,'') w FROM pg_policies
      WHERE schemaname='public' AND tablename IN (${TABLES.map((t) => `'${t}'`).join(',')}) ORDER BY 1,2`)) as any[]
    const open = pols.filter((p) => p.q.trim() === 'true' || p.w.trim() === 'true')
    const counts = (await run(`SELECT (SELECT count(*) FROM incoming_invoice_lines)::int lines, (SELECT count(*) FROM incoming_invoice_audit_log)::int audit`))[0]
    const priv = async (role: string, t: string, p: string) => (await run(`SELECT has_table_privilege('${role}', 'public.${t}', '${p}') x`))[0].x as boolean
    if (mode === 'pre') {
      expect(open.map((p) => p.tablename).sort().join() === 'incoming_invoice_audit_log,incoming_invoice_lines', `før: åbne policies på linjer + audit (forventet): ${open.map((p) => p.policyname).join(', ')}`)
      expect(pols.some((p) => p.policyname === 'incoming_invoices_select_by_role'), 'før: hovedtabellen har 00160-policies (røres ikke)')
    } else {
      expect(open.length === 0, `efter: ingen åbne policies (${pols.length} i alt)`)
      expect(!pols.some((p) => /^ii_/.test(p.policyname)), 'efter: ingen ii_*-policies på hovedtabellen')
      expect(['incoming_invoices_select_by_role', 'incoming_invoices_update_by_role', 'incoming_invoices_insert_admin', 'incoming_invoices_delete_admin']
        .every((n) => pols.some((p) => p.policyname === n)), 'efter: 00160-policies på hovedtabellen uændrede')
      expect(['iil_select', 'iil_update', 'iil_insert', 'iil_delete', 'iia_select', 'iia_insert'].every((n) => pols.some((p) => p.policyname === n)), 'efter: nye policies findes')
      expect(!(await priv('authenticated', 'incoming_invoice_audit_log', 'UPDATE')) && !(await priv('authenticated', 'incoming_invoice_audit_log', 'DELETE')), 'efter: audit-log append-only (ingen UPDATE/DELETE for authenticated)')
      for (const t of TABLES) expect(!(await priv('anon', t, 'SELECT')) && !(await priv('anon', t, 'INSERT')), `efter: anon ingen adgang til ${t}`)
    }
    const ids = (await run(`SELECT p.role, (array_agg(p.id::text ORDER BY p.created_at))[1] AS id FROM profiles p JOIN auth.users u ON u.id = p.id
      WHERE p.role IN ('admin','montør') AND coalesce(p.is_active,true) AND coalesce(u.email,'') NOT LIKE '%@harness.test' GROUP BY p.role`)) as Array<{ role: string; id: string }>
    return { counts, ids }
  })

  if (mode === 'post') {
    expect(base.ids.length === 2, `personaer: ${base.ids.map((x) => x.role).join(', ') || 'INGEN'}`)
    for (const { role, id } of base.ids) {
      const seen = await withProdReadOnly(`prod-verify-00166-${role}`, async (run) => {
        await run(`SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: id, role: 'authenticated' })}', true)`)
        await run(`SELECT set_config('role', 'authenticated', true)`)
        return (await run(`SELECT (SELECT count(*) FROM incoming_invoice_lines)::int lines, (SELECT count(*) FROM incoming_invoice_audit_log)::int audit`))[0]
      })
      if (role === 'admin') expect(seen.lines === base.counts.lines && seen.audit === base.counts.audit, `admin ser alle linjer/audit (${seen.lines}/${base.counts.lines}, ${seen.audit}/${base.counts.audit})`)
      else expect(seen.lines === 0 && seen.audit === 0, `montør ser 0 linjer/audit (linjer=${seen.lines}, audit=${seen.audit}; i alt ${base.counts.lines}/${base.counts.audit})`)
    }
  }
  console.log(problems.length ? `\n=== ❌ ${problems.length} afvigelse(r) ===` : `\n=== ✅ 00166 ${mode} grøn (ingen skrivning udført) ===`)
  process.exitCode = problems.length ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
