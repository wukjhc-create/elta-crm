/**
 * Fuld databaseaudit af rolle-/eksponerings-risici (READ-ONLY, faste SELECTs uden input).
 * Bruges identisk mod production (prod:db-audit, read-only session) og staging (harness:db-audit).
 *
 *   T1  tabel med grant til anon/authenticated men RLS SLAAET FRA            -> alt aabent via REST
 *   T2  tabel hvor anon kan LAESE (policy TO anon/public med USING true)
 *   T3  tabel hvor anon kan SKRIVE (INSERT/UPDATE/DELETE/ALL-policy til anon/public)
 *   T4  tabel hvor alle indloggede kan SKRIVE (USING/WITH CHECK true for authenticated)  -> kun app-laget beskytter
 *   F1  SECURITY DEFINER-funktion som anon kan kalde
 *   F2  SECURITY DEFINER-funktion som authenticated kan kalde, der returnerer data (setof/table/json/record)
 *       og IKKE refererer auth.uid()/rolle-helpers i kroppen                  -> mulig RLS-bypass
 *   F3  SECURITY DEFINER-funktion uden laast search_path                      -> search_path-hijacking
 *   V1  view med ejer-rettigheder (ikke security_invoker) som anon/authenticated kan SELECT
 *
 * Bevidst offentlige/anon-flader registreres i INTENTIONAL (med begrundelse) og rapporteres som "kendt", ikke fund.
 */

export type Runner = (sql: string) => Promise<any[]>

export const DB_AUDIT_QUERIES = {
  tables: `SELECT c.relname AS name, c.relrowsecurity AS rls,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_sel, has_table_privilege('anon', c.oid, 'INSERT') AS anon_ins,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`,
  policies: `SELECT tablename, policyname, cmd, roles::text AS roles, coalesce(qual, '') AS qual, coalesce(with_check, '') AS wcheck
    FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`,
  definerFunctions: `SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result,
      coalesce(array_to_string(p.proconfig, ','), '') AS cfg,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
      (p.prosrc ~* 'auth\\.uid\\(|is_admin\\(|user_role\\(|current_employee_id\\(|can_view_|can_write_|auth\\.role\\(|auth\\.jwt\\(') AS checks_auth,
      p.prokind AS kind
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef ORDER BY 1`,
  views: `SELECT c.relname AS name, coalesce(c.reloptions::text, '') AS opts,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_sel, has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') ORDER BY 1`,
} as const
for (const [k, sql] of Object.entries(DB_AUDIT_QUERIES)) {
  if (!/^SELECT\s/i.test(sql) || sql.includes(';')) throw new Error(`db-audit: '${k}' er ikke en ren SELECT`)
}

/** Bevidst offentlige flader (navn -> begrundelse). Holdes kort og eksplicit; alt andet er et fund. */
export const INTENTIONAL: Record<string, string> = {}

export interface Finding { code: string; severity: 'HOEJ' | 'MIDDEL' | 'LAV'; object: string; detail: string; intentional?: string }

const t = (v: unknown) => v === true || v === 't'
const hasRole = (roles: string, r: string) => new RegExp(`\\b${r}\\b`).test(roles)
const isTrue = (s: string) => s.trim() === 'true'

