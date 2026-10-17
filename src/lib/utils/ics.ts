/**
 * ICS (iCalendar) file generator for besigtigelse bookings.
 */

interface ICSEventOptions {
  title: string
  location?: string
  description?: string
  startDate: string // YYYY-MM-DD
  startTime?: string // e.g. "08:00" or time slot string
  durationHours?: number
}

function formatICSDate(dateStr: string, time?: string): string {
  // 'YYYY-MM-DD' læses som UTC-midnat → UTC-getters (lokale getters gav forkert dag på en server vest for UTC)
  const d = new Date(dateStr)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')

  if (time) {
    // Try to extract HH:MM from time string (e.g. "08:00–12:00" → "08:00")
    const match = time.match(/(\d{2}):(\d{2})/)
    if (match) {
      return `${year}${month}${day}T${match[1]}${match[2]}00`
    }
  }
  // Default to 08:00
  return `${year}${month}${day}T080000`
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    // TP-9 (review 2026-10-17): også CR/CRLF (før rå CR midt i SUMMARY/DESCRIPTION → brudt fil i nogle kalendere)
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** TP-9: RFC 5545 linjefoldning — højst 75 oktetter pr. linje, fortsættelse starter med mellemrum (UTF-8-sikker). */
export function foldICSLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let curBytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74 // fortsættelseslinjer har et førende mellemrum
    if (curBytes + b > limit) { parts.push(cur); cur = ''; curBytes = 0 }
    cur += ch
    curBytes += b
  }
  if (cur) parts.push(cur)
  return parts.join('\r\n ')
}

function generateUID(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@eltasolar.dk`
}

export function generateBesigtigelseICS(options: ICSEventOptions): string {
  const { title, location, description, startDate, startTime, durationHours = 2 } = options

  const dtStart = formatICSDate(startDate, startTime)
  // Calculate end time
  // Mail-review 2026-10-08 (#10): time + varighed uden dato-overløb gav fx T240000/T250000 (ugyldig fil) ved booking
  // kl. 22+. Vægurs-aritmetik i UTC (TZID angiver zonen) ruller korrekt over midnat/måned.
  const wall = new Date(Date.UTC(
    Number(dtStart.slice(0, 4)), Number(dtStart.slice(4, 6)) - 1, Number(dtStart.slice(6, 8)),
    Number(dtStart.slice(9, 11)), Number(dtStart.slice(11, 13)) + Math.round(durationHours * 60),
  ))
  const p2 = (n: number) => String(n).padStart(2, '0')
  const dtEnd = `${wall.getUTCFullYear()}${p2(wall.getUTCMonth() + 1)}${p2(wall.getUTCDate())}T${p2(wall.getUTCHours())}${p2(wall.getUTCMinutes())}00`

  const dtstamp = icsUtcStamp(new Date())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Elta Solar//Besigtigelse//DA',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${generateUID()}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=Europe/Copenhagen:${dtStart}`,
    `DTEND;TZID=Europe/Copenhagen:${dtEnd}`,
    `SUMMARY:${escapeICS(title)}`,
  ]

  if (location) {
    lines.push(`LOCATION:${escapeICS(location)}`)
  }

  if (description) {
    lines.push(`DESCRIPTION:${escapeICS(description)}`)
  }

  lines.push(
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Besigtigelse om 1 time',
    'END:VALARM',
    'END:VEVENT',
    // Timezone definition for Europe/Copenhagen
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Copenhagen',
    'BEGIN:STANDARD',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
    'END:VCALENDAR',
  )

  return lines.map(foldICSLine).join('\r\n') // TP-9: foldning
}

/**
 * Extract start time from a time slot string like "Formiddag (08:00–12:00)"
 */
export function extractStartTimeFromSlot(timeSlot: string): string {
  const match = timeSlot.match(/(\d{2}:\d{2})/)
  return match ? match[1] : '08:00'
}

/**
 * Estimate duration from a time slot string like "Formiddag (08:00–12:00)"
 */
export function extractDurationFromSlot(timeSlot: string): number {
  const match = timeSlot.match(/(\d{2}):(\d{2})[–-](\d{2}):(\d{2})/)
  if (match) {
    const startH = parseInt(match[1], 10)
    const endH = parseInt(match[3], 10)
    return endH - startH
  }
  return 2 // default 2 hours
}

/** DTSTAMP i UTC (suffiks Z kræver UTC-felter — lokale felter var kun korrekte fordi serveren kører i UTC) */
export function icsUtcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

