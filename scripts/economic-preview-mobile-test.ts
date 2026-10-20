/** Kundefakturans e-conomic-forhåndsvisning kan læses på mobil. Beløbene bliver. Koer: npx tsx scripts/economic-preview-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/invoices/invoice-accounting-panel.tsx', 'utf8')
const start = src.indexOf('data-testid="economic-preview-lines-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('beskrivelse ombrydes', mobile.includes('break-words">{l.description}'), true)
eq('beloeb bliver', mobile.includes('fmtNum(l.quantity)') && mobile.includes('fmtNum(l.unitNetPrice)') && mobile.includes('fmtNum(Math.round(l.quantity * l.unitNetPrice * 100) / 100)'), true)
eq('desktop-tabel bliver', src.includes('hidden md:block overflow-x-auto'), true)
eq('netto bliver', src.includes('data-testid="economic-preview-net"') && src.includes('fmtNum(preview.draft.economicNet)'), true)
eq('intet sendes', src.includes('Forhåndsvisning — intet sendes til e-conomic herfra.'), true)

console.log(fail ? `\n${fail} fejl` : '\neconomic-preview-mobile-test OK')
process.exitCode = fail ? 1 : 0
