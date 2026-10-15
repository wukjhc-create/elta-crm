/** Tilbuddets aktivitet siger naar loggen ikke kan hentes. En aekte tom log bliver i tidslinjen. Koer: npx tsx scripts/offer-activities-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const start = src.indexOf('async function loadActivities')
const endMark = 'setIsLoadingActivities(false)'
const fn = src.slice(start, src.indexOf(endMark, start) + endMark.length)
eq('funktionen findes', start > 0, true)
eq('success saetter listen', fn.includes('setActivities(result.data)'), true)
eq('success rydder fejl', fn.includes('setActivitiesError(null)'), true)
eq('fejl teksten', fn.includes("setActivitiesError(result.error || 'Kunne ikke hente aktiviteter')"), true)
eq('fejl viser ikke det forrige tilbud', fn.includes('setActivities([])'), true)
eq('banner', src.includes('data-testid="offer-activities-load-error"') && src.includes('Det tælles ikke som ingen aktiviteter.'), true)
eq('tidslinje kun uden fejl', src.includes('{!activitiesError && ('), true)
eq('tidslinjen kaldes stadig', src.includes('<OfferActivityTimeline activities={activities} />'), true)

const timeline = fs.readFileSync('src/components/modules/offers/offer-activity-timeline.tsx', 'utf8')
eq('aegte tom bliver', timeline.includes('Ingen aktiviteter endnu'), true)
eq('tom tekst bliver', timeline.includes('når tilbuddet sendes, ændres eller accepteres'), true)
eq('tiden bliver', timeline.includes("copenhagenDateTimeLabel(activity.created_at, 'short', false)"), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-activities-load-test OK')
process.exitCode = fail ? 1 : 0
