/** Tilbudslistens handlinger og filtre ombrydes. Koer: npx tsx scripts/offers-actions-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/components/modules/offers/offers-page-client.tsx', 'utf8')
const table = fs.readFileSync('src/components/modules/offers/offers-table.tsx', 'utf8')
const mobile = table.slice(table.indexOf('data-testid="offers-mobile-list"'), table.indexOf('hidden md:block'))

eq('handlinger ombrydes', page.includes('flex flex-wrap items-center gap-2') && page.includes('Nyt Tilbud'), true)
eq('overskriften ombrydes', page.includes('flex flex-wrap items-start justify-between gap-3'), true)
eq('soegning ombrydes', page.includes('flex-1 flex flex-wrap gap-2'), true)
eq('soegning har et navn', page.includes('aria-label="Søg tilbud"'), true)
eq('status har et navn', page.includes('aria-label="Status"'), true)
eq('status kan ryddes', page.includes('aria-label="Ryd status"'), true)
eq('aktive filtre ombrydes', page.includes('flex flex-wrap items-center gap-2 mt-3 pt-3 border-t'), true)
eq('ryd alle bliver', page.includes('Ryd alle'), true)
eq('kortets titel ombrydes', mobile.includes('break-words min-w-0">{offer.title}'), true)
eq('kortets nummer ombrydes', mobile.includes('font-mono text-gray-500 break-all">{offer.offer_number}'), true)
const desk = table.slice(table.indexOf('hidden md:block'))
eq('desktop-titel ombrydes', desk.includes('hover:text-primary break-words'), true)
eq('beloeb bliver', mobile.includes('formatCurrency(offer.final_amount, currency)'), true)
eq('kortet viser stadig ekskl. moms', mobile.includes('ekskl. moms'), true)
eq('massehandling har et navn', table.includes('aria-label="Skift status på valgte"'), true)
eq('slet valgte bliver', table.includes('Slet valgte'), true)

console.log(fail ? `\n${fail} fejl` : '\noffers-actions-mobile-test OK')
process.exitCode = fail ? 1 : 0
