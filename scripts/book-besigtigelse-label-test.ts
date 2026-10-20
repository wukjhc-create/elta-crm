/** Besigtigelse kobler dato, tid og noter. Afsendelsen bliver. Koer: npx tsx scripts/book-besigtigelse-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/book-besigtigelse-modal.tsx', 'utf8')

eq('dato er koblet', src.includes('htmlFor="book-visit-date"') && src.includes('id="book-visit-date"') && src.includes('type="date"') && src.includes('value={date}'), true)
eq('tid er koblet', src.includes('htmlFor="book-visit-time"') && src.includes('id="book-visit-time"') && src.includes('type="time"') && src.includes('value={time}'), true)
eq('noter er koblet', src.includes('htmlFor="book-visit-notes"') && src.includes('id="book-visit-notes"') && src.includes('value={notes}'), true)
eq('dato stables paa mobil', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-3'), true)
eq('mindstedato bliver koebenhavn', src.includes('min={copenhagenParts(new Date()).date}'), true)
eq('luk bliver', src.includes('aria-label="Luk"'), true)
eq('afsendelse bliver', src.includes('bookBesigtigelse(') && src.includes('Book & Send email'), true)
eq('modtager bliver', src.includes('customerEmail'), true)

console.log(fail ? `\n${fail} fejl` : '\nbook-besigtigelse-label-test OK')
process.exitCode = fail ? 1 : 0
