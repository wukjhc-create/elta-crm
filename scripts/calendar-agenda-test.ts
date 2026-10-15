/** Dag/uge-kalender: aftaler følger dansk dato, samme regel som måneden. Kør: npx tsx scripts/calendar-agenda-test.ts */
import fs from 'fs'
import { agendaClock, agendaForDates, type AgendaSource } from '../src/lib/calendar/agenda'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`)
}

const src = (partial: Partial<AgendaSource> & Pick<AgendaSource, 'id' | 'at' | 'kind'>): AgendaSource => ({
  title: partial.id,
  status: 'pending',
  ...partial,
})

// Sommer (UTC+2): 14/10 22:30Z = 15/10 00:30 dansk. Datoen uden T bliver på 14/10.
const days = agendaForDates([
  src({ id: 'nat', kind: 'callback', at: '2026-10-14T22:30:00.000Z' }),
  src({ id: 'dato', kind: 'inspection', at: '2026-10-14', description: 'Adresse: Vej 1' }),
  src({ id: 'sen', kind: 'reminder', at: '2026-10-15T12:00:00.000Z', title: 'Bestil arbejdstøj' }),
  src({ id: 'udenfor', kind: 'callback', at: '2026-10-16T08:00:00.000Z' }),
  src({ id: 'uden-tid', kind: 'inspection', at: null }),
], ['2026-10-14', '2026-10-15'])

eq('tomme dage er med, og rækkefølgen er den ønskede', days.map((d) => d.date), ['2026-10-14', '2026-10-15'])
eq('22:30Z i sommertiden er næste danske dag', days[0].items.map((i) => i.id), ['dato'])
eq('dato uden klokkeslæt har intet tidspunkt', days[0].items[0].clock, null)
eq('næste dag har nattens opkald før eftermiddagens påmindelse', days[1].items.map((i) => i.id), ['nat', 'sen'])
eq('opkald kl. 00:30 dansk', days[1].items[0].clock, '00:30')
eq('påmindelse kl. 14:00 dansk', days[1].items[1].clock, '14:00')
eq('kundenavn og id følger med, ikke mere', days[0].items[0], {
  id: 'dato', title: 'dato', kind: 'inspection', status: 'pending', clock: null, customerId: null, customerName: null,
})

// Vinter (UTC+1 fra 25/10 2026): 25/10 23:30Z = 26/10 00:30 dansk.
const winter = agendaForDates([
  src({ id: 'vinter', kind: 'callback', at: '2026-10-25T23:30:00.000Z' }),
], ['2026-10-25', '2026-10-26'])
eq('vinter: 23:30Z er næste danske dag', winter.map((d) => d.items.map((i) => i.id)), [[], ['vinter']])
eq('vinterklokken er 00:30', winter[1].items[0].clock, '00:30')

// Samme id som både besigtigelse og opkald: besigtigelsen bliver.
const dupe = agendaForDates([
  src({ id: 'samme', kind: 'callback', at: '2026-10-14T08:00:00.000Z', title: 'Opkald' }),
  src({ id: 'samme', kind: 'inspection', at: '2026-10-14T08:00:00.000Z', title: 'Besigtigelse', description: 'Tidspunkt: formiddag' }),
], ['2026-10-14'])
eq('besigtigelse vinder over opkald', dupe[0].items.map((i) => i.kind), ['inspection'])
eq('tidspunkt i beskrivelsen vinder over tidsstemplet', dupe[0].items[0].clock, 'formiddag')

eq('kl. 10:00 i teksten', agendaClock('2026-10-14T00:00:00.000Z', 'Mød kunden kl. 10:00 ved tavlen'), '10:00')
eq('ren dato har intet klokkeslæt', agendaClock('2026-10-14', null), null)

const order = agendaForDates([
  src({ id: 'senere', kind: 'inspection', at: '2026-10-14T12:00:00.000Z', title: 'Åse' }),
  src({ id: 'først', kind: 'callback', at: '2026-10-14T07:00:00.000Z', title: 'Bo' }),
  src({ id: 'uden', kind: 'reminder', at: '2026-10-14', title: 'Abe' }),
  src({ id: 'udført', kind: 'reminder', at: '2026-10-14T07:30:00.000Z', title: 'Cen', status: 'done' }),
], ['2026-10-14'])
eq('sortering er klokkeslæt, udført bliver, uden tid til sidst', order[0].items.map((i) => i.id), ['først', 'udført', 'senere', 'uden'])

const textOrder = agendaForDates([
  src({ id: 'ti', kind: 'inspection', at: '2026-10-14', description: 'kl. 10:00', title: 'Ti' }),
  src({ id: 'ni', kind: 'inspection', at: '2026-10-14', description: 'kl. 9:00', title: 'Ni' }),
], ['2026-10-14'])
eq('kl. 9:00 kommer før kl. 10:00', textOrder[0].items.map((i) => i.id), ['ni', 'ti'])

const view = fs.readFileSync('src/app/dashboard/calendar/calendar-agenda.tsx', 'utf8')
eq('agendatitel ombrydes', view.includes('text-xs text-gray-500 break-words">{item.title}'), true)
eq('tom dag bliver', view.includes('Ingen besigtigelser, opkald eller påmindelser denne dag.'), true)

if (fail) {
  console.log(`${fail} FAIL`)
  process.exit(1)
}
console.log('calendar-agenda-test OK')
