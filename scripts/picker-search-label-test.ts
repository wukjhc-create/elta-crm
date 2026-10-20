/** Kommandopalet og kalkulationssoegning har et navn. Soegningen bliver. Koer: npx tsx scripts/picker-search-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const read = (p: string) => fs.readFileSync(p, 'utf8')
eq('palet', read('src/components/layout/command-palette.tsx').includes('aria-label="Søg eller hop til"'), true)
eq('pakker', read('src/components/modules/kalkia/PackageBrowser.tsx').includes('aria-label="Søg i pakker"'), true)
eq('jobs', read('src/components/modules/kalkia/QuickJobsPicker.tsx').includes('aria-label="Søg i jobs"'), true)
eq('komponenter', read('src/components/modules/kalkia/ComponentBrowser.tsx').includes('aria-label="Søg i komponenter"'), true)
eq('materialer', read('src/components/modules/kalkia/MaterialSummary.tsx').includes('aria-label="Søg i materialer"'), true)
eq('pakkevaelger', read('src/components/modules/packages/package-picker-dialog.tsx').includes('aria-label="Søg efter pakke"'), true)
eq('produktvaelger', read('src/components/modules/calculations/product-picker-dialog.tsx').includes('aria-label="Søg efter produkter"'), true)
eq('pakkevaelger rydder stadig fejl', read('src/components/modules/packages/package-picker-dialog.tsx').includes('Det tælles ikke som ingen pakker.'), true)

console.log(fail ? `\n${fail} fejl` : '\npicker-search-label-test OK')
process.exitCode = fail ? 1 : 0
