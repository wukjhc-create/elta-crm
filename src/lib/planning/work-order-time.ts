/**
 * 00227 (Henrik 2026-10-15): valgfrit tidspunkt + estimeret varighed på arbejdsordrer. Tom = som før (heldag / ukendt
 * varighed) — intet gættes. Rene funktioner, bruges af server actions og tests.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** 'HH:MM' (00:00–23:59) eller tom → null */
export function parseStartTime(input: string | null | undefined): ParseResult<string | null> {
  const s = (input ?? '').trim()
  if (!s) return { ok: true, value: null }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (!m) return { ok: false, error: 'Starttid skal være i formatet TT:MM' }
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return { ok: false, error: 'Starttid skal være mellem 00:00 og 23:59' }
  return { ok: true, value: `${String(h).padStart(2, '0')}:${m[2]}` }
}

/** dansk eller punktum-decimal; tom → null; 0 < x <= 24 */
export function parseEstimatedHours(input: string | number | null | undefined): ParseResult<number | null> {
  if (input === null || input === undefined || (typeof input === 'string' && !input.trim())) return { ok: true, value: null }
  const n = typeof input === 'number' ? input : Number(input.trim().replace(',', '.'))
  if (!Number.isFinite(n)) return { ok: false, error: 'Estimerede timer skal være et tal' }
  if (n <= 0 || n > 24) return { ok: false, error: 'Estimerede timer skal være mellem 0 og 24' }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

/** "08:00–12:00" / "08:00" / "4 t" / '' til visning */
export function formatWorkOrderTime(startTime: string | null | undefined, estimatedHours: number | string | null | undefined): string {
  const st = startTime ? startTime.slice(0, 5) : null
  const h = estimatedHours == null || estimatedHours === '' ? null : Number(estimatedHours)
  if (st && h != null && Number.isFinite(h)) {
    const [hh, mm] = st.split(':').map(Number)
    const end = hh * 60 + mm + Math.round(h * 60)
    if (end < 24 * 60) return `${st}–${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
    return `${st} (${String(h).replace('.', ',')} t)`
  }
  if (st) return st
  if (h != null && Number.isFinite(h)) return `${String(h).replace('.', ',')} t`
  return ''
}

/** Sortering inden for en dag: med tidspunkt først (stigende), derefter uden */
export function compareByStartTime(a: { start_time?: string | null; created_at?: string }, b: { start_time?: string | null; created_at?: string }): number {
  if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time)
  if (a.start_time) return -1
  if (b.start_time) return 1
  return (a.created_at ?? '').localeCompare(b.created_at ?? '')
}

/** Overlap mellem to job samme dag (kræver tidspunkt + varighed på begge) */
export function workOrdersOverlap(a: { start_time?: string | null; estimated_hours?: number | string | null }, b: { start_time?: string | null; estimated_hours?: number | string | null }): boolean {
  const span = (w: typeof a) => {
    if (!w.start_time || w.estimated_hours == null || w.estimated_hours === '') return null
    const [h, m] = w.start_time.slice(0, 5).split(':').map(Number)
    const s = h * 60 + m
    return [s, s + Math.round(Number(w.estimated_hours) * 60)] as const
  }
  const x = span(a), y = span(b)
  if (!x || !y) return false
  return x[0] < y[1] && y[0] < x[1]
}
