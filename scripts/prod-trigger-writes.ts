/**
 * PRODUCTION read-only (P-009): DB-triggere hvis funktion (transitivt via kaldte funktioner) SKRIVER til en
 * RLS-laast tabel som den kaldende bruger (SECURITY INVOKER). Brud hvis en rolle der maa skrive kildetabellen IKKE
 * maa den tilsvarende operation paa maaltabellen — det kan den statiske app-analyse (rls-write-sites) ikke se.
 *   npx tsx scripts/prod-trigger-writes.ts [WAVE ...]      (default: alle runder i matrixen)
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import * as M from './rls/write-matrix'

const waves = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(M).filter((k) => /^WAVE/.test(k))
const policies = waves.flatMap((w) => (M as unknown as Record<string, M.TableWritePolicy[]>)[w] ?? [])
const byTable = new Map(policies.map((p) => [p.table, p]))
const rolesFor = (t: string, op: 'insert' | 'update' | 'delete'): Set<string> => {
  const p = byTable.get(t)
  if (!p) return new Set(M.ALL_ROLES) // ulaast tabel: alle roller kan skrive
  const cond = op === 'insert' ? p.insertConditional : op === 'update' ? p.updateConditional : p.deleteConditional
  return new Set([...p[op], ...(cond?.roles ?? [])])
}

withProdReadOnly('prod-trigger-writes', async (run, masked) => {
  console.log(`--- trigger-skrivninger mod låste tabeller (${waves.join(',')}) @ prod:${masked} ---`)
  const fns = (await run(`SELECT p.proname fn, p.prosecdef definer, pg_get_functiondef(p.oid) src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'`)) as Array<{ fn: string; definer: boolean; src: string }>
  const fnMap = new Map(fns.map((f) => [f.fn, f]))
  const trg = (await run(`SELECT c.relname tbl, t.tgname, p.proname fn, t.tgtype::int tgtype FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_proc p ON p.oid = t.tgfoid WHERE n.nspname = 'public' AND NOT t.tgisinternal`)) as Array<{ tbl: string; tgname: string; fn: string; tgtype: number }>
  /** Skrivninger naaet fra en funktion; stopper ved SECURITY DEFINER (koerer ikke som brugeren). */
  const reach = (name: string, seen = new Set<string>()): Array<{ table: string; op: 'insert' | 'update' | 'delete'; via: string }> => {
    const f = fnMap.get(name)
    if (!f || seen.has(name) || f.definer) return []
    seen.add(name)
    const out: Array<{ table: string; op: 'insert' | 'update' | 'delete'; via: string }> = []
    const body = f.src.replace(/--[^\n]*/g, '')
    for (const t of byTable.keys()) {
      if (new RegExp(`INSERT\\s+INTO\\s+(public\\.)?${t}\\b`, 'i').test(body)) out.push({ table: t, op: 'insert', via: name })
      if (new RegExp(`\\bUPDATE\\s+(public\\.)?${t}\\b`, 'i').test(body)) out.push({ table: t, op: 'update', via: name })
      if (new RegExp(`DELETE\\s+FROM\\s+(public\\.)?${t}\\b`, 'i').test(body)) out.push({ table: t, op: 'delete', via: name })
    }
    for (const g of fnMap.keys()) if (g !== name && new RegExp(`\\b${g}\\s*\\(`).test(body)) out.push(...reach(g, seen).map((x) => ({ ...x, via: `${name}→${x.via}` })))
    return out
  }
  let broken = 0
  for (const t of trg) {
    // tgtype-bits: 4=INSERT, 8=DELETE, 16=UPDATE
    const srcOps = ([['insert', 4], ['delete', 8], ['update', 16]] as const).filter(([, b]) => (t.tgtype & b) !== 0).map(([o]) => o)
    const writes = reach(t.fn)
    if (!writes.length) continue
    const srcRoles = new Set(srcOps.flatMap((o) => [...rolesFor(t.tbl, o)]))
    for (const w of writes) {
      const missing = [...srcRoles].filter((r) => !rolesFor(w.table, w.op).has(r))
      const status = missing.length ? `❌ BRYDER for ${missing.join(',')}` : 'ok (roller dækket)'
      if (missing.length) broken++
      console.log(`  ${t.tbl}.${t.tgname} [${srcOps.join('/')}] → ${w.via} ${w.op.toUpperCase()} ${w.table} · ${status}`)
    }
  }
  console.log(broken ? `\n❌ ${broken} trigger-sti(er) bryder ved låsen` : '\n✅ ingen trigger-stier bryder ved låsen')
  process.exitCode = broken ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
