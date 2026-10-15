/** Deling aendres ikke naar dokumentet ikke kan laeses. Koer: npx tsx scripts/customer-doc-share-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-documents.ts', 'utf8')
const start = action.indexOf('export async function setCustomerDocumentPortalVisibility')
const body = action.slice(start, start + 2200)
eq('funktion findes', body.includes('setCustomerDocumentPortalVisibility'), true)
eq('laesefejl foer ikke-fundet', body.indexOf('if (docErr)') < body.indexOf("error: 'Dokumentet blev ikke fundet'"), true)
eq('laesefejl foer deling', body.indexOf('Delingen er ikke ændret.') < body.indexOf('.update('), true)
eq('ikke-fundet bliver', body.includes("error: 'Dokumentet blev ikke fundet'"), true)
eq('mail bliver intern', body.includes("error: 'Mail-vedhæftninger kan ikke deles med kunden'"), true)
eq('fuldmagt bliver', body.includes("error: 'Fuldmagter vises i portalens fuldmagt-sektion'"), true)
eq('deling skriver stadig synlighed', body.includes('visible_in_portal: !!visible'), true)

const ui = fs.readFileSync('src/components/modules/customers/customer-documents-tab.tsx', 'utf8')
eq('fanen viser fejlen', ui.includes("toast.error(r.error || 'Kunne ikke ændre deling')"), true)
eq('mailarkiv deles ikke i ui', ui.includes('!doc.source_email_id && shareButton(doc)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-doc-share-read-test OK')
process.exitCode = fail ? 1 : 0
