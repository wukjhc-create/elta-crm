/** Rumtyper siger naar listen ikke kan hentes. En aekte tom liste bliver. Koer: npx tsx scripts/room-types-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/kalkia/rooms/page.tsx', 'utf8')
eq('siden sender fejl', page.includes("result.success ? null : result.error || 'Kunne ikke hente rumtyper'"), true)
eq('aegte liste bliver', page.includes('result.success && result.data ? result.data : []'), true)

const view = fs.readFileSync('src/app/dashboard/settings/kalkia/rooms/room-types-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="room-types-load-error"') && view.includes('Det tælles ikke som ingen rumtyper.'), true)
eq('tom liste kraever ingen fejl', view.includes('loadError ? (') && view.includes('roomTypes.length === 0 && !showCreateForm'), true)
eq('aegte tom bliver', view.includes('Ingen rumtyper konfigureret'), true)
eq('hjaelp bliver', view.includes('Opret rumtyper for at aktivere intelligent rumberegning'), true)
eq('ingen beskrivelse bliver', view.includes('Ingen beskrivelse'), true)
eq('slet bliver', view.includes('deleteRoomType(id)'), true)

console.log(fail ? `\n${fail} fejl` : '\nroom-types-load-test OK')
process.exitCode = fail ? 1 : 0
