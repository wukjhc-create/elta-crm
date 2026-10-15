/** Kundens indbakke ombryder hovedet, og tom tilstand siger ikke at man skal sende, naar knappen er vaek. Afsendelse er uaendret. Koer: npx tsx scripts/customer-inbox-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-email-timeline.tsx', 'utf8')
eq('hovedet ombrydes', src.includes('flex flex-wrap items-center justify-between gap-2'), true)
eq('ulæst tal kan vokse', src.includes('min-w-[1.25rem] h-5 px-1'), true)
eq('fast cirkel er vaek', src.includes('w-5 h-5 text-[10px]'), false)
eq('send-tekst bliver naar man maa', src.includes("'Send den første email med knappen ovenfor'"), true)
eq('uden mail siger det', src.includes('Kunden mangler e-mail, så der kan ikke sendes herfra'), true)
eq('kun laesning siger det', src.includes('Der er ingen mails koblet til kunden endnu'), true)
eq('pladsholder-test bliver', src.includes('data-testid="customer-mails-no-email"'), true)
eq('afsendelse bliver', src.includes('sendEmailToCustomer'), true)
eq('emne viser stadig to linjer', src.split('text-sm mt-1 line-clamp-2').length === 3, true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-inbox-empty-test OK')
process.exitCode = fail ? 1 : 0
