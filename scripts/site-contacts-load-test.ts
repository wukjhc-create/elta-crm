/** Leveringskontakter siger naar hentningen fejler. En aegte tom liste bliver. Koer: npx tsx scripts/site-contacts-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/edit-site-info-dialog.tsx', 'utf8')
eq('banner', src.includes('data-testid="site-contacts-load-error"') && src.includes('Det tælles ikke som ingen kontakter.'), true)
eq('samme sag bliver', src.includes('contactsKey.current === term') && src.includes('De tidligere kontakter bliver.'), true)
eq('anden sag ryddes', src.includes('setContacts([])'), true)
eq('aegte liste bliver', src.includes('setContacts((res.contacts ?? []) as ContactOption[])'), true)
eq('tom valg bliver', src.includes('— Ingen kontaktperson valgt —'), true)
eq('hentning bliver', src.includes('getContactsForCase(caseId)'), true)
eq('kast siges', src.includes("setContactsError('Kunne ikke hente kontakter')"), true)

console.log(fail ? `\n${fail} fejl` : '\nsite-contacts-load-test OK')
process.exitCode = fail ? 1 : 0
