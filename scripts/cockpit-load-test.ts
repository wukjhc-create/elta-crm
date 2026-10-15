/** Cockpittet siger naar taellingen fejler. Groent nul og tomme tekster bliver ved succes. Koer: npx tsx scripts/cockpit-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/dashboard-overview.ts', 'utf8')
eq('mails er ikke besvaret ved fejl', action.includes("overview.errors.mails = 'Kunne ikke hente mails'"), true)
eq('opgaver er ikke 0 ved fejl', action.includes("overview.errors.tasks = 'Kunne ikke hente opgaver'"), true)
eq('sager er ikke 0 ved fejl', action.includes("overview.errors.cases = 'Kunne ikke hente sager'"), true)
eq('tilbud er ikke 0 ved fejl', action.includes("overview.errors.offers = 'Kunne ikke hente tilbud'"), true)
eq('kladder nulstiller ikke opfoelgning', action.includes('overview.offers.staleDraftFailed = true') && !action.includes("overview.errors.offers = 'Kunne ikke hente kladder'"), true)
eq('syv dage bliver', action.includes('OFFER_FOLLOWUP_DAYS'), true)

const view = fs.readFileSync('src/components/dashboard/styrings-cockpit.tsx', 'utf8')
eq('mails er ikke groent nul', view.includes("headline={err ? '—' : requiresResponseCount}"), true)
eq('opgaver er ikke groent nul', view.includes("headline={err ? '—' : openCount}"), true)
eq('sager er ikke groent nul', view.includes("headline={err ? '—' : total}"), true)
eq('tilbud er ikke groent nul', view.includes("headline={err ? '—' : followupCount}"), true)
eq('kladder siger fejl', view.includes('data-testid="cockpit-stale-drafts-error"') && view.includes('Kladder kunne ikke tælles. Det tælles ikke som 0.'), true)
eq('kladde-link bliver', view.includes('data-testid="cockpit-stale-drafts"'), true)
eq('sager siger fejl', view.includes('Kunne ikke hente sager. Det tælles ikke som 0.'), true)
eq('tomme tekster bliver', view.includes('Alle tråde er besvaret.') && view.includes('Ingen overdue opgaver.') && view.includes('Ingen ventende opfølgning.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncockpit-load-test OK')
process.exitCode = fail ? 1 : 0
