/** Skelner en fejlet liste fra en tom liste. Ingen I/O. */

export function throwIfQueryError(error: unknown, message = 'Kunne ikke hente rækker'): void {
  if (error) throw new Error(message)
}

export function rowsOrThrow<T>(error: unknown, rows: readonly T[] | null): T[] {
  throwIfQueryError(error)
  return rows ? [...rows] : []
}

export function takenRows<T>(result: PromiseSettledResult<T[]>, label: string, failed: string[]): T[] {
  if (result.status === 'fulfilled') return result.value
  failed.push(label)
  return []
}

export function activityLoadNote(failed: readonly string[]): string | null {
  if (!failed.length) return null
  return `Kunne ikke hente ${failed.join(', ')}. Det tælles ikke som en tom kunde.`
}
