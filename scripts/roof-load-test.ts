/** Tagtegninger siger naar hentningen fejler. Tom liste og paneltal bliver. Koer: npx tsx scripts/roof-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const card = fs.readFileSync('src/components/modules/customers/roof-drawing/roof-drawing-case-card.tsx', 'utf8')
const section = fs.readFileSync('src/components/modules/customers/roof-drawing/roof-drawing-section.tsx', 'utf8')

eq('kort kast siges', card.includes("setLoadError('Kunne ikke hente tagtegninger')"), true)
eq('kort ikke tom', card.includes('Det tælles ikke som ingen tagtegninger.'), true)
eq('kort paneler bliver', card.includes('{totalPanels} paneler i alt') && card.includes('{d.panel_count}'), true)
eq('kort klipper ikke', card.includes('truncate'), false)
eq('sektion kast siges', section.includes("setLoadError('Kunne ikke hente tagtegninger')"), true)
eq('sektion ikke tom', section.includes('Det tælles ikke som ingen tagtegninger.'), true)
eq('tom liste bliver', section.includes('Ingen tagtegninger endnu. Brug Tilføj tagflade ovenfor.'), true)
eq('tilfoej bliver', section.includes('Tilføj tagflade') && section.includes('fileInputRef.current?.click()'), true)

console.log(fail ? `\n${fail} fejl` : '\nroof-load-test OK')
process.exitCode = fail ? 1 : 0
