/** Kreditnotaer paa fakturaen kan laeses paa mobil. Beloebet bliver. Koer: npx tsx scripts/invoice-credits-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
const start = src.indexOf('data-testid="invoice-credits-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('begrundelse ombrydes', mobile.includes("break-words\">{c.credit_reason ?? '—'}"), true)
eq('beloeb bliver', mobile.includes('fmtKrLocal(c.final_amount)'), true)
eq('status bliver', mobile.includes('{c.status}'), true)
eq('link bliver', mobile.includes('href={`/dashboard/invoices/${c.id}`}'), true)
eq('fortegn vendes ikke', mobile.includes('Math.abs'), false)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block rounded ring-1 ring-gray-200 overflow-x-auto'), true)
eq('kladde-beloeb bliver', src.includes('fmtKrLocal(summary.credited_draft_ex_vat_total)'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-credits-mobile-test OK')
process.exitCode = fail ? 1 : 0
