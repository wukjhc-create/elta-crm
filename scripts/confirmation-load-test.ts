/** Bekraeftelsesstatus siger naar hentningen fejler. Tom pille og send videre bliver. Koer: npx tsx scripts/confirmation-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/document-confirmation-status.tsx', 'utf8')
eq('samme dokument beholdes', src.includes('loadedDoc.current !== documentId'), true)
eq('tilladelse rydder', src.includes("message.includes('Manglende tilladelse')"), true)
eq('fejl siger det', src.includes('data-testid="confirmation-load-error"') && src.includes('Det tælles ikke som ingen modtagere.'), true)
eq('tom succes skjuler pillen', src.includes('if (items.length === 0) return null'), true)
eq('spinner kun uden raekker', src.includes('isLoading && items.length === 0'), true)
eq('send videre bliver', src.includes('sendReadyChainStep(item.id)') && src.includes('Send videre til partner'), true)
eq('modtager ombrydes', src.includes('item.recipientName || item.recipientEmail'), true)

console.log(fail ? `\n${fail} fejl` : '\nconfirmation-load-test OK')
process.exitCode = fail ? 1 : 0
