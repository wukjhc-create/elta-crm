/** Foerste hentning af overblikket bliver ikke "ingen forfaldne". Aegte tomme tekster bliver. Koer: npx tsx scripts/ops-overview-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/dashboard/operational-overview.tsx', 'utf8')

eq('fejl skjuler listerne', src.includes('data-testid="ops-overview-load-error"') && src.includes('!data ? ('), true)
eq('fejlen er ikke 0', src.includes('Det tælles ikke som 0, og det tælles ikke som ingen forfaldne.'), true)
eq('tidligere tal bliver', src.includes('De tidligere tal bliver.'), true)
eq('tom mail bliver', src.includes('Ingen e-mails endnu.'), true)
eq('tom forfalden bliver', src.includes('Ingen forfaldne — godt arbejde.'), true)
eq('tom faktura bliver', src.includes('når en faktura er oprettet'), true)
eq('tal bliver', src.includes('invoices_overdue') && src.includes('new_emails_last_24h'), true)

console.log(fail ? `\n${fail} fejl` : '\nops-overview-load-test OK')
process.exitCode = fail ? 1 : 0
