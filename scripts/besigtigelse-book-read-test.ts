/** Besigtigelse bookes ikke naar kunde eller dublet-tjek fejler. Koer: npx tsx scripts/besigtigelse-book-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const start = src.indexOf('export async function bookBesigtigelse')
const end = src.indexOf('Unexpected error in bookBesigtigelse')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('kunde siger fejl foer opret', fn.indexOf('if (customerErr)') < fn.indexOf("from('customer_tasks').insert"), true)
eq('ikke-fundet bliver', fn.includes("? 'Kunde ikke fundet'"), true)
eq('adresse-fejl booker ikke', fn.includes('Kunne ikke læse kundens adresse. Besigtigelsen er ikke booket.'), true)
eq('dublet siger fejl foer opret', fn.indexOf('if (dupErr)') < fn.indexOf("from('customer_tasks').insert"), true)
eq('dublet-tekst', fn.includes('Kunne ikke tjekke om besigtigelsen allerede er booket. Der er ikke oprettet en ny.'), true)
eq('aegte dobbeltklik bliver', fn.includes('if ((dup ?? []).length > 0)') && fn.includes('return { success: true }'), true)
eq('mail-ruten bliver', fn.includes('resolveBesigtigelseMailRoute'), true)

console.log(fail ? `\n${fail} fejl` : '\nbesigtigelse-book-read-test OK')
process.exitCode = fail ? 1 : 0
