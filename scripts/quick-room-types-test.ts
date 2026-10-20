/** Hurtigkalkulation viser alle rumtyper, og knapperne ombrydes. addRoom bliver. Koer: npx tsx scripts/quick-room-types-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calculations/quick/quick-calculation-client.tsx', 'utf8')
eq('alle rumtyper vises', src.includes('{roomTypes.map(rt => ('), true)
eq('de foerste fire er ikke loftet', src.includes('roomTypes.slice(0, 4)'), false)
eq('knapperne ombrydes', src.includes('flex flex-wrap gap-2 min-w-0'), true)
eq('addRoom bliver', src.includes('onClick={() => addRoom(rt.code)}'), true)
eq('tomt rum bliver', src.includes('Ingen rum tilføjet endnu'), true)
eq('tilfoej-tekst bliver', src.includes('Tilføj rum med knapperne ovenfor'), true)
eq('rumfejl bliver', src.includes('Det tælles ikke som ingen rumtyper.'), true)

console.log(fail ? `\n${fail} fejl` : '\nquick-room-types-test OK')
process.exitCode = fail ? 1 : 0
