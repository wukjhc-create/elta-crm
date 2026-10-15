/** Kalkulation og tilbud-fra-kalkulation siger naar kundelisten fejler. Priser og valgfri kunde bliver. Koer: npx tsx scripts/calc-customer-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const form = fs.readFileSync('src/components/modules/calculations/calculation-form.tsx', 'utf8')
const modal = fs.readFileSync('src/components/modules/kalkia/CreateOfferModal.tsx', 'utf8')

eq('formular kast siges', form.includes("setCustomerLoadError('Kunne ikke hente kunder')"), true)
eq('formular ikke ingen', form.includes('Det tælles ikke som ingen kunder.'), true)
eq('valgfri kunde bliver', form.includes('Vælg kunde (valgfri)'), true)
eq('avance bliver', form.includes('name="margin_percentage"') && form.includes('max="100"'), true)
eq('modal kast siges', modal.includes("setCustomerLoadError('Kunne ikke hente kunder')"), true)
eq('modal ikke ingen', modal.includes('Det tælles ikke som ingen kunder.'), true)
eq('soegning uden traef bliver', modal.includes('Ingen kunder fundet'), true)
eq('kunde kraeves stadig', modal.includes("setError('Vælg en kunde')"), true)
eq('gyldig dato bliver koebenhavn', modal.includes('copenhagenParts(defaultDate).date'), true)
eq('beloeb bliver', modal.includes('formatCurrency(result.finalAmount)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalc-customer-load-test OK')
process.exitCode = fail ? 1 : 0
