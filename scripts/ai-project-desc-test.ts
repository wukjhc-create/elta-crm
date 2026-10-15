/** AI-projektets historik ombryder beskrivelsen. Pris og tom liste bliver. Koer: npx tsx scripts/ai-project-desc-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const start = src.indexOf('Seneste analyser')
const block = src.slice(start)

eq('beskrivelse ombrydes', block.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), true)
eq('beskrivelse klippes ikke paa en linje', block.includes('text-sm text-gray-700 truncate'), false)
eq('pris bliver', block.includes('formatCurrency(analysis.total_price)'), true)
eq('tom liste siger naeste skridt', block.includes('Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.'), true)

console.log(fail ? `\n${fail} fejl` : '\nai-project-desc-test OK')
process.exitCode = fail ? 1 : 0