export async function runDbAudit(run: Runner): Promise<{ findings: Finding[]; stats: Record<string, number> }> {
  const tables = await run(DB_AUDIT_QUERIES.tables)
  const policies = await run(DB_AUDIT_QUERIES.policies)
  const fns = await run(DB_AUDIT_QUERIES.definerFunctions)
  const views = await run(DB_AUDIT_QUERIES.views)
  const f: Finding[] = []
  const add = (x: Finding) => f.push({ ...x, intentional: INTENTIONAL[x.object] })

  for (const tb of tables) {
    const exposed = t(tb.anon_sel) || t(tb.auth_sel)
    if (!t(tb.rls) && exposed) add({ code: 'T1', severity: 'HOEJ', object: tb.name, detail: `RLS slaaet fra; grants: ${[t(tb.anon_sel) && 'anon', t(tb.auth_sel) && 'authenticated'].filter(Boolean).join('+')}` })
  }
  const rlsOn = new Set(tables.filter((x: any) => t(x.rls)).map((x: any) => x.name))
  const anonSel = new Set(tables.filter((x: any) => t(x.anon_sel)).map((x: any) => x.name))
  const anonIns = new Set(tables.filter((x: any) => t(x.anon_ins)).map((x: any) => x.name))
  const byTable = new Map<string, any[]>()
  for (const p of policies) (byTable.get(p.tablename) ?? byTable.set(p.tablename, []).get(p.tablename)!).push(p)

  for (const [tbl, ps] of byTable) {
    if (!rlsOn.has(tbl)) continue
    const anonRead = ps.filter((p) => (hasRole(p.roles, 'anon') || hasRole(p.roles, 'public')) && ['SELECT', 'ALL'].includes(p.cmd) && isTrue(p.qual))
    if (anonRead.length && anonSel.has(tbl)) add({ code: 'T2', severity: 'HOEJ', object: tbl, detail: `anon kan laese alt (${anonRead.map((p) => p.policyname).join(', ')})` })
    const anonWrite = ps.filter((p) => (hasRole(p.roles, 'anon') || hasRole(p.roles, 'public')) && p.cmd !== 'SELECT')
    if (anonWrite.length && anonIns.has(tbl)) add({ code: 'T3', severity: 'HOEJ', object: tbl, detail: `anon-skrive-policy: ${anonWrite.map((p) => `${p.policyname}(${p.cmd}${isTrue(p.qual) || isTrue(p.wcheck) ? ',true' : ''})`).join(', ')}` })
    const authWriteTrue = ps.filter((p) => hasRole(p.roles, 'authenticated') && p.cmd !== 'SELECT' && (isTrue(p.qual) || isTrue(p.wcheck)))
    if (authWriteTrue.length) add({ code: 'T4', severity: 'LAV', object: tbl, detail: `alle indloggede kan skrive: ${authWriteTrue.map((p) => `${p.policyname}(${p.cmd})`).join(', ')}` })
  }

  for (const fn of fns) {
    const sig = `${fn.name}(${fn.args})`
    const returnsData = /setof|table\(|json|record/i.test(String(fn.result))
    if (t(fn.anon_exec)) add({ code: 'F1', severity: t(fn.checks_auth) ? 'MIDDEL' : 'HOEJ', object: sig, detail: `anon kan kalde SECURITY DEFINER → ${fn.result}${t(fn.checks_auth) ? ' (tjekker auth i kroppen)' : ' (INGEN auth-tjek i kroppen)'}` })
    else if (t(fn.auth_exec) && returnsData && !t(fn.checks_auth)) add({ code: 'F2', severity: 'MIDDEL', object: sig, detail: `authenticated kan kalde; returnerer ${fn.result} uden auth-tjek i kroppen` })
    if (!/search_path=/.test(String(fn.cfg))) add({ code: 'F3', severity: 'LAV', object: sig, detail: 'SECURITY DEFINER uden laast search_path' })
  }

  for (const v of views) {
    const invoker = /security_invoker=(true|on)/i.test(String(v.opts))
    if (!invoker && (t(v.anon_sel) || t(v.auth_sel))) add({ code: 'V1', severity: t(v.anon_sel) ? 'HOEJ' : 'MIDDEL', object: v.name, detail: `ejer-rettigheder, SELECT for ${[t(v.anon_sel) && 'anon', t(v.auth_sel) && 'authenticated'].filter(Boolean).join('+')}` })
  }

  const stats = {
    tabeller: tables.length, rls_slaaet_fra: tables.filter((x: any) => !t(x.rls)).length, policies: policies.length,
    security_definer_funktioner: fns.length, views: views.length,
  }
  return { findings: f, stats }
}

export function formatDbAudit(target: string, r: { findings: Finding[]; stats: Record<string, number> }): string {
  const l = [`=== DB-AUDIT @ ${target} ===`, `  ${Object.entries(r.stats).map(([k, v]) => `${k}=${v}`).join(' · ')}`]
  for (const code of ['T1', 'T2', 'T3', 'F1', 'V1', 'F2', 'T4', 'F3']) {
    const xs = r.findings.filter((x) => x.code === code)
    if (!xs.length) continue
    l.push(`\n[${code}] ${xs.length} stk.`)
    for (const x of xs) l.push(`  ${x.intentional ? '·' : x.severity === 'HOEJ' ? '⚠' : '-'} ${x.severity.padEnd(6)} ${x.object.padEnd(46)} ${x.detail}${x.intentional ? `  [bevidst: ${x.intentional}]` : ''}`)
  }
  const open = r.findings.filter((x) => !x.intentional)
  const count = (s: string) => open.filter((x) => x.severity === s).length
  l.push(`\n=== RESULTAT: HOEJ=${count('HOEJ')} · MIDDEL=${count('MIDDEL')} · LAV=${count('LAV')} (ekskl. bevidste) ===`)
  return l.join('\n')
}
