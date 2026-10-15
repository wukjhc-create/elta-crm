/** Tom sagslog siger at man skriver ovenfor, naar man maa. Koer: npx tsx scripts/case-notes-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-notes-tab.tsx', 'utf8')
eq('skrivende bruger faar naeste skridt', src.includes('Skriv en note i feltet ovenfor. Noter fra tilbud vises også her.'), true)
eq('uden rettighed er teksten den samme', src.includes('Noter på sagen — fx når den oprettes fra et tilbud — vises her.'), true)
eq('feltet har et navn', src.includes('aria-label="Ny note"'), true)
eq('tilfoej er stadig den samme knap', src.includes('handleAdd') && src.includes('Tilføj note'), true)
eq('type har et navn', src.includes('aria-label="Notetype"'), true)
eq('rediger har et navn', src.includes('aria-label="Rediger note"'), true)
eq('slet har et navn', src.includes('aria-label="Slet note"'), true)
eq('noten ombrydes', src.includes('whitespace-pre-wrap break-words">{n.content}'), true)
eq('slet kraever stadig bekraeftelse', src.includes('Slet denne note? Handlingen kan ikke fortrydes.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-notes-empty-test OK')
process.exitCode = fail ? 1 : 0
