/** Tom aktivitet siger hvad der lander der. Koer: npx tsx scripts/activity-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const customer = fs.readFileSync('src/components/modules/customers/customer-activity-overview.tsx', 'utf8')
const lead = fs.readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
const offer = fs.readFileSync('src/components/modules/offers/offer-activity-timeline.tsx', 'utf8')

eq('kunden siger hvad der mangler', customer.includes('Ingen tilbud, sager eller leads på kunden endnu'), true)
eq('sagen aabnes', customer.includes('href={`/dashboard/orders/${sc.id}`}'), true)
eq('sagsnavn ombrydes', customer.includes('break-words">{sc.title}'), true)
eq('tilbudsbeloeb bliver', customer.includes('offer.final_amount'), true)
eq('lead siger at noter lander i loggen', lead.includes('Noter og statusskift lander her.'), true)
eq('tilbud siger hvornår aktivitet kommer', offer.includes('når tilbuddet sendes, ændres eller accepteres'), true)

const timeline = fs.readFileSync('src/components/shared/activity-timeline.tsx', 'utf8')
eq('beskrivelse ombrydes', timeline.includes('text-sm text-gray-900 break-words">{activity.description}'), true)
eq('kompakt liste ombrydes', timeline.includes('text-gray-700 break-words min-w-0">{activity.description}'), true)
eq('kompakt liste klipper ikke', timeline.includes('truncate'), false)
eq('tom kompakt liste bliver', timeline.includes('Ingen aktiviteter'), true)
eq('loft bliver', timeline.includes('activities.slice(0, limit)'), true)

console.log(fail ? `\n${fail} fejl` : '\nactivity-empty-test OK')
process.exitCode = fail ? 1 : 0
