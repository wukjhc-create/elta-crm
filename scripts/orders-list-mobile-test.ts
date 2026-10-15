/** Sagslisten ombryder titel og kunde. Beløb og fakturering er de samme. Koer: npx tsx scripts/orders-list-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/orders-list-client.tsx', 'utf8')
const start = src.indexOf('data-testid="orders-mobile-list"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))

eq('overskriften ombrydes', src.includes('flex flex-wrap items-start justify-between gap-3'), true)
eq('soegning fylder bredden', src.includes('w-full sm:w-56') && src.includes('aria-label="Søg sager"'), true)
eq('status har et navn', src.includes('aria-label="Status"'), true)
eq('type har et navn', src.includes('aria-label="Type"'), true)
eq('fakturering har et navn', src.includes('aria-label="Fakturering"'), true)
eq('titel ombrydes', mobile.includes('break-words">{c.project_name || c.title}'), true)
eq('kunde ombrydes', mobile.includes('text-sm text-gray-600 break-words'), true)
eq('kortet klipper ikke titel', mobile.includes('truncate'), false)
eq('tilbudt og revideret bliver', mobile.includes('contract_sum') && mobile.includes('revised_sum'), true)
eq('fakturering bliver bag samme gate', mobile.includes('canSeeBilling') && mobile.includes('net_invoiced'), true)
eq('nulstil bliver', src.includes('Nulstil filtre'), true)
eq('ny sag bliver', src.includes('+ Ny sag'), true)
eq('tom liste bliver', src.includes('Ingen sager endnu — opret din første sag fra et tilbud, en email eller manuelt.'), true)

console.log(fail ? `\n${fail} fejl` : '\norders-list-mobile-test OK')
process.exitCode = fail ? 1 : 0
