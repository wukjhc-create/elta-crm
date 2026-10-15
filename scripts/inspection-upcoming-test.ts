/** Kommende besigtigelser bruger dansk dato og siger naar listen er skaaret ned. Koer: npx tsx scripts/inspection-upcoming-test.ts */
import fs from 'fs'
import { upcomingInspections } from '../src/lib/calendar/agenda'
import { copenhagenParts } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const today = '2026-11-01'
const tasks = [
  { id: 'night', due_date: '2026-10-31T23:30:00.000Z', status: 'pending' },
  { id: 'evening', due_date: '2026-10-31T22:30:00.000Z', status: 'pending' },
  { id: 'later', due_date: '2026-11-02T10:00:00.000Z', status: 'pending' },
  { id: 'done', due_date: '2026-11-02T10:00:00.000Z', status: 'done' },
  { id: 'old', due_date: '2026-10-01T10:00:00.000Z', status: 'pending' },
]
const list = upcomingInspections(tasks, today)
const ids = list.map((t) => t.id).join(',')

eq('nat er 1. november', copenhagenParts('2026-10-31T23:30:00.000Z').date, '2026-11-01')
eq('aften er 31. oktober', copenhagenParts('2026-10-31T22:30:00.000Z').date, '2026-10-31')
eq('dansk dato beholder natten', ids, 'night,later')
const rawKept = tasks.filter((t) => t.due_date >= today && t.status !== 'done').map((t) => t.id).join(',')
eq('raa streng taber natten', rawKept.includes('night'), false)

const many = Array.from({ length: 12 }, (_, i) => ({
  id: `d${i}`,
  due_date: `2026-11-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
  status: 'pending',
}))
eq('funktionen skaerer ikke selv', upcomingInspections(many, today).length, 12)

const view = fs.readFileSync('src/app/dashboard/calendar/calendar-client.tsx', 'utf8')
const upcoming = view.slice(view.indexOf('Kommende besigtigelser'))
eq('listen bruger funktionen', view.includes('upcomingInspections(tasks, today)'), true)
eq('loftet bliver', view.includes('.slice(0, 10)'), true)
eq('siger resten', upcoming.includes('Resten ligger i månedskalenderen.'), true)
eq('tom kommende bliver', upcoming.includes('Book dem fra kunden eller sagen.'), true)
eq('datoen paa kortet bliver', upcoming.includes('new Date(task.due_date).getDate()'), true)

console.log(fail ? `\n${fail} fejl` : '\ninspection-upcoming-test OK')
process.exitCode = fail ? 1 : 0
