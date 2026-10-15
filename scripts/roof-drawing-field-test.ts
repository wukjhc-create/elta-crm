/** Tagtegningens titel, panel og maaler har et navn. Vaerdierne bliver. Koer: npx tsx scripts/roof-drawing-field-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const editor = fs.readFileSync('src/components/modules/customers/roof-drawing/roof-drawing-editor.tsx', 'utf8')

const titleAt = editor.indexOf('value={title}')
const titleSlice = editor.slice(Math.max(0, titleAt - 80), titleAt + 220)
eq('titel har et navn', titleSlice.includes('aria-label="Titel"'), true)
eq('titelvaerdien bliver', titleSlice.includes('value={title}'), true)
eq('titel kan stadig krympe', titleSlice.includes('min-w-0 flex-1 text-lg font-semibold'), true)
eq('titel saettes stadig', titleSlice.includes('setTitle(e.target.value)'), true)

const panelAt = editor.indexOf("value={panelCode ?? ''}")
const panelSlice = editor.slice(Math.max(0, panelAt - 140), panelAt + 280)
eq('panel har et navn', panelSlice.includes('aria-label="Panel"'), true)
eq('panelvaerdien bliver', panelSlice.includes("value={panelCode ?? ''}"), true)
eq('panel kan fylde mobilbredden', panelSlice.includes('w-full min-w-0 max-w-full sm:w-auto'), true)
eq('foerste valg bliver', panelSlice.includes('Vælg panel…'), true)
eq('panel skiftes stadig', panelSlice.includes('handlePanelChange(e.target.value)'), true)

const lengthAt = editor.indexOf('value={lengthInput}')
const lengthSlice = editor.slice(Math.max(0, lengthAt - 140), lengthAt + 260)
eq('laengde har et navn', lengthSlice.includes('aria-label="Længde i meter"'), true)
eq('laengdevaerdien bliver', lengthSlice.includes('value={lengthInput}'), true)
eq('laengde saettes stadig', lengthSlice.includes('setLengthInput(e.target.value)'), true)

eq('afstand bliver i labelen', editor.includes('value={data.panelGapMm}'), true)
eq('vinkel bliver i labelen', editor.includes('value={Math.round(activeAngle)}'), true)
eq('luk har stadig et navn', editor.includes('aria-label="Luk"'), true)
eq('gem bliver', editor.includes('onClick={handleSave}'), true)

console.log(fail ? `\n${fail} fejl` : '\nroof-drawing-field-test OK')
process.exitCode = fail ? 1 : 0
