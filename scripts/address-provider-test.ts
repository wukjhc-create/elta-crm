/**
 * ADDR-1 (2026-10-19): adresseopslag er slået fra uden konfiguration — ingen netværkskald, tomme svar, aldrig fejl.
 *   npx tsx scripts/address-provider-test.ts
 */
import { getAddressProvider } from '../src/lib/address/provider'
import { searchDanishAddresses, lookupPostcode, isAddressLookupEnabled } from '../src/lib/services/address-lookup'

let bad = 0
const ok = (c: boolean, l: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`) }
let fetchCalls = 0
globalThis.fetch = (async () => { fetchCalls++; throw new Error('netværk må ikke kaldes') }) as typeof fetch

async function main() {
  delete process.env.ADDRESS_LOOKUP_ENABLED
  delete process.env.ADDRESS_LOOKUP_PROVIDER
  ok(getAddressProvider().name === 'disabled' && !isAddressLookupEnabled(), 'standard: slået fra')
  ok((await searchDanishAddresses('Odinsvej 10')).length === 0, 'søgning → tom liste')
  ok((await lookupPostcode('8000')) === null, 'postnummer → null (intet gæt)')
  process.env.ADDRESS_LOOKUP_ENABLED = 'true'
  process.env.ADDRESS_LOOKUP_PROVIDER = 'gsearch'
  ok(getAddressProvider().name === 'disabled', 'ENABLED=true + ukendt udbyder → stadig slået fra (ingen hårdkodet udbyder)')
  ok((await searchDanishAddresses('Odinsvej 10')).length === 0, 'ukendt udbyder → tom liste')
  ok(fetchCalls === 0, 'ingen netværkskald')
  console.log(`\n${bad === 0 ? '✅ ALLE ADRESSE-UDBYDER-TESTS PASS' : `❌ ${bad} FEJL`}`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
