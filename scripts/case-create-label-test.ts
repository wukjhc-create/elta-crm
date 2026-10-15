/** Ny sag kobler felterne og stabler adresse paa mobil. Opret bliver. Koer: npx tsx scripts/case-create-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/service-cases/create-service-case-modal.tsx', 'utf8')

eq('titel er koblet', src.includes('htmlFor="case-create-title"') && src.includes('id="case-create-title"') && src.includes('value={title}'), true)
eq('beskrivelse er koblet', src.includes('htmlFor="case-create-description"') && src.includes('id="case-create-description"') && src.includes('value={description}'), true)
eq('kunde er koblet', src.includes('htmlFor="case-create-customer"') && src.includes('id="case-create-customer"') && src.includes('value={customerSearch}'), true)
eq('prioritet er koblet', src.includes('htmlFor="case-create-priority"') && src.includes('id="case-create-priority"') && src.includes('value={priority}'), true)
eq('kilde er koblet', src.includes('htmlFor="case-create-source"') && src.includes('id="case-create-source"') && src.includes('value={source}'), true)
eq('adresse er koblet', src.includes('htmlFor="case-create-address"') && src.includes('id="case-create-address"') && src.includes('value={address}'), true)
eq('postnr er koblet', src.includes('htmlFor="case-create-postal"') && src.includes('id="case-create-postal"') && src.includes('value={postalCode}'), true)
eq('by er koblet', src.includes('htmlFor="case-create-city"') && src.includes('id="case-create-city"') && src.includes('value={city}'), true)
eq('etage er koblet', src.includes('htmlFor="case-create-floor"') && src.includes('id="case-create-floor"') && src.includes('value={floorDoor}'), true)
eq('ksr er koblet', src.includes('htmlFor="case-create-ksr"') && src.includes('id="case-create-ksr"') && src.includes('value={ksrNumber}'), true)
eq('ean er koblet', src.includes('htmlFor="case-create-ean"') && src.includes('id="case-create-ean"') && src.includes('value={eanNumber}'), true)
eq('adresse stables paa mobil', src.includes('grid grid-cols-1 sm:grid-cols-3 gap-3'), true)
eq('prioritet stables paa mobil', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-4'), true)
eq('ksr stables paa mobil', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-3'), true)
eq('postnr slaar stadig by op', src.includes('lookupPostalCode(e.target.value)'), true)
eq('cifre bliver', src.includes("replace(/[^\\d]/g, '')"), true)
eq('opret bliver', src.includes('Opret sag'), true)
eq('luk bliver', src.includes('aria-label="Luk"'), true)
eq('fjern kunde bliver', src.includes('aria-label="Fjern valgt kunde"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-create-label-test OK')
process.exitCode = fail ? 1 : 0
