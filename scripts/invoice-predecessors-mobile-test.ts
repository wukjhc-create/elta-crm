/** Tidligere fakturaer paa slutfakturaen kan laeses paa mobil. Fradraget bliver. Koer: npx tsx scripts/invoice-predecessors-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
const start = src.indexOf('data-testid="invoice-predecessors-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('label ombrydes', mobile.includes("break-words\">{p.stage_label ?? '—'}"), true)
eq('type bliver', mobile.includes('PRED_TYPE_LABEL[p.invoice_type] ?? p.invoice_type'), true)
eq('status bliver', mobile.includes('{p.status}'), true)
eq('fradrag bliver', mobile.includes('fmtKr(p.deduction_amount, inv.currency)'), true)
eq('link bliver', mobile.includes('href={`/dashboard/invoices/${p.invoice_id}`}'), true)
eq('total bliver', mobile.includes('detail.predecessors.reduce((s, p) => s + p.deduction_amount, 0)'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)
eq('sletning blokeres stadig', src.includes('slet slutfakturaen først hvis du vil ændre forgængerne.'), true)
eq('fejltekst bliver', src.includes('Det tælles ikke som ingen tidligere fakturaer.'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-predecessors-mobile-test OK')
process.exitCode = fail ? 1 : 0
