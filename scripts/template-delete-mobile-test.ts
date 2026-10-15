/** Slet skabelon kan rammes paa mobil. Pris og bekraeftelse bliver. Koer: npx tsx scripts/template-delete-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/calculator/template-dialog.tsx', 'utf8')

eq('slet kan rammes paa mobil', src.includes('opacity-100 sm:opacity-0 sm:group-hover:opacity-100'), true)
eq('slet har et navn', src.includes('aria-label="Slet skabelon"'), true)
eq('slet stopper raekke-klikket', src.includes('e.stopPropagation()'), true)
eq('slet kraever stadig bekraeftelse', src.includes('Er du sikker på at du vil slette denne skabelon?'), true)
eq('slet kalder samme funktion', src.includes('deleteTemplate(id)'), true)
eq('navn ombrydes', src.includes('font-medium break-words">{template.name}'), true)
eq('pris bliver', src.includes('formatCurrency(template.template_data?.totalPrice || 0)'), true)
eq('tom liste bliver', src.includes('Gem en beregning som skabelon for at komme i gang'), true)

console.log(fail ? `\n${fail} fejl` : '\ntemplate-delete-mobile-test OK')
process.exitCode = fail ? 1 : 0
