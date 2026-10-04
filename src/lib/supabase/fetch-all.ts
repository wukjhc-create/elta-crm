/**
 * Hent ALLE rækker fra en PostgREST-forespørgsel side for side. Supabase/PostgREST returnerer højst max_rows (1000)
 * pr. kald — .limit(2000/5000) afkortes stille (kode-review 2026-10-04). `page` skal bygge forespørgslen med en fast
 * rækkefølge (.order('id')) og .range(from, to).
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows = 200_000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < maxRows; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}
