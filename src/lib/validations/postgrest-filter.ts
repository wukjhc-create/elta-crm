/**
 * Sikker værdi i PostgREST-filterstrenge (.or('a.ilike.X,b.ilike.Y')).
 *
 * Fund (2026-10-01): 49 steder byggede `.or(`col.ilike.%${term}%`)` med brugerens søgetekst. PostgREST bruger , ( )
 * som separatorer → en søgning med komma (fx kabeldimension "3x1,5", "Hansen, Jens") FEJLEDE ("failed to parse logic
 * tree"), og tegnene kunne ændre filterets struktur (filter-injektion; RLS begrænser stadig hvad der kan læses).
 *
 * Semantik (bevist mod staging-PostgREST, harness or-filter): inden for "…" fjerner PostgREST ét niveau backslash
 * (\\ → \, \" → "), hvorefter LIKE bruger backslash som escape. Derfor: LIKE-escape FØRST, så citér.
 */

/** LIKE-escape (% _ \) — søgeteksten matches bogstaveligt. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&')
}

/** Citér en værdi til brug i en PostgREST-filterstreng (fx inde i .or()). */
export function pgQuote(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&')}"`
}

/** `col.ilike."%term%"` — indeholder-søgning, bogstaveligt og sikkert i .or(). */
export function ilikeContains(column: string, term: string): string {
  return `${column}.ilike.${pgQuote(`%${escapeLike(term)}%`)}`
}

/** `.or()`-streng: indeholder-søgning på flere kolonner. */
export function orIlikeContains(columns: string[], term: string): string {
  return columns.map((c) => ilikeContains(c, term)).join(',')
}
