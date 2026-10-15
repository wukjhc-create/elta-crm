/** Tagtegningens titel ombrydes. Paneltallet er det samme. Koer: npx tsx scripts/roof-title-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const card = fs.readFileSync('src/components/modules/customers/roof-drawing/roof-drawing-case-card.tsx', 'utf8')
const section = fs.readFileSync('src/components/modules/customers/roof-drawing/roof-drawing-section.tsx', 'utf8')

eq('sagskort ombryder titel', card.includes('break-words block">{d.title}'), true)
eq('sagskort klipper ikke', card.includes('truncate'), false)
eq('sagskort viser paneler', card.includes('{d.panel_count}'), true)
eq('sektion ombryder titel', section.includes('break-words min-w-0">{d.title}'), true)
eq('sektion klipper ikke titel', section.slice(section.indexOf('setEditingId(d.id)'), section.indexOf('RoofDrawingEditor')).includes('truncate'), false)
eq('sektion viser paneler', section.includes('{d.panel_count}'), true)

console.log(fail ? `\n${fail} fejl` : '\nroof-title-wrap-test OK')
process.exitCode = fail ? 1 : 0
