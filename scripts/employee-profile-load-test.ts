/** Medarbejderkortet siger naar hentningen fejler. Tomme tekster og datoer bliver. Koer: npx tsx scripts/employee-profile-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/employees/employee-profile-sections.tsx', 'utf8')

eq('fejl siges', src.includes('Det tælles ikke som en tom liste.'), true)
eq('login skjules ikke', src.includes('Login kunne ikke tjekkes'), true)
eq('certifikat skjules ikke', src.includes('Certifikater kunne ikke tjekkes'), true)
eq('intet login bliver', src.includes('Intet login'), true)
eq('ingen login-tekst bliver', src.includes('Ingen login knyttet.'), true)
eq('ingen satser bliver', src.includes('Ingen satser.'), true)
eq('intet udstyr bliver', src.includes('Intet udstyr registreret.'), true)
eq('ingen certifikater bliver', src.includes('Ingen certifikater registreret.'), true)
eq('dato bliver', src.includes('return copenhagenDateTimeLabel(s)') && src.includes('s.slice(0, 10)'), true)
eq('beloeb bliver', src.includes("style: 'currency'"), true)

console.log(fail ? `\n${fail} fejl` : '\nemployee-profile-load-test OK')
process.exitCode = fail ? 1 : 0
