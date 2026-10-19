/** Mail-forslag og produktsogning ombryder navne. Koer: npx tsx scripts/mail-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const detail = fs.readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
const start = detail.indexOf('Mulige matches')
const suggestions = detail.slice(start, detail.indexOf('EMAIL BODY', start))
const lines = fs.readFileSync('src/app/dashboard/mail/components/quote-line-items-editor.tsx', 'utf8')

eq('fundet kunde ombrydes', suggestions.includes('break-words min-w-0" data-testid="mail-match-name">{detectedCustomer.company_name}'), true)
eq('forslag ombrydes', suggestions.includes('break-words">{s.company_name}'), true)
eq('kobl bliver', suggestions.includes('Kobl'), true)
eq('produktnavn ombrydes', lines.includes('break-words">{product.product_name}'), true)
eq('varelinje ombrydes', lines.includes('text-[10px] text-gray-400 break-words'), true)
eq('netto vises stadig', lines.includes('Netto: ${formatCurrency(item.costPrice'), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
