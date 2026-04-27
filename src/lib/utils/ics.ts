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
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

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
  const startHour = parseInt(dtStart.slice(9, 11), 10)
  const endHour = startHour + durationHours
  const dtEnd = dtStart.slice(0, 9) + String(endHour).padStart(2, '0') + dtStart.slice(11)

  const now = new Date()
  const dtstamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}Z`

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
