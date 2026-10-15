/** Aktivitetens dato er københavnsk. Beløb og tom liste bliver. Kør: npx tsx scripts/activity-stamp-time-test.ts */
import fs from 'fs'
import { copenhagenDateLabel, copenhagenDateTimeLabel, copenhagenDayMonth } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = '2026-01-15T23:30:00.000Z'
eq('dato er naeste dag', copenhagenDateLabel(late).startsWith('16'), true)
eq('dato er ikke utc-dagen', copenhagenDateLabel(late).startsWith('15'), false)
eq('klokken er 00.30', copenhagenDateTimeLabel(late).includes('00.30') || copenhagenDateTimeLabel(late).includes('00:30'), true)
eq('kort dag er 16/1', copenhagenDayMonth(late), '16/1')
eq('kort dag er ikke 15/1', copenhagenDayMonth(late) === '15/1', false)

const customer = fs.readFileSync('src/components/modules/customers/customer-activity-overview.tsx', 'utf8')
eq('lead bruger hjaelperen', customer.includes('copenhagenDateLabel(lead.created_at)'), true)
eq('tilbud bruger hjaelperen', customer.includes('copenhagenDateLabel(offer.created_at)'), true)
eq('projekt bruger hjaelperen', customer.includes('copenhagenDateLabel(sq.created_at)'), true)
eq('sag bruger hjaelperen', customer.includes('copenhagenDateLabel(sc.created_at)'), true)
eq('beloeb bliver', customer.includes('offer.final_amount'), true)
eq('tom liste bliver', customer.includes('Ingen tilbud, sager eller leads på kunden endnu'), true)

const timeline = fs.readFileSync('src/components/shared/activity-timeline.tsx', 'utf8')
eq('tidslinje bruger hjaelperen', timeline.includes('copenhagenDateTimeLabel(activity.created_at)'), true)
eq('kompakt liste bruger hjaelperen', timeline.includes('copenhagenDayMonth(activity.created_at)'), true)
eq('beskrivelse ombrydes', timeline.includes('text-sm text-gray-900 break-words">{activity.description}'), true)
eq('kompakt liste klipper ikke', timeline.includes('truncate'), false)
eq('loft bliver', timeline.includes('activities.slice(0, limit)'), true)

console.log(fail ? `\n${fail} fejl` : '\nactivity-stamp-time-test OK')
process.exitCode = fail ? 1 : 0
