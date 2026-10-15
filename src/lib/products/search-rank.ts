/**
 * W-11 (pilot-review 2026-10-15): leverandørsøgning. Før: hele sætningen som én ILIKE ("kabel 3x1,5" fandt ikke
 * "Kabel PVIK 3G1,5"), sorteret efter kostpris → de billigste vilkårlige varer øverst. Nu: hvert ord skal matche
 * (varenr., navn eller EAN), og resultatet rangeres efter relevans; pris kun som tie-breaker. Rene funktioner.
 */

/** Søgeord: op til 5 ord, mindst 1 tegn, uden PostgREST-specialtegn */
export function searchWords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[(),"'%*\\]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 1)
    .slice(0, 5)
}

export interface RankFields { sku: string | null | undefined; name: string | null | undefined; ean: string | null | undefined; cost: number | null | undefined }

/** Lavere er bedre: 0 = præcist varenr./EAN, 1 = navn starter med søgningen, 2 = alle ord i navnet, 3 = resten */
export function relevance(p: RankFields, query: string): number {
  const q = query.trim().toLowerCase()
  const sku = (p.sku ?? '').toLowerCase()
  const ean = (p.ean ?? '').toLowerCase()
  const name = (p.name ?? '').toLowerCase()
  if (q && (sku === q || ean === q)) return 0
  if (q && name.startsWith(q)) return 1
  const words = searchWords(query)
  if (words.length && words.every((w) => name.includes(w))) return 2
  return 3
}

/** Relevans først, derefter laveste kostpris (0/ukendt sidst) */
export function rankBy<T>(rows: T[], query: string, fields: (row: T) => RankFields): T[] {
  const key = rows.map((r) => ({ r, f: fields(r) })).map((x) => ({ r: x.r, rel: relevance(x.f, query), cost: x.f.cost || Infinity }))
  key.sort((a, b) => (a.rel - b.rel) || (a.cost - b.cost))
  return key.map((k) => k.r)
}
