/**
 * `.in(kolonne, ids)` i bidder. PostgREST-kald er GET med id'erne i URL'en, og gatewayen afviser ved ~350+ UUID'er
 * (målt på staging 2026-10-07: 300 OK, 400 "fetch failed", 700 "Bad Request" — `cli.ts in-list-limit`). Fejlen kom
 * tilbage som `error` med `data: null`, så kaldere der kun læste `data ?? []` viste stille tomme navne/tal.
 *
 * Brug: `const rows = await selectInChunks(ids, (chunk) => supabase.from('customers').select('id, name').in('id', chunk))`
 * Kaster ved fejl (kalderen beslutter fallback). Hver bid giver højst 1.000 rækker — til opslag pr. id (≤ 1 række pr. id)
 * er bidstørrelsen 200 derfor sikker; til 1:N-relationer brug fetchAllRows pr. bid.
 */
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export const IN_CHUNK_SIZE = 200

/** Bygger med ALLE filtre + `.order('id')` (stabil paginering i fase 1); hjælperen sætter selv `.range()`. */
type RangeQuery = { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> }

/**
 * Pagineret liste begrænset til et (stort) id-sæt — uden én .in() med alle id'er.
 *   Fase 1: pr. bid hentes kun `id` + sorteringskolonnen (med alle øvrige filtre, `idQuery`), sorteres og pagineres i
 *           hukommelsen (samme rækkefølge som PostgREST: sorteringsværdi, derefter id) → antal = alle matchende.
 *   Fase 2: sidens rækker (≤ pageSize id'er) hentes fuldt via `pageQuery` og returneres i fase 1's rækkefølge.
 * Sorteringsværdien sammenlignes som tekst (ISO-tidsstempler/datoer sorterer korrekt); null sidst.
 */
export async function pageWithinIds<T extends { id: string }>(
  ids: readonly string[],
  opts: { sortKey: string; ascending: boolean; offset: number; pageSize: number },
  idQuery: (chunk: string[]) => RangeQuery,
  pageQuery: (pageIds: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ rows: T[]; count: number }> {
  const unique = Array.from(new Set(ids))
  const keys: Array<{ id: string; sort: string | null }> = []
  for (let k = 0; k < unique.length; k += IN_CHUNK_SIZE) {
    const chunk = unique.slice(k, k + IN_CHUNK_SIZE)
    const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      idQuery(chunk).range(from, to) as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>)
    for (const r of rows) keys.push({ id: String(r.id), sort: r[opts.sortKey] == null ? null : String(r[opts.sortKey]) })
  }
  const dir = opts.ascending ? 1 : -1
  keys.sort((a, b) => {
    if (a.sort !== b.sort) {
      if (a.sort == null) return 1
      if (b.sort == null) return -1
      return a.sort < b.sort ? -dir : dir
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const pageIds = keys.slice(opts.offset, opts.offset + opts.pageSize).map((k) => k.id)
  if (!pageIds.length) return { rows: [], count: keys.length }
  const { data, error } = await pageQuery(pageIds)
  if (error) throw error instanceof Error ? error : new Error(String((error as { message?: string }).message ?? 'page query failed'))
  const byId = new Map(((data ?? []) as T[]).map((r) => [r.id, r]))
  return { rows: pageIds.map((id) => byId.get(id)).filter((r): r is T => !!r), count: keys.length }
}

export async function selectInChunks<T>(
  ids: readonly string[],
  query: (chunk: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
  chunkSize = IN_CHUNK_SIZE,
): Promise<T[]> {
  const unique = Array.from(new Set(ids))
  const out: T[] = []
  for (let k = 0; k < unique.length; k += chunkSize) {
    const { data, error } = await query(unique.slice(k, k + chunkSize))
    if (error) throw error instanceof Error ? error : new Error(String((error as { message?: string }).message ?? 'in-chunk query failed'))
    out.push(...((data ?? []) as T[]))
  }
  return out
}
