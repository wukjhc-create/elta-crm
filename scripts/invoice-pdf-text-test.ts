/**
 * IC12: PDF-tekstudtraek med pdf-parse v2 (lokal, ingen DB).
 *   npx tsx scripts/invoice-pdf-text-test.ts
 */
import { makeTextPdf } from './test-harness/pdf-fixture'
import { extractPdfText } from '../src/lib/invoice-control/pdf-text'

let bad = 0
const check = (ok: boolean, label: string, note = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${note ? `  ${note}` : ''}`) }

async function main() {
  const text = await extractPdfText(makeTextPdf(['Faktura 12345', 'Fakturanummer: 12345', 'Total inkl. moms 1.250,00']))
  check(/Fakturanummer:\s*12345/.test(text) && /1\.250,00/.test(text), 'tekst udtrækkes fra PDF', JSON.stringify(text.slice(0, 60)))
  const old: any = await import('pdf-parse')
  check(typeof old.default !== 'function', 'v1-kaldet (default-export) findes ikke — dokumenterer fejlen')
  check((await extractPdfText(Buffer.from('ikke en pdf'))) === '', 'ugyldig PDF giver tom tekst (ingen exception)')
  console.log(bad ? `\n❌ ${bad} FEJL` : '\n✅ ALLE PDF-TEKST-TESTS PASS')
  process.exit(bad ? 1 : 0)
}
main()
