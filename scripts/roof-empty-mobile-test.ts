/** Tom tagtegning peger paa Tilfoej tagflade, og vaerktoejslinjen ombrydes. Maalestok bliver. Koer: npx tsx scripts/roof-empty-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const section = fs.readFileSync('src/components/modules/customers/roof-drawing/roof-drawing-section.tsx', 'utf8')
const editor = fs.readFileSync('src/components/modules/customers/roof-drawing/roof-drawing-editor.tsx', 'utf8')

eq('tom liste peger videre', section.includes('Ingen tagtegninger endnu. Brug Tilføj tagflade ovenfor.'), true)
eq('knappen hedder stadig Tilfoej tagflade', section.includes('Tilføj tagflade') && section.includes('fileInputRef.current?.click()'), true)
eq('overskriften ombrydes', section.includes('flex flex-wrap items-center justify-between gap-2'), true)
eq('paneltal bliver', section.includes('{totalPanels} paneler i alt'), true)

eq('titel kan krympe', editor.includes('min-w-0 flex-1 text-lg font-semibold'), true)
eq('vaerktoejer ombrydes', editor.includes('flex flex-wrap items-center gap-1 bg-white rounded-xl'), true)
eq('luk har et navn', editor.includes('aria-label="Luk"'), true)
eq('gem bliver', editor.includes('onClick={handleSave}'), true)
eq('fallback-maal bliver', editor.includes('FALLBACK_PANEL_WIDTH_MM') && editor.includes('FALLBACK_PANEL_HEIGHT_MM'), true)

console.log(fail ? `\n${fail} fejl` : '\nroof-empty-mobile-test OK')
process.exitCode = fail ? 1 : 0
