/** Prisovervaagning siger naar hentningen fejler. Priser og tomme tekster bliver. Koer: npx tsx scripts/pricing-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/pricing/pricing-client.tsx', 'utf8')

eq('advarsel kast siges', src.includes("setAlertsError('Kunne ikke hente prisadvarsler')"), true)
eq('trend kast siges', src.includes("setTrendsError('Kunne ikke hente pristendenser')"), true)
eq('ikke tom', src.includes('Det tælles ikke som ingen prisændringer.'), true)
eq('tom advarsel bliver', src.includes('Ingen prisadvarsler i den valgte periode'), true)
eq('tom tilbud bliver', src.includes('Ingen tilbud er påvirket af nylige prisændringer'), true)
eq('priser bliver', src.includes('formatCurrency(alert.old_price)') && src.includes('formatCurrency(alert.new_price)'), true)
eq('tab bliver', src.includes('formatCurrency(Math.abs(offer.potential_loss))'), true)
eq('klipper ikke', src.includes('truncate'), false)

console.log(fail ? `\n${fail} fejl` : '\npricing-load-test OK')
process.exitCode = fail ? 1 : 0
