/** Testfaktura slettes ikke naar linjerne ikke kan laeses. Vagten og et aegte tomt saet bliver. Koer: npx tsx scripts/invoice-test-delete-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function deleteTestIncomingInvoiceAction')
const end = action.indexOf('\nexport async function ', start + 10)
const fn = action.slice(start, end === -1 ? action.length : end)
eq('funktion findes', start > 0 && end > start, true)
eq('fakturafejl foer ikke-fundet', fn.indexOf('if (invErr)') < fn.indexOf("message: 'Faktura ikke fundet'"), true)
eq('linjer foer sletning', fn.indexOf('if (lineErr)') < fn.indexOf('Kunne ikke slette:'), true)
eq('materiale foer sletning', fn.indexOf('if (matErr)') < fn.indexOf('Kunne ikke slette:'), true)
eq('udlaeg foer sletning', fn.indexOf('if (otherErr)') < fn.indexOf('Kunne ikke slette:'), true)
eq('aegte nul efter fejl', fn.indexOf('if (matErr)') < fn.indexOf('removedMaterials += count ?? 0'), true)
eq('testvagt bliver', fn.includes('Refused: dette er ikke en TEST-faktura (sikkerhedsguard).'), true)
eq('ikke-fundet bliver', fn.includes("message: 'Faktura ikke fundet'"), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('bekræftelse bliver', view.includes('Reelle fakturaer er beskyttet og kan ikke slettes ad denne vej.'), true)
eq('svar vises', view.includes('flash(r.ok, r.message)'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-test-delete-test OK')
process.exitCode = fail ? 1 : 0
