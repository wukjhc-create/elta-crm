/** Oevrige cockpit-kort siger naar hentningen fejler. Beloeb og tomme tekster bliver. Koer: npx tsx scripts/cockpit-rest-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/dashboard-overview.ts', 'utf8')
eq('portal siger fejl', action.includes("throw new Error('Kunne ikke hente kundebeskeder')"), true)
eq('nye kunder siger fejl', action.includes("throw new Error('Kunne ikke hente nye kunder')"), true)
eq('leverandorer siger fejl', action.includes("throw new Error('Kunne ikke tjekke leverandører. De tælles ikke som ingen.')"), true)
eq('tilbud og sager siger fejl', action.includes("throw new Error('Kunne ikke tjekke tilbud og sager')"), true)
eq('besigtigelse siger fejl', action.includes("throw new Error('Kunne ikke hente besigtigelser')"), true)
eq('besigtigelse-filter bliver', action.includes(".ilike('title', '%esigtigelse%')"), true)

const src = fs.readFileSync('src/components/dashboard/styrings-cockpit.tsx', 'utf8')
eq('ufaktureret er ikke groent nul', src.includes("headline={err ? '—' : caseCount}"), true)
eq('ufaktureret beloeb bliver', src.includes('kr(c.sale)') && src.includes('data-testid="cockpit-unbilled"'), true)
eq('henvendelser er ikke groent nul', src.includes("headline={err ? '—' : count}") && src.includes('uden kunde eller lead (90 dage)'), true)
eq('forfald er ikke groent nul', src.includes('/dashboard/invoices?filter=overdue') && src.includes("headline={err ? '—' : count}"), true)
eq('forfaldsbeloeb bliver', src.includes('kr(i.amount)'), true)
eq('forfaldsnavn siger fejl', src.includes('data-testid="cockpit-overdue-names-error"') && src.includes('Kundenavne kunne ikke hentes. Det tælles ikke som ukendte.'), true)
eq('forfaldsnavn taelles', action.includes('if (nameError) namesFailed = true'), true)
eq('aabent beloeb bliver', action.includes('openAmount(r, credited)'), true)
eq('portal er ikke groent nul', src.includes("headline={err ? '—' : unreadCount}"), true)
eq('nye kunder er ikke groent nul', src.includes('seneste 30 dage — intet tilbud/sag'), true)
eq('besigtigelse er ikke nul', src.includes("headline={err ? '—' : upcoming.length}"), true)
eq('tomme tekster bliver', src.includes('Alt registreret arbejde er faktureret.') && src.includes('Ingen fakturaer over forfald.') && src.includes('Ingen ulæste kundebeskeder.') && src.includes('Alle nye kunder har tilbud eller sag.') && src.includes('Ingen kommende besigtigelser.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncockpit-rest-load-test OK')
process.exitCode = fail ? 1 : 0
