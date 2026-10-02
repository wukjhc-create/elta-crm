/**
 * Delte tjek for P-009 laese-lockdowns (00175/00176/00177/00179). Kolonnelisterne laeses fra migrationsfilerne.
 * Bruges af scripts/prod-verify-read-lockdown.ts (prod, read-only) og harness verify-read-lockdown (staging).
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

export const READ_LOCKDOWN_NRS = ['00175', '00176', '00177', '00179'] as const
type Run = (sql: string) => Promise<any[]>
type Spec = { nr: string; revokeSelect: string[]; grants: Record<string, string[]>; revokeAllAnon: string[]; sql: string }

function parse(nr: string): Spec {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const file = readdirSync(dir).find((f) => f.startsWith(`${nr}_`))
  if (!file) throw new Error(`migration ${nr} ikke fundet`)
  // Fjern kommentarlinjer — headeren citerer SQL i fritekst
  const sql = readFileSync(join(dir, file), 'utf8').split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n')
  const revokeSelect = [...sql.matchAll(/REVOKE SELECT ON public\.(\w+) FROM authenticated/gi)].map((m) => m[1])
  const grants: Record<string, string[]> = {}
  for (const m of sql.matchAll(/GRANT SELECT \(([^)]*)\)\s+ON public\.(\w+) TO authenticated/gi)) {
    grants[m[2]] = m[1].split(',').map((c) => c.trim()).filter(Boolean)
  }
  const revokeAllAnon = [...sql.matchAll(/REVOKE ALL ON public\.(\w+) FROM anon/gi)].map((m) => m[1])
  return { nr, revokeSelect, grants, revokeAllAnon, sql }
}

export async function runReadLockdownChecks(run: Run, mode: 'pre' | 'post', selected: string[]): Promise<string[]> {
  const problems: string[] = []
  const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '❌'} ${label}`); if (!cond) problems.push(label) }
  const specs = selected.map(parse)
  for (const s of specs) {
    console.log(`\n[${s.nr}] REVOKE SELECT: ${s.revokeSelect.join(', ')}${s.revokeAllAnon.length ? ` · REVOKE ALL anon: ${s.revokeAllAnon.join(', ')}` : ''}`)
    for (const t of s.revokeSelect) {
      const cols = ((await run(`SELECT column_name c FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`)) as Array<{ c: string }>).map((x) => x.c)
      expect(cols.length > 0, `${t}: tabellen findes (${cols.length} kolonner)`)
      const granted = s.grants[t] ?? [] // tom = ingen kolonne-grant (fx offer_signatures: kun service-role)
      const hidden = cols.filter((c) => !granted.includes(c))
      const tablePriv = (await run(`SELECT has_table_privilege('authenticated', 'public.${t}', 'SELECT') p`))[0].p as boolean
      if (mode === 'pre') {
        const missing = granted.filter((c) => !cols.includes(c))
        expect(missing.length === 0, `${t}: alle ${granted.length} grant-kolonner findes i prod${missing.length ? ` (MANGLER → GRANT fejler: ${missing.join(',')})` : ''}`)
        console.log(`    skjules for authenticated efter migrationen: ${hidden.join(', ') || '(ingen kolonner — hele tabellen)'}`)
        console.log(`    nu: authenticated tabel-SELECT=${tablePriv}`)
        continue
      }
      expect(!tablePriv, `${t}: authenticated har ikke længere tabel-SELECT`)
      if (granted.length) {
        const bad = (await run(`SELECT c.column_name c, has_column_privilege('authenticated', 'public.${t}', c.column_name, 'SELECT') p
          FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='${t}'`)) as Array<{ c: string; p: boolean }>
        const pubDenied = bad.filter((x) => granted.includes(x.c) && !x.p).map((x) => x.c)
        const secretOpen = bad.filter((x) => !granted.includes(x.c) && x.p).map((x) => x.c)
        expect(pubDenied.length === 0, `${t}: ${granted.length} offentlige kolonner læsbare${pubDenied.length ? ` (NÆGTET: ${pubDenied.join(',')})` : ''}`)
        expect(secretOpen.length === 0, `${t}: skjulte kolonner ikke læsbare (${hidden.join(',')})${secretOpen.length ? ` — ÅBNE: ${secretOpen.join(',')}` : ''}`)
      }
    }
    for (const t of s.revokeAllAnon) {
      const n = (await run(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='${t}' AND grantee='anon'`))[0].n as number
      const colN = (await run(`SELECT count(*)::int n FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='${t}' AND grantee='anon'`))[0].n as number
      if (mode === 'pre') console.log(`    nu: anon tabel-grants på ${t}=${n}, kolonne-grants=${colN}`)
      else expect(n === 0 && colN === 0, `${t}: anon uden tabel-/kolonne-grants (${n}/${colN})`)
    }
    if (/messages_select_own/.test(s.sql)) {
      const pols = (await run(`SELECT policyname, cmd, qual FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND cmd IN ('SELECT','ALL')`)) as Array<{ policyname: string; cmd: string; qual: string | null }>
      if (mode === 'pre') {
        for (const p of pols) console.log(`    nu: messages.${p.policyname} ${p.cmd} USING(${p.qual ?? ''})`)
        const extra = pols.filter((p) => !['Users can view messages', 'messages_select_own'].includes(p.policyname))
        expect(extra.length === 0, `messages: ingen andre SELECT-policies end dem migrationen dropper${extra.length ? ` (IKKE DÆKKET: ${extra.map((p) => p.policyname).join(',')})` : ''}`)
      } else {
        const own = pols.find((p) => p.policyname === 'messages_select_own')
        expect(!!own && /from_user_id/.test(own.qual ?? '') && /to_user_id/.test(own.qual ?? ''), 'messages_select_own findes (afsender/modtager = auth.uid())')
        expect(pols.every((p) => p.policyname === 'messages_select_own'), `messages: kun messages_select_own til SELECT (${pols.map((p) => p.policyname).join(',')})`)
      }
    }
  }
  return problems
}
