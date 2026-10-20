/** Kalkia-rumvaelgeren viser alle typer i to kolonner paa mobil. Valg bliver. Koer: npx tsx scripts/room-type-grid-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/kalkia/RoomCalculator.tsx', 'utf8')
eq('mobil har to kolonner', src.includes('grid grid-cols-2 sm:grid-cols-5 gap-2 min-w-0'), true)
eq('fem kolonner er ikke loftet paa mobil', src.includes('grid grid-cols-5 gap-2'), false)
eq('alle typer vises', src.includes('{roomTypes.map((roomType) => {'), true)
eq('de foerste ti er ikke loftet', src.includes('roomTypes.slice(0, 10)'), false)
eq('valg bliver', src.includes('handleRoomTypeSelect(roomType.id)'), true)
eq('stoerrelse bliver', src.includes('Rumstørrelse (m²)'), true)
eq('navn ombrydes', src.includes('text-xs font-medium break-words w-full text-center'), true)

console.log(fail ? `\n${fail} fejl` : '\nroom-type-grid-test OK')
process.exitCode = fail ? 1 : 0
