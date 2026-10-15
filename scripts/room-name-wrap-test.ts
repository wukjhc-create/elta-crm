/** Rumfliser ombryder rummets navn. Valg og kostfelt bliver. Koer: npx tsx scripts/room-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/kalkia/RoomCalculator.tsx', 'utf8')

eq('navn ombrydes', src.includes('text-xs font-medium break-words w-full text-center') && src.includes('{roomType.name}'), true)
eq('navn klippes ikke', src.includes('truncate w-full text-center'), false)
eq('valg bliver', src.includes('handleRoomTypeSelect(roomType.id)'), true)
eq('stoerrelse bliver', src.includes('Rumstørrelse (m²)'), true)
eq('kostfelt bliver', src.includes('costPrice: m.cost_price ?? 0'), true)

console.log(fail ? `\n${fail} fejl` : '\nroom-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
