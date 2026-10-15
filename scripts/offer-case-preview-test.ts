/** Tilbud til sag blokerer opret, naar forhaandsvisningen fejler. Beloeb og opret-tekst bliver. Koer: npx tsx scripts/offer-case-preview-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-to-case-card.tsx', 'utf8')
eq('fejl blokerer', src.includes('const canConvert = preview ? preview.can_convert : !previewError'), true)
eq('fejltekst', src.includes('Kunne ikke hente forhåndsvisningen. Opret er blokeret, indtil den er hentet.'), true)
eq('kast fanges', src.includes('setPreviewError(true)'), true)
eq('fallback bliver', src.includes('Opretter en ny sag (SVC-…) med kunde, sagspartnere, tilbudsnummer som reference og tilbudssum som kontraktsum.'), true)
eq('tilbudssum bliver', src.includes('kr(preview.offer_sum, preview.currency)'), true)
eq('opret bliver', src.includes('createServiceCaseFromOffer(offerId)'), true)
eq('fakturering bliver', src.includes('data-testid="offer-invoice-on-case"'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-case-preview-test OK')
process.exitCode = fail ? 1 : 0
