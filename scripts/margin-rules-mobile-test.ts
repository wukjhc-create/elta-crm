/** Marginregler kan laeses og navngives paa mobil. Procenterne bliver. Koer: npx tsx scripts/margin-rules-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/margin-rules-manager.tsx', 'utf8')

eq('raekken ombrydes', src.includes('flex flex-wrap items-center gap-3'), true)
eq('rediger har et navn', src.includes('aria-label="Rediger regel"') && src.includes('handleEdit(rule)'), true)
eq('slet har et navn', src.includes('aria-label="Slet regel"') && src.includes('handleDelete(rule)'), true)
eq('toggle har et navn', src.includes('Deaktiver regel') && src.includes('handleToggle(rule.id)'), true)
eq('margin bliver', src.includes('{rule.margin_percentage}% margin'), true)
eq('fast tillaeg bliver', src.includes('{rule.fixed_markup} kr fast tillæg'), true)
eq('tom liste bliver', src.includes('Tilføj regler for at styre avancer automatisk'), true)

console.log(fail ? `\n${fail} fejl` : '\nmargin-rules-mobile-test OK')
process.exitCode = fail ? 1 : 0
