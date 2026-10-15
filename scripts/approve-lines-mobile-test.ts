/** Godkend-dialogen viser linjer som kort. Valg og beloeb er de samme. Koer: npx tsx scripts/approve-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/approve-preview-dialog.tsx', 'utf8')
const start = src.indexOf('data-testid="approve-lines-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))

eq('mobilkort findes', start > 0 && mobile.includes('l.description'), true)
eq('beskrivelse ombrydes', mobile.includes('text-gray-900 break-words'), true)
eq('total bliver', mobile.includes('fmtAmount(l.total_price)'), true)
eq('materiale bliver', mobile.includes('value="material">Materiale'), true)
eq('ovrig bliver', mobile.includes('value="other_cost">Øvrig omkostning'), true)
eq('spring over bliver', mobile.includes('value="skip">Spring over'), true)
eq('kategori bruger samme liste', mobile.includes('CASE_OTHER_COST_CATEGORIES.map'), true)
eq('konverterede linjer er laast', mobile.includes('disabled={busy || alreadyConverted}'), true)
eq('tom liste bliver', src.includes('Ingen linjer ekstraheret. Godkendelse vil kun flippe status — ingen konvertering.'), true)
eq('godkend kalder samme plan', src.includes('onConfirm(plan)') && src.includes("convertOnly ? 'Konvertér linjer' : 'Godkend'"), true)

console.log(fail ? `\n${fail} fejl` : '\napprove-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