const CPH_VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Copenhagen',
  'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'END:STANDARD',
  'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'END:DAYLIGHT',
  'END:VTIMEZONE',
]

export interface WorkOrderICSEvent {
  id: string
  /** YYYY-MM-DD */
  date: string
  title: string
  location?: string | null
  description?: string | null
  /** 00227: 'HH:MM' lokal tid — giver en tidsbestemt begivenhed (ellers heldag) */
  startTime?: string | null
  /** 00227: varighed i timer — sluttid; uden varighed ingen gættet sluttid */
  estimatedHours?: number | null
}

/**
 * Fokus E 2026-10-15: montørens egne arbejdsordrer som kalenderfil (heldagsbegivenheder — arbejdsordrer har kun dato).
 * Fast UID pr. arbejdsordre, så en ny import opdaterer i stedet for at dublere.
 */
export function generateWorkOrdersICS(events: WorkOrderICSEvent[], now: Date = new Date()): string {
  const stamp = icsUtcStamp(now)
  const ymd = (d: string) => d.replace(/-/g, '')
  const next = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Elta Solar//Arbejdsordrer//DA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:ELTA job']
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue
    const st = e.startTime && /^\d{2}:\d{2}/.test(e.startTime) ? e.startTime.slice(0, 5) : null
    if (st) {
      const startLocal = `${ymd(e.date)}T${st.replace(':', '')}00`
      lines.push('BEGIN:VEVENT', `UID:wo-${e.id}@eltasolar.dk`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Copenhagen:${startLocal}`)
      if (e.estimatedHours != null && Number.isFinite(e.estimatedHours) && e.estimatedHours > 0) {
        const [h, m] = st.split(':').map(Number)
        const wall = new Date(Date.UTC(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)) - 1, Number(e.date.slice(8, 10)), h, m + Math.round(e.estimatedHours * 60)))
        const p2 = (n: number) => String(n).padStart(2, '0')
        lines.push(`DTEND;TZID=Europe/Copenhagen:${wall.getUTCFullYear()}${p2(wall.getUTCMonth() + 1)}${p2(wall.getUTCDate())}T${p2(wall.getUTCHours())}${p2(wall.getUTCMinutes())}00`)
      }
      lines.push(`SUMMARY:${escapeICS(e.title)}`)
    } else {
      lines.push('BEGIN:VEVENT', `UID:wo-${e.id}@eltasolar.dk`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(next(e.date))}`, `SUMMARY:${escapeICS(e.title)}`)
    }
    if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`)
    if (e.description) lines.push(`DESCRIPTION:${escapeICS(e.description)}`)
    lines.push(st ? 'TRANSP:OPAQUE' : 'TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  if (events.some((e) => e.startTime)) lines.push(...CPH_VTIMEZONE)
  lines.push('END:VCALENDAR')
  return lines.map(foldICSLine).join('\r\n') // TP-9: foldning
}

/**
 * W-9 (pilot-review 2026-10-15): én opfølgning (fx på et lead) som tidsbestemt kalenderbegivenhed i Københavnstid med
 * alarm på tidspunktet. 15 min. varighed — kun en markering i kalenderen, ingen gættet arbejdstid.
 */
export function generateFollowUpICS(e: { id: string; date: string; startTime: string; title: string; description?: string | null }, now: Date = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !/^\d{2}:\d{2}$/.test(e.startTime)) throw new Error('Ugyldig dato/tid')
  const [h, m] = e.startTime.split(':').map(Number)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const end = new Date(Date.UTC(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)) - 1, Number(e.date.slice(8, 10)), h, m + 15))
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Elta Solar//Opfoelgning//DA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${e.id}@eltasolar.dk`, `DTSTAMP:${icsUtcStamp(now)}`,
    `DTSTART;TZID=Europe/Copenhagen:${e.date.replace(/-/g, '')}T${p2(h)}${p2(m)}00`,
    `DTEND;TZID=Europe/Copenhagen:${end.getUTCFullYear()}${p2(end.getUTCMonth() + 1)}${p2(end.getUTCDate())}T${p2(end.getUTCHours())}${p2(end.getUTCMinutes())}00`,
    `SUMMARY:${escapeICS(e.title)}`,
  ]
  if (e.description) lines.push(`DESCRIPTION:${escapeICS(e.description)}`)
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeICS(e.title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', ...CPH_VTIMEZONE, 'END:VCALENDAR')
  return lines.map(foldICSLine).join('\r\n') // TP-9: foldning
}
