/** Opret kunde kobler felterne. Gem og type bliver. Koer: npx tsx scripts/customer-create-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-create-dialog.tsx', 'utf8')

const pairs = [
  ['customer-create-name', 'value={primaryName}'],
  ['customer-create-contact', 'value={contactPerson}'],
  ['customer-create-vat', 'value={vatNumber}'],
  ['customer-create-email', 'value={email}'],
  ['customer-create-phone', 'value={phone}'],
  ['customer-create-mobile', 'value={mobile}'],
  ['customer-create-website', 'value={website}'],
  ['customer-create-address', 'value={address}'],
  ['customer-create-postal', 'value={postalCode}'],
  ['customer-create-city', 'value={city}'],
  ['customer-create-ship-address', 'value={shippingAddress}'],
  ['customer-create-ship-postal', 'value={shippingPostalCode}'],
  ['customer-create-ship-city', 'value={shippingCity}'],
  ['customer-create-notes', 'value={notes}'],
]

for (const [id, value] of pairs) {
  eq(`${id} er koblet`, src.includes(`htmlFor="${id}"`) && src.includes(`id="${id}"`) && src.includes(value), true)
}

eq('type viser om den er valgt', src.includes("aria-pressed={type === 'private'}") && src.includes("aria-pressed={type === 'business'}"), true)
eq('overskrift beholder sit id', src.includes('id="customer-create-title"'), true)
eq('opret bliver', src.includes('Opret kunde') && src.includes('onClick={handleSave}'), true)
eq('luk bliver', src.includes('aria-label="Luk"'), true)
eq('mail og telefon stables', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-3'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-create-label-test OK')
process.exitCode = fail ? 1 : 0
