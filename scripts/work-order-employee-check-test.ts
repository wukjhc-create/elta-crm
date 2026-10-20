/** Opret og omplan siges naar medarbejderen ikke kan tjekkes. Inaktiv og udfoert bliver. Koer: npx tsx scripts/work-order-employee-check-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/work-orders.ts', 'utf8')
const create = src.slice(src.indexOf('export async function createWorkOrderForCase'), src.indexOf('export async function updateWorkOrderPlanning'))
const update = src.slice(src.indexOf('export async function updateWorkOrderPlanning'), src.indexOf('export async function changeWorkOrderStatus'))
const msg = "error: 'Kunne ikke tjekke medarbejderen. Det tælles ikke som at personen ikke findes.'"

for (const [name, fn] of [['opret', create], ['omplan', update]] as const) {
  eq(`${name} findes`, fn.length > 80, true)
  eq(`${name} siger fejl`, fn.includes(msg), true)
  eq(`${name} fejl foer mangler`, fn.indexOf('if (empError)') < fn.indexOf("error: 'Medarbejder findes ikke'"), true)
  eq(`${name} mangler bliver`, fn.includes("error: 'Medarbejder findes ikke'"), true)
  eq(`${name} inaktiv bliver`, fn.includes("error: 'Medarbejder er inaktiv'"), true)
  eq(`${name} dato bliver`, fn.includes('copenhagenParts(new Date()).date'), true)
}

eq('udfoert bliver', update.includes('En udført eller annulleret arbejdsordre kan ikke omplanlægges'), true)

console.log(fail ? `\n${fail} fejl` : '\nwork-order-employee-check-test OK')
process.exitCode = fail ? 1 : 0
