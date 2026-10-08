/**
 * Unit-tests for lib/supabase/in-chunks.ts (selectInChunks, pageWithinIds) med en falsk query-bygger. Ingen DB.
 *   npx tsx scripts/in-chunks-test.ts
 */
import { selectInChunks, pageWithinIds, IN_CHUNK_SIZE } from '../src/lib/supabase/in-chunks'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }

type Row = { id: string; created_at: string; keep: boolean }
const all: Row[] = Array.from({ length: 750 }, (_, i) => ({
  id: `id-${String(i).padStart(4, '0')}`,
  created_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00+00:00`, // mange ens værdier → id afgør
  keep: i % 3 !== 0,
}))
let maxIn = 0
const res = <T>(data: T) => Promise.resolve({ data, error: null })
const filtered = (chunk: string[]) => { maxIn = Math.max(maxIn, chunk.length); return all.filter((r) => chunk.includes(r.id) && r.keep) }

;(async () => {
  const ids = all.map((r) => r.id)
  const got = await selectInChunks<Row>(ids, (chunk) => res(filtered(chunk)))
  ok(got.length === all.filter((r) => r.keep).length && maxIn <= IN_CHUNK_SIZE, `selectInChunks: alle ${got.length} rækker, højst ${IN_CHUNK_SIZE} pr. .in()`)
  let threw = false
  try { await selectInChunks(['a'], () => Promise.resolve({ data: null, error: { message: 'Bad Request' } })) } catch { threw = true }
  ok(threw, 'selectInChunks kaster ved fejl (ingen stille tom liste)')

  const expected = all.filter((r) => r.keep).sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? 1 : -1))
  maxIn = 0
  const idQuery = (chunk: string[]) => ({ range: (from: number, to: number) => res(filtered(chunk).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(from, to + 1)) })
  const pageQuery = (pageIds: string[]) => { maxIn = Math.max(maxIn, pageIds.length); return res(all.filter((r) => pageIds.includes(r.id)).reverse()) }
  const p2 = await pageWithinIds<Row>(ids, { sortKey: 'created_at', ascending: false, offset: 25, pageSize: 25 }, idQuery, pageQuery)
  ok(p2.count === expected.length, `pageWithinIds: antal = alle matchende (${p2.count})`)
  ok(JSON.stringify(p2.rows.map((r) => r.id)) === JSON.stringify(expected.slice(25, 50).map((r) => r.id)), 'side 2 = samme rækkefølge som DB (sortering, derefter id) trods omvendt fase-2-svar')
  ok(maxIn <= IN_CHUNK_SIZE, 'ingen .in() over bidstørrelsen')
  const last = await pageWithinIds<Row>(ids, { sortKey: 'created_at', ascending: false, offset: 10_000, pageSize: 25 }, idQuery, pageQuery)
  ok(last.rows.length === 0 && last.count === expected.length, 'side efter sidste → tom side, korrekt antal')

  console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle in-chunks-tests bestået')
  process.exitCode = bad ? 1 : 0
})()
