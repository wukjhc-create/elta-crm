/**
 * Fælles ROLLBACK-ONLY-ramme til effektive prod-kontroller af RLS-migrationer (som prod-sec-b7-effective.ts).
 *   - ÉN transaktion der ALTID afsluttes med ROLLBACK; der udstedes aldrig COMMIT (SQL med COMMIT afvises)
 *   - hver prøve i sin egen SAVEPOINT, rulles tilbage bagefter (prøverne er uafhængige)
 *   - rigtige prod-profiler: SET LOCAL ROLE authenticated + request.jwt.claims {sub, role}; anon via SET LOCAL ROLE anon
 *   - kun PASS/FAIL + antal/fejlkoder ud — ingen id'er, navne eller indhold
 */
import { Client } from 'pg'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'

export type ProbeRes = { ok: true; rows: any[] } | { ok: false; code: string }
export type ProbeKind = 'NY' | 'UÆNDRET'
export interface ProbeLine { kind: ProbeKind | 'NOT_TESTABLE_PROD'; id: string; ok: boolean; note: string }
export interface ProbeApi {
  q: (sql: string, params?: unknown[]) => Promise<any[]>
  as: (who: { uid: string } | 'anon', sql: string, params?: unknown[], setup?: string[]) => Promise<ProbeRes>
  add: (kind: ProbeKind, id: string, ok: boolean, note: string) => void
  notTestable: (id: string, note: string) => void
  allowed1: (r: ProbeRes) => boolean
  denied: (r: ProbeRes) => boolean
  why: (r: ProbeRes) => string
}

export async function withProdRollbackProbe(label: string, fn: (api: ProbeApi) => Promise<void>): Promise<void> {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref — afbryder')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: `elta-${label}-rollback-only`, statement_timeout: 30000 })
  await client.connect()
  const out: ProbeLine[] = []
  const q = async (sql: string, params: unknown[] = []) => {
    if (/\bcommit\b/i.test(sql)) throw new Error('COMMIT er forbudt i dette script')
    return (await client.query(sql, params)).rows
  }
  const as: ProbeApi['as'] = async (who, sql, params = [], setup) => {
    await q('SAVEPOINT probe')
    try {
      for (const s of setup ?? []) await q(s)
      if (who === 'anon') await q('SET LOCAL ROLE anon')
      else {
        await q('SET LOCAL ROLE authenticated')
        await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.uid, role: 'authenticated' })])
      }
      return { ok: true, rows: await q(sql, params) }
    } catch (e) {
      return { ok: false, code: (e as { code?: string }).code ?? 'fejl' }
    } finally {
      await q('ROLLBACK TO SAVEPOINT probe')
      await q('RESET ROLE')
    }
  }
  const api: ProbeApi = {
    q, as,
    add: (kind, id, ok, note) => out.push({ kind, id, ok, note }),
    notTestable: (id, note) => out.push({ kind: 'NOT_TESTABLE_PROD', id, ok: true, note }),
    allowed1: (r) => r.ok && r.rows.length === 1,
    denied: (r) => !r.ok || r.rows.length === 0,
    why: (r) => (r.ok ? `rækker=${r.rows.length}` : r.code),
  }
  try {
    await q('BEGIN')
    await q('SET LOCAL statement_timeout = 30000')
    console.log(`[${label}] prod:${ref.slice(0, 6)}… | ÉN transaktion, ROLLBACK til sidst — intet committes`)
    await fn(api)
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end().catch(() => {})
  }
  for (const k of out) console.log(`  ${k.kind === 'NOT_TESTABLE_PROD' ? 'NOT_TESTABLE_PROD' : k.ok ? 'PASS' : 'FAIL'}  ${k.kind === 'NOT_TESTABLE_PROD' ? '' : `[${k.kind}] `}${k.id} — ${k.note}`)
  const ny = out.filter((k) => k.kind === 'NY'), uae = out.filter((k) => k.kind === 'UÆNDRET')
  console.log(`  [NY] ${ny.filter((k) => k.ok).length}/${ny.length} · [UÆNDRET] ${uae.filter((k) => k.ok).length}/${uae.length} · transaktion rullet tilbage`)
  process.exitCode = out.some((k) => !k.ok) ? 2 : 0
}

export function runMain(fn: () => Promise<void>): void {
  fn().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
}
