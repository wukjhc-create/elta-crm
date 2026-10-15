/** Cockpittets klar-til-lukning og timetal siger naar taellingen fejler. Sagstallene bliver. Koer: npx tsx scripts/cockpit-secondary-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/dashboard-overview.ts', 'utf8')
const casesStart = action.indexOf('// Service-cases counts')
const casesEnd = action.indexOf('// Offers')
const cases = action.slice(casesStart, casesEnd)
const closeBlock = cases.slice(cases.indexOf('if (openError)'), cases.indexOf('// N28'))
const timeBlock = cases.slice(cases.indexOf('if (pendingError)'), cases.indexOf('} catch (err)'))

eq('sagsfejl bliver paa de fire taellinger', cases.includes("overview.errors.cases = 'Kunne ikke hente sager'"), true)
eq('klar-blok saetter ikke sagsfejl', closeBlock.includes('overview.errors.cases') === false, true)
eq('timer-blok saetter ikke sagsfejl', timeBlock.includes('overview.errors.cases') === false, true)
eq('aabne sager tjekker fejl', cases.includes('if (openError)'), true)
eq('job tjekker fejl', cases.includes('if (wosError)'), true)
eq('klar-flag', cases.includes('overview.cases.readyToCloseFailed = true'), true)
eq('timer tjekker fejl', cases.includes('if (pendingError)'), true)
eq('timer-flag', cases.includes('overview.cases.timesPendingFailed = true'), true)
eq('timer bruger aekte nul', cases.includes('overview.cases.timesPendingApproval = count ?? 0'), true)
eq('timer skjuler ikke fejl som 0', cases.includes('timesPendingApproval = count || 0') === false, true)
eq('klar-tal bliver', cases.includes('r.success && r.data?.ready'), true)
eq('delvis vurdering siger fejl', cases.includes('if (rs.some((r) => !r.success)) overview.cases.readyToCloseFailed = true'), true)
eq('godkendelse bliver', cases.includes("hasPermission('time_logs.approve')"), true)
eq('vindue bliver', cases.includes('.limit(200)'), true)

const view = fs.readFileSync('src/components/dashboard/styrings-cockpit.tsx', 'utf8')
eq('klar-fejltekst', view.includes('Klar til lukning kunne ikke tælles. Det tælles ikke som 0.'), true)
eq('timer-fejltekst', view.includes('Timer til godkendelse kunne ikke tælles. Det tælles ikke som 0.'), true)
eq('klar-testid', view.includes('data-testid="cockpit-ready-to-close-error"'), true)
eq('timer-testid', view.includes('data-testid="cockpit-times-pending-error"'), true)
eq('klar-linje bliver', view.includes('data-testid="cockpit-ready-to-close"'), true)
eq('timer-linje bliver', view.includes('data-testid="cockpit-times-pending"'), true)
eq('sagsfejltekst bliver', view.includes('Kunne ikke hente sager. Det tælles ikke som 0.'), true)
eq('piller skjules kun ved sagsfejl', view.includes("headline={err ? '—' : total}"), true)
eq('sekundaer vises kun uden sagsfejl', view.includes('{!err && overview.cases.readyToCloseFailed && (') && view.includes('{!err && overview.cases.timesPendingFailed && ('), true)

console.log(fail ? `\n${fail} fejl` : '\ncockpit-secondary-load-test OK')
process.exitCode = fail ? 1 : 0
