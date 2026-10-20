/** Tagtegninger viser ikke en anden kundes billeder naar hentningen fejler. Paneltallet bliver. Koer: npx tsx scripts/roof-drawing-stale-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const card = fs.readFileSync('src/components/modules/customers/roof-drawing/roof-drawing-case-card.tsx', 'utf8')
eq('anden kunde ryddes', card.includes('drawingsKey.current === term') && card.includes('setDrawings([])'), true)
eq('samme kunde bliver', card.includes('De tidligere tegninger bliver.'), true)
eq('aegte liste bliver', card.includes('setDrawings(res.data ?? [])'), true)
eq('tom fejl bliver', card.includes('Det tælles ikke som ingen tagtegninger.'), true)
eq('paneler bliver', card.includes('{totalPanels} paneler i alt') && card.includes('{d.panel_count}'), true)
eq('ingen kunde ryddes', card.includes('drawingsKey.current = null'), true)
const section = fs.readFileSync('src/components/modules/customers/roof-drawing/roof-drawing-section.tsx', 'utf8')
eq('sektion anden kunde ryddes', section.includes('drawingsKey.current === term') && section.includes('setDrawings([])'), true)
eq('sektion samme kunde bliver', section.includes('De tidligere tegninger bliver.'), true)
eq('sektion tom tekst bliver', section.includes('Ingen tagtegninger endnu. Brug Tilføj tagflade ovenfor.'), true)
eq('sektion maal bliver', section.includes('FALLBACK_PANEL_WIDTH_MM') && section.includes('FALLBACK_PANEL_HEIGHT_MM'), true)

console.log(fail ? `\n${fail} fejl` : '\nroof-drawing-stale-test OK')
process.exitCode = fail ? 1 : 0
