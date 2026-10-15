/** Ny pakke kan rulles, og felterne har navne. Opret bliver. Koer: npx tsx scripts/package-create-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/packages/packages-client.tsx', 'utf8')

eq('panelet kan rulles', src.includes('w-full max-w-md max-h-[90vh] overflow-y-auto'), true)
eq('titel ombrydes', src.includes('break-words min-w-0">Ny pakke'), true)
eq('luk har et navn', src.includes('aria-label="Luk"') && src.includes('onClick={onClose}'), true)
eq('navn er koblet', src.includes('htmlFor="package-create-name"') && src.includes('id="package-create-name"'), true)
eq('kode er koblet', src.includes('htmlFor="package-create-code"') && src.includes('id="package-create-code"'), true)
eq('kategori er koblet', src.includes('htmlFor="package-create-category"') && src.includes('id="package-create-category"'), true)
eq('vaelg bliver', src.includes('Vælg kategori...'), true)
eq('kategorifejl bliver', src.includes('data-testid="package-create-categories-error"') && src.includes('Det tælles ikke som ingen kategorier.'), true)
eq('opret bliver', src.includes("'Opret pakke'"), true)
eq('opretter bliver', src.includes("'Opretter...'"), true)

console.log(fail ? `\n${fail} fejl` : '\npackage-create-mobile-test OK')
process.exitCode = fail ? 1 : 0
