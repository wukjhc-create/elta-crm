/** Autopilot-reglerne kan laeses paa mobil. Skiftet bliver. Koer: npx tsx scripts/golive-rules-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/go-live/go-live-client.tsx', 'utf8')
const start = src.indexOf('data-testid="golive-rules-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('navn ombrydes', mobile.includes('break-words">{r.name}'), true)
eq('tilstand bliver', mobile.includes("{r.dry_run ? 'dry_run' : 'LIVE'}"), true)
eq('skift bliver', mobile.includes('toggleRuleDryRunAction(r.id, !r.dry_run)'), true)
eq('knap bliver', mobile.includes("{r.dry_run ? 'Sæt LIVE' : 'Sæt dry_run'}"), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)
eq('fejltekst bliver', src.includes('data-testid="golive-rules-load-error"') && src.includes('Det tælles ikke som ingen regler.'), true)
eq('tom liste bliver', src.includes('Ingen regler.'), true)
eq('rykkertekst bliver', src.includes('Rykker-tjek sender RIGTIGE rykkermails til kunder med forfaldne fakturaer'), true)

console.log(fail ? `\n${fail} fejl` : '\ngolive-rules-mobile-test OK')
process.exitCode = fail ? 1 : 0
