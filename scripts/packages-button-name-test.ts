/** Pakke-admin navngiver gem og slet. Pris og bekraeftelse bliver. Koer: npx tsx scripts/packages-button-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/packages/packages-admin-client.tsx', 'utf8')
eq('gem pakke navngiver', src.includes('aria-label={`Gem pakke ${pkg.name}`}'), true)
eq('slet pakke navngiver', src.includes('aria-label={`Slet pakke ${pkg.name}`}'), true)
eq('gem tilvalg navngiver', src.includes('aria-label={`Gem tilvalg ${option.name}`}'), true)
eq('slet tilvalg navngiver', src.includes('aria-label={`Slet tilvalg ${option.name}`}'), true)
eq('pris har et navn', src.includes('aria-label={`Pris på ${option.name || \'tilvalg\'}`}'), true)
eq('bekraeftelse bliver', src.includes('Slet tilvalg "${option.name}"') && src.includes('Tilknyttede tilvalg slettes også.'), true)
eq('sletning bliver', src.includes('deleteOptionAction') && src.includes('deletePackageAction'), true)
eq('grundpris bliver', src.includes('base_price: Number(basePrice) || 0'), true)

console.log(fail ? `\n${fail} fejl` : '\npackages-button-name-test OK')
process.exitCode = fail ? 1 : 0
