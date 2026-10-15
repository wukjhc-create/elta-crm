/** Konverteringspreviewets hovedtal ombrydes. kr() og fejlteksterne bliver. Koer: npx tsx scripts/conversion-preview-header-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
const start = src.indexOf('grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs min-w-0')
const end = src.indexOf('data.requires_case_match')
const grid = src.slice(start, end)
eq('gitter findes', start > 0 && end > start, true)
eq('gitter kan krympe', grid.includes('min-w-0'), true)
eq('beloeb ombrydes', grid.includes('Beløb (inkl. moms)') && grid.includes('break-words min-w-0'), true)
eq('kr bliver', grid.includes('kr(data.amount_incl_vat)'), true)
eq('leverandoerfejl bliver', src.includes('Det tælles ikke som ingen leverandør.'), true)
eq('sagfejl bliver', src.includes('Det tælles ikke som ikke matchet.'), true)
eq('intet bogfoeres', src.includes('getIncomingInvoiceConversionPreviewAction') && !src.includes('approveInvoice'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nconversion-preview-header-wrap-test OK')
process.exitCode = fail ? 1 : 0
