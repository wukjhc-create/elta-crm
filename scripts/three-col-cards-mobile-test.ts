/** Kalkulationstype og LM-status stables paa mobil. Valg og importtal bliver. Koer: npx tsx scripts/three-col-cards-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const mode = fs.readFileSync('src/components/modules/calculations/calculation-mode-selector.tsx', 'utf8')
const lm = fs.readFileSync('src/components/modules/suppliers/lm-classic-import-panel.tsx', 'utf8')

eq('typer stables', mode.includes('grid grid-cols-1 sm:grid-cols-3 gap-3'), true)
eq('valg bliver', mode.includes('onClick={() => onChange(mode)}'), true)
eq('arbejdslon staves', mode.includes('materialer og arbejdsløn'), true)
eq('solcelle bliver', mode.includes('Solcelleanlæg med ROI og besparelsesberegning'), true)

eq('lm-status stables', lm.includes('grid grid-cols-1 sm:grid-cols-3 gap-4'), true)
eq('produkter bliver', lm.includes('stats?.totalProducts?.toLocaleString'), true)
eq('aendringer bliver', lm.includes('stats?.lastNewProducts || 0') && lm.includes('stats?.lastUpdatedPrices || 0'), true)
eq('stale bliver', lm.includes('Prisdata er ældre end 7 dage'), true)
eq('kilde bliver', lm.includes('https://classic.lemu.dk'), true)

console.log(fail ? `\n${fail} fejl` : '\nthree-col-cards-mobile-test OK')
process.exitCode = fail ? 1 : 0
