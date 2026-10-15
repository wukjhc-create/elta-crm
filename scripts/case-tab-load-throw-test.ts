/** Noter, materialer og oevrige omkostninger siger naar hentningen kaster. Tomme lister bliver. Koer: npx tsx scripts/case-tab-load-throw-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const notes = fs.readFileSync('src/app/dashboard/orders/[id]/order-notes-tab.tsx', 'utf8')
eq('noter fanger kast', notes.includes("setError('Kunne ikke hente noter')"), true)
eq('noter siger det ikke er tomt', notes.includes('Det tælles ikke som en tom note-liste.'), true)
eq('noter kan proeves igen', notes.includes('setReloadKey((key) => key + 1)'), true)
eq('tom note bliver', notes.includes('Skriv en note i feltet ovenfor. Noter fra tilbud vises også her.'), true)
eq('slet bliver', notes.includes('Slet denne note? Handlingen kan ikke fortrydes.'), true)

const materials = fs.readFileSync('src/app/dashboard/orders/[id]/order-materials-tab.tsx', 'utf8')
eq('materialer fanger kast', materials.includes("setLoadError('Kunne ikke hente materialer')"), true)
eq('materialer siger det ikke er tomt', materials.includes('Det tælles ikke som en tom materialeliste.'), true)
eq('tomme materialer bliver', materials.includes('Ingen materialer registreret'), true)
eq('materiale-kost bliver', materials.includes('unit_cost'), true)

const costs = fs.readFileSync('src/app/dashboard/orders/[id]/order-other-costs-tab.tsx', 'utf8')
eq('omkostninger fanger kast', costs.includes("setLoadError('Kunne ikke hente øvrige omkostninger')"), true)
eq('omkostninger siger det ikke er tomt', costs.includes('Det tælles ikke som en tom omkostningsliste.'), true)
eq('tomme omkostninger bliver', costs.includes('Ingen øvrige omkostninger registreret'), true)
eq('db-testid bliver', costs.includes('data-testid="other-costs-db-row"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-tab-load-throw-test OK')
process.exitCode = fail ? 1 : 0
