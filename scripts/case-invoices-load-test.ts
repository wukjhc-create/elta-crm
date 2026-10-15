/** Sagens fakturaer og historik beholdes naar opdatering fejler. Tom tekst og beloeb bliver. Koer: npx tsx scripts/case-invoices-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const list = fs.readFileSync('src/components/modules/orders/case-invoices-list.tsx', 'utf8')
eq('kun tilladelse rydder listen', list.includes("if (res.message?.includes('Manglende tilladelse')) setItems([])"), true)
eq('fejl rydder ikke listen igen', list.split('setItems([])').length === 2, true)
eq('tom tekst bliver', list.includes('Der er endnu ingen fakturaer på sagen.'), true)
eq('taelles ikke som tom', list.includes('Det tælles ikke som ingen fakturaer.'), true)
eq('beloeb inkl moms bliver', list.includes('inkl. moms'), true)
eq('foerste fejl vises', list.includes('data-testid="case-invoices-load-error"'), true)
eq('spinner kun uden raekker', list.includes('loading && items.length === 0'), true)

const hist = fs.readFileSync('src/components/modules/orders/case-invoice-history.tsx', 'utf8')
eq('kun tilladelse rydder historik', hist.includes("if (res.message?.includes('Manglende tilladelse')) setEntries([])"), true)
eq('fejl rydder ikke historik igen', hist.split('setEntries([])').length === 2, true)
eq('tom historik bliver', hist.includes('Der er endnu ingen fakturahistorik på sagen.'), true)
eq('taelles ikke som tom historik', hist.includes('Det tælles ikke som ingen fakturahistorik.'), true)
eq('beloeb bliver', hist.includes("formatCurrency(e.amount_incl_vat, 'DKK', 2)"), true)
eq('tid bliver', hist.includes('return copenhagenDateTimeLabel(s)'), true)
eq('kost skjules', hist.includes('Ingen kost eller margin vises.'), true)
eq('spinner kun uden historik', hist.includes('loading && entries.length === 0'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-invoices-load-test OK')
process.exitCode = fail ? 1 : 0
