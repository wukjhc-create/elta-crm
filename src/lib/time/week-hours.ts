/**
 * Ugeoverblik over en medarbejders timer — dansk kalender (man–søn), ren og
 * testbar. Bruges af "Mine timer" på montørens landingsside.
 */

import { copenhagenParts } from '../utils/copenhagen-time'

export interface WeekLogInput {
  id: string
  start_time: string
  end_time: string | null
  hours: number | string | null
  billable?: boolean | null
  case_number?: string | null
  case_title?: string | null
  work_order_title?: string | null
  description?: string | null
  /** N2: godkendelse (pending/approved/rejected) + evt. afvisningsbegrundelse */
  approval_status?: string | null
  rejection_reason?: string | null
}

export interface WeekDay {
  date: string
  hours: number
}

export interface WeekHours {
  weekStart: string
  weekEnd: string
  days: WeekDay[]
  total: number
  billableTotal: number
  openTimer: boolean
  entries: Array<WeekLogInput & { date: string; clock: string; hoursNum: number }>
}

const r2 = (n: number) => Math.round(n * 100) / 100

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Mandag (dansk kalender) i ugen der indeholder `now`, forskudt `weekOffset` uger. */
export function danishWeekStart(now: Date | number = new Date(), weekOffset = 0): string {
  const today = copenhagenParts(new Date(now)).date
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay() // 0 = søndag
  const sinceMonday = (dow + 6) % 7
  return addDays(today, -sinceMonday + weekOffset * 7)
}

export function summarizeWeekHours(logs: WeekLogInput[], weekStart: string): WeekHours {
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => ({ date: addDays(weekStart, i), hours: 0 }))
  const weekEnd = days[6].date
  let total = 0
  let billableTotal = 0
  let openTimer = false
  const entries: WeekHours['entries'] = []
  for (const l of logs) {
    const { date, clock } = copenhagenParts(l.start_time)
    if (date < weekStart || date > weekEnd) continue
    if (l.end_time == null) {
      openTimer = true
      entries.push({ ...l, date, clock, hoursNum: 0 })
      continue
    }
    const h = Number(l.hours ?? 0) || 0
    // HR-review 2026-10-08 (#5): afviste timer tæller ikke i ugens total (rækken vises stadig med afvisningsgrunden)
    if (l.approval_status !== 'rejected') {
      const day = days.find((d) => d.date === date)
      if (day) day.hours = r2(day.hours + h)
      total += h
      if (l.billable !== false) billableTotal += h
    }
    entries.push({ ...l, date, clock, hoursNum: h })
  }
  entries.sort((a, b) => (a.start_time < b.start_time ? 1 : -1))
  return { weekStart, weekEnd, days, total: r2(total), billableTotal: r2(billableTotal), openTimer, entries }
}
