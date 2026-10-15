/** Portalen siger naar besigtigelser ikke kan hentes. Dato og tom liste bliver. Koer: npx tsx scripts/portal-besigtigelse-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/portal/portal-besigtigelse.tsx', 'utf8')

eq('kast siges', src.includes("setLoadError('Kunne ikke hente besigtigelser')"), true)
eq('ikke tom', src.includes('Det tælles ikke som ingen besigtigelser.'), true)
eq('tom liste bliver', src.includes('Ingen besigtigelser planlagt'), true)
eq('dansk dato bliver', src.includes('copenhagenParts(new Date()).date') && src.includes('b.due_date >= today'), true)
eq('dato er streng', src.includes("b.due_date && b.due_date < today"), true)
eq('knapper ombrydes', src.includes('flex flex-wrap items-center gap-3 sm:ml-[52px]'), true)
eq('bekraeft bliver', src.includes('Bekræft tidspunkt') && src.includes('portalConfirmBesigtigelse(token, booking.id)'), true)
eq('book bliver paa tom liste', src.includes('<PortalBookBesigtigelse token={token} onBooked={loadBookings} />'), true)
eq('foerste hentning spinner', src.includes('if (loading && bookings.length === 0)'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-besigtigelse-load-test OK')
process.exitCode = fail ? 1 : 0
