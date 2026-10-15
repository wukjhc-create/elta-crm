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
    .replace(/\n/g, '\\n')
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

  return lines.join('\r\n')
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

export interface WorkOrderICSEvent {
  id: string
  /** YYYY-MM-DD */
  date: string
  title: string
  location?: string | null
  description?: string | null
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
    lines.push('BEGIN:VEVENT', `UID:wo-${e.id}@eltasolar.dk`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(next(e.date))}`, `SUMMARY:${escapeICS(e.title)}`)
    if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`)
    if (e.description) lines.push(`DESCRIPTION:${escapeICS(e.description)}`)
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
