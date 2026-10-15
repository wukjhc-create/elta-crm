/** Portalen ombryder dokument, fuldmagt og velkomst. PDF og fuldmagtstekst er de samme. Koer: npx tsx scripts/portal-identity-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const confirm = fs.readFileSync('src/app/portal/confirm-besigtigelse/[token]/confirm-client.tsx', 'utf8')
const fuldmagt = fs.readFileSync('src/components/modules/portal/portal-fuldmagt.tsx', 'utf8')
const dash = fs.readFileSync('src/components/modules/portal/portal-dashboard.tsx', 'utf8')

eq('titel ombrydes', confirm.includes('break-words">{context.documentTitle}'), true)
eq('filnavn ombrydes', confirm.includes('break-all">{context.documentFileName}'), true)
eq('filnavn klippes ikke', confirm.includes('truncate'), false)
eq('feltvaerdi ombrydes', confirm.includes('min-w-0 break-words'), true)
eq('pdf kan stadig aabnes', confirm.includes('Åbn PDF') && confirm.includes('Download PDF'), true)
eq('download bruger filnavnet', confirm.includes('download={context.documentFileName}'), true)

eq('fuldmagt ombryder navn', fuldmagt.includes('break-words min-w-0">{fuldmagt.customer_name}'), true)
eq('fuldmagt ombryder adresse', fuldmagt.includes('break-words min-w-0">{fuldmagt.customer_address}'), true)
eq('fuldmagtstekst bliver', fuldmagt.includes('Undertegnede giver hermed'), true)

eq('velkomst ombryder navn', dash.includes('break-words">') && dash.includes('session.customer.contact_person'), true)
eq('firma ombrydes', dash.includes('text-gray-600 mt-1 break-words'), true)
eq('tomt tilbud siger naeste skridt', dash.includes('Du har ingen tilbud endnu. De vises her, når ELTA sender et tilbud.'), true)
eq('tom sag siger naeste skridt', dash.includes('Der er endnu ingen aktive sager. De vises her, når en sag er i gang.'), true)
eq('sags titel ombrydes', dash.includes('font-medium text-gray-900 mt-1 break-words">{sc.title}'), true)
eq('beloeb bliver', dash.includes('formatCurrency(offer.final_amount, currency)'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-identity-wrap-test OK')
process.exitCode = fail ? 1 : 0
