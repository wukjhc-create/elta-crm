/**
 * Dansk lokaltid (Europe/Copenhagen) <-> UTC, sommertids-korrekt. Serveren kører i UTC (Vercel), så lokal dato/klokkeslæt
 * fra brugeren må aldrig konverteres med en fast offset eller servertid.
 */
const TZ = 'Europe/Copenhagen'

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function parts(ms: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second }
}

/** Offset (ms) mellem København og UTC på et givent tidspunkt (+1 t vinter, +2 t sommer). */
function offsetAt(ms: number): number {
  const p = parts(ms)
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000
}

/** 'YYYY-MM-DD' + 'HH:mm' i dansk lokaltid -> ISO (UTC). Ved sommertidens ikke-eksisterende time bruges tiden efter skiftet. */
export function copenhagenLocalToIso(date: string, clock: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = clock.split(':').map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  let ms = asUtc - offsetAt(asUtc)
  const second = asUtc - offsetAt(ms)
  if (second !== ms) ms = second
  return new Date(ms).toISOString()
}

/** ISO/Date -> { date: 'YYYY-MM-DD', clock: 'HH:mm' } i dansk lokaltid. */
export function copenhagenParts(value: string | Date): { date: string; clock: string } {
  const p = parts(new Date(value).getTime())
  const z = (n: number) => String(n).padStart(2, '0')
  return { date: `${p.y}-${z(p.mo)}-${z(p.d)}`, clock: `${z(p.h)}:${z(p.mi)}` }
}

/**
 * Hele kalenderdage fra en dato (YYYY-MM-DD eller ISO) til "nu" — i DANSK
 * kalender, uafhængigt af serverens tidszone. Forfald: faktura med forfald
 * 14/10 er 1 dag over forfald fra 15/10 kl. 00:00 dansk tid (før: først kl.
 * 02:00, fordi "T00:00:00" blev tolket som UTC på Vercel).
 */
export function calendarDaysSince(dateIso: string, now: Date | number = new Date()): number {
  const from = dateIso.slice(0, 10)
  const today = copenhagenParts(new Date(now)).date
  const toUtc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  return Math.round((toUtc(today) - toUtc(from)) / 86_400_000)
}
