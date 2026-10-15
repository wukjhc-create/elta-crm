/** Planlaegning behandler en fejlet arbejdsordretaelling som ukendt, ikke som 0. Koer: npx tsx scripts/planning-count-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/agents/planning-agent.ts', 'utf8')
const countFn = src.slice(src.indexOf('async function activeWorkOrderCount'), src.indexOf('async function unplannedCases'))
eq('fejl er ikke 0', countFn.includes('if (error) return null'), true)
eq('aekte nul bliver', countFn.includes('return count ?? 0'), true)
eq('fejl foer nul', countFn.indexOf('if (error) return null') < countFn.indexOf('return count ?? 0'), true)
eq('annulleret taeller ikke', countFn.includes(".neq('status', 'cancelled')"), true)

eq('koersel springer ukendt tal over', src.includes("reason: 'kunne ikke tælle arbejdsordrer'"), true)
eq('udfoerelse opretter ikke ved ukendt tal', src.includes("error: 'forældet forslag: kunne ikke tælle arbejdsordrer'"), true)
eq('dagens job fejler lukket', src.includes("error: 'forældet forslag: kunne ikke tælle dagens job'"), true)
eq('belastning fejler lukket', src.includes("error: 'Kunne ikke hente planlægning'"), true)
eq('eksisterende forslag tjekkes', src.includes("reason: 'kunne ikke tjekke eksisterende forslag'"), true)
eq('listefejl er ikke tom', src.includes("throw new Error('Kunne ikke tælle arbejdsordrer')"), true)
eq('sagsfejl bliver', src.includes("error: msg === 'Kunne ikke tælle arbejdsordrer' ? msg : 'Kunne ikke hente sager'"), true)
eq('blokering bliver', src.includes('if (activeWorkOrders > 0) return \'sagen har allerede en arbejdsordre\''), true)
eq('nul job er stadig ok', src.includes('planningBlocker(c, active)'), true)

const test = fs.readFileSync('scripts/agent-planning-test.ts', 'utf8')
eq('enhedstest: 0 job er ok', test.includes('planningBlocker(C(), 0) === null'), true)
eq('enhedstest: 1 job blokerer', test.includes('planningBlocker(C(), 1)'), true)

console.log(fail ? `\n${fail} fejl` : '\nplanning-count-load-test OK')
process.exitCode = fail ? 1 : 0
