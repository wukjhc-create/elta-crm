/** Fuldmagt og besigtigelse siger naar sagerne ikke kan hentes. Et aegte tomt svar bliver. Koer: npx tsx scripts/case-picker-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const fuldmagt = fs.readFileSync('src/components/modules/customers/fuldmagt-modal.tsx', 'utf8')
eq('fuldmagt banner', fuldmagt.includes('data-testid="fuldmagt-cases-load-error"') && fuldmagt.includes('Det tælles ikke som ingen sager.'), true)
eq('fuldmagt fejl ryddes', fuldmagt.includes("setCasesError(res.error || 'Kunne ikke hente sager')") && fuldmagt.includes('setCases([])'), true)
eq('fuldmagt aegte liste', fuldmagt.includes('const list = res.data ?? []') && fuldmagt.includes('if (list.length === 1) setSelectedCaseId(list[0].id)'), true)
eq('fuldmagt tom bliver', fuldmagt.includes('Denne kunde har ingen sager endnu. Opret en sag, før du opretter en fuldmagt.'), true)

const note = fs.readFileSync('src/components/modules/customers/besigtigelse-notat.tsx', 'utf8')
eq('besigtigelse banner', note.includes('data-testid="besigtigelse-cases-load-error"') && note.includes('Det tælles ikke som ingen sager.'), true)
eq('besigtigelse fejl ryddes', note.includes("setCasesError(res.error || 'Kunne ikke hente sager')") && note.includes('setServiceCases([])'), true)
eq('besigtigelse aegte liste', note.includes('const cases = res.data ?? []') && note.includes('if (cases.length === 1) setServiceCaseId(cases[0].id)'), true)
eq('besigtigelse tom bliver', note.includes('Denne kunde har ingen sager endnu. Opret en sag på kundekortet, før du gemmer en besigtigelse.'), true)
eq('billede bliver', note.includes('aria-label="Fjern billede"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-picker-load-test OK')
process.exitCode = fail ? 1 : 0
