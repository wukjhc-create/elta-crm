/**
 * Leverandørlisten: en fejlet hentning er ikke et tomt katalog.
 * En senere fejl beholder det sidste vellykkede tal (count > 0 → ready).
 */
export function supplierListView(
  loaded: boolean,
  error: string | null,
  count: number,
): 'loading' | 'failed' | 'empty' | 'ready' {
  if (!loaded && error) return 'failed'
  if (!loaded) return 'loading'
  if (error && count === 0) return 'failed'
  if (count === 0) return 'empty'
  return 'ready'
}
