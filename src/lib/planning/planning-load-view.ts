/** Foerste hentning af arbejdsordrer: loading, fejl eller klar. Ingen I/O. */

export function planningLoadView(hasRows: boolean, error: string | null): 'loading' | 'failed' | 'ready' {
  if (!hasRows && error) return 'failed'
  if (!hasRows) return 'loading'
  return 'ready'
}
