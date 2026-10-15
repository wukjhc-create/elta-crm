/** Konverterings-preview viser linjer som kort paa mobil. Beløb og forslag er de samme. Koer: npx tsx scripts/conversion-preview-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
const start = src.indexOf('data-testid="conversion-preview-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))

eq('mobilkort findes', start > 0 && mobile.includes('l.description'), true)
eq('beskrivelse ombrydes', mobile.includes('break-words">{l.description}'), true)
eq('antal og kost bliver', mobile.includes('{l.quantity} {l.unit}') && mobile.includes('kr(l.unit_cost)'), true)
eq('forslag bliver', mobile.includes('DISP_LABEL[l.suggested]') && mobile.includes('allerede konverteret'), true)
eq('tabellen bliver paa desktop', src.includes('hidden md:block overflow-x-auto') && src.includes('<table'), true)
eq('forklaringen bliver', src.includes('Kun kostpris fra leverandør; salgspris sættes på sagen.'), true)
eq('intet bogfoeres herfra', src.includes('getIncomingInvoiceConversionPreviewAction') && !src.includes('approveInvoice'), true)

console.log(fail ? `\n${fail} fejl` : '\nconversion-preview-mobile-test OK')
process.exitCode = fail ? 1 : 0
