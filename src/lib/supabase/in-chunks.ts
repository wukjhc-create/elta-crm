/**
 * `.in(kolonne, ids)` i bidder. PostgREST-kald er GET med id'erne i URL'en, og gatewayen afviser ved ~350+ UUID'er
 * (målt på staging 2026-10-07: 300 OK, 400 "fetch failed", 700 "Bad Request" — `cli.ts in-list-limit`). Fejlen kom
 * tilbage som `error` med `data: null`, så kaldere der kun læste `data ?? []` viste stille tomme navne/tal.
 *
 * Brug: `const rows = await selectInChunks(ids, (chunk) => supabase.from('customers').select('id, name').in('id', chunk))`
 * Kaster ved fejl (kalderen beslutter fallback). Hver bid giver højst 1.000 rækker — til opslag pr. id (≤ 1 række pr. id)
 * er bidstørrelsen 200 derfor sikker; til 1:N-relationer brug fetchAllRows pr. bid.
 */
export const IN_CHUNK_SIZE = 200

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
