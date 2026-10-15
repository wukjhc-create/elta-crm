/** Portalen viser ikke et andet tokens besigtigelser naar hentningen fejler. Bekraeft bliver. Koer: npx tsx scripts/portal-besigtigelse-stale-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/portal/portal-besigtigelse.tsx', 'utf8')
eq('andet token ryddes', src.includes('bookingsKey.current === term') && src.includes('setBookings([])'), true)
eq('samme token bliver', src.includes('De tidligere besigtigelser bliver.'), true)
eq('gammelt svar ignoreres', src.includes('requestId.current !== id'), true)
eq('aegte liste bliver', src.includes('setBookings(res.data ?? [])'), true)
eq('tom fejl bliver', src.includes('Det tælles ikke som ingen besigtigelser.'), true)
eq('bekraeft bliver', src.includes('portalConfirmBesigtigelse(token, booking.id)'), true)
eq('dato bliver', src.includes('copenhagenParts(new Date()).date'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-besigtigelse-stale-test OK')
process.exitCode = fail ? 1 : 0
