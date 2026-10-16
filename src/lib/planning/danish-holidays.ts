/**
 * Danske helligdage (officielle) — beregnes i kode, ingen tabel (Henrik 2026-10-15, planlægning). Store bededag er
 * afskaffet fra 2024. Grundlovsdag, juleaften og nytårsaften er IKKE officielle helligdage og medtages ikke (intet gæt
 * om lokale aftaler). Ren funktion.
 */

/** Påskedag (gregoriansk, anonym algoritme) som 'YYYY-MM-DD' */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function danishHolidays(year: number): Map<string, string> {
  const e = easterSunday(year)
  const m = new Map<string, string>([
    [`${year}-01-01`, 'Nytårsdag'],
    [addDays(e, -3), 'Skærtorsdag'],
    [addDays(e, -2), 'Langfredag'],
    [e, 'Påskedag'],
    [addDays(e, 1), '2. påskedag'],
    [addDays(e, 39), 'Kristi himmelfartsdag'],
    [addDays(e, 49), 'Pinsedag'],
    [addDays(e, 50), '2. pinsedag'],
    [`${year}-12-25`, 'Juledag'],
    [`${year}-12-26`, '2. juledag'],
  ])
  if (year < 2024) m.set(addDays(e, 26), 'Store bededag')
  return m
}

const cache = new Map<number, Map<string, string>>()

/** Navnet på helligdagen for datoen, ellers null */
export function holidayName(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const y = Number(date.slice(0, 4))
  if (!cache.has(y)) cache.set(y, danishHolidays(y))
  return cache.get(y)!.get(date) ?? null
}
