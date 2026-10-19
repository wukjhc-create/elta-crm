/**
 * ADDR-1 (2026-10-19) unit-tests — intet netværk:
 *  - slået fra uden konfiguration (ingen kald, tomme svar)
 *  - Adressevælger-udbyder: forespørgsels-normalisering (komma/mellemrum), oe/ae/aa-variant, titel-opdeling, normalisering af
 *    opslag (etage/dør, postnr/by, kommune, UTM32→WGS84), udbyderfejl/timeout → tomme svar
 *  - postnummer → by fra det importerede DAR-datasæt (kendt/ukendt/ugyldigt, flag)
 *   npx tsx scripts/address-provider-test.ts
 */
import { getAddressProvider } from '../src/lib/address/provider'
import { searchDanishAddresses, lookupPostcode, isAddressLookupEnabled, resolveAddressSuggestion } from '../src/lib/services/address-lookup'
import { normalizeQuery, danishLetterVariant, parseTitle, normalizeAdressevaelger } from '../src/lib/address/providers/adressevaelger'
import { utm32ToWgs84 } from '../src/lib/address/utm32'
import { POSTCODE_DATASET_META, cityForPostcodeLocal } from '../src/lib/address/postcodes'

let bad = 0
const ok = (c: boolean, l: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`) }
let fetchCalls = 0
let fetchImpl: () => Promise<Response> = async () => { throw new Error('netværk må ikke kaldes') }
globalThis.fetch = (async () => { fetchCalls++; return fetchImpl() }) as typeof fetch

const SAMPLE_ADRESSE = {
  status: 'ok',
  adresse: {
    id_lokalid: '0a3f509f-ecc0-32b8-e044-0003ba298018', adressebetegnelse: 'Nørrebrogade 20, 2. th, 2200 København N',
    etagebetegnelse: '2', doerbetegnelse: 'th',
    husnummer: {
      id_lokalid: '0a3f507a-d058-32b8-e044-0003ba298018', husnummertekst: '20', vejnavn: 'Nørrebrogade',
      adgangspunkt: { koordinater: { x: 723778.72, y: 6177121.16 } },
      postnummer: { postnr: '2200', navn: 'København N' }, navngivenvejkommunedel: { kommune: '0101' },
    },
  },
}

async function main() {
  // --- slået fra ---
  delete process.env.ADDRESS_LOOKUP_ENABLED
  delete process.env.ADDRESS_LOOKUP_PROVIDER
  delete process.env.ADDRESS_LOOKUP_TOKEN
  ok(getAddressProvider().name === 'disabled' && !isAddressLookupEnabled(), 'standard: slået fra')
  ok((await searchDanishAddresses('Odinsvej 10')).length === 0, 'søgning → tom liste')
  ok((await lookupPostcode('8000')) === null, 'postnummer → null når slået fra')
  ok((await resolveAddressSuggestion('0a3f509f-ecc0-32b8-e044-0003ba298018', 'adresse')) === null, 'opslag → null når slået fra')
  process.env.ADDRESS_LOOKUP_ENABLED = 'true'
  process.env.ADDRESS_LOOKUP_PROVIDER = 'gsearch'
  ok(getAddressProvider().name === 'disabled', 'ukendt udbyder → slået fra (ingen hårdkodet udbyder)')
  process.env.ADDRESS_LOOKUP_PROVIDER = 'adressevaelger'
  ok(getAddressProvider().name === 'disabled', 'adressevaelger uden token → slået fra (intet gættet token)')
  ok(fetchCalls === 0, 'ingen netværkskald indtil nu')

  // --- rene funktioner ---
  ok(normalizeQuery('Nørrebrogade 20,2200') === 'Nørrebrogade 20, 2200', 'komma uden mellemrum rettes')
  ok(normalizeQuery('  Ålekistevej   12 ,  2720 ') === 'Ålekistevej 12, 2720', 'overskydende mellemrum fjernes')
  ok(danishLetterVariant('Norrebrogade') === null && danishLetterVariant('Noerrebrogade 20') === 'Nørrebrogade 20', 'oe → ø-variant')
  ok(danishLetterVariant('Aalborgvej, Aeroevej') === 'Ålborgvej, Ærøvej', 'aa/ae/oe-variant')
  const t = parseTitle('Nørrebrogade 20, 2., 2200 København N')
  ok(!!t && t.street === 'Nørrebrogade' && t.houseNumber === '20' && t.floorDoor === '2.' && t.postalCode === '2200' && t.city === 'København N', 'titel opdeles (vej/nr/etage/postnr/by)')
  ok(parseTitle('ugyldig') === null, 'ugyldig titel → null')
  const n = normalizeAdressevaelger(SAMPLE_ADRESSE)
  ok(!!n && n.street === 'Nørrebrogade' && n.houseNumber === '20' && n.floor === '2' && n.door === 'th', 'opslag: vej/nr/etage/dør')
  ok(!!n && n.postalCode === '2200' && n.city === 'København N' && n.municipality === '0101' && n.resolved === true, 'opslag: postnr/by/kommune')
  ok(!!n && Math.abs((n.latitude ?? 0) - 55.68818) < 0.001 && Math.abs((n.longitude ?? 0) - 12.56028) < 0.001, 'opslag: UTM32 → WGS84')
  ok(normalizeAdressevaelger({ status: 'ok' }) === null, 'tomt opslag → null')
  ok(utm32ToWgs84(0, 0) === null, 'koordinat uden for Danmark → null')

  // --- udbyder med token: fejl/timeout ---
  process.env.ADDRESS_LOOKUP_TOKEN = `test-${Date.now()}-0123456789`
  const p = getAddressProvider()
  ok(p.name === 'adressevaelger' && p.enabled, 'adressevaelger + token → aktiv')
  fetchImpl = async () => { throw new Error('ECONNRESET') }
  ok((await searchDanishAddresses('Nørrebrogade 20')).length === 0, 'udbyderfejl → tom liste (ingen fejl)')
  fetchImpl = async () => new Response('err', { status: 503 })
  ok((await searchDanishAddresses('Nørrebrogade 20')).length === 0, 'HTTP 503 → tom liste')
  ok((await resolveAddressSuggestion('0a3f509f-ecc0-32b8-e044-0003ba298018', 'adresse')) === null, 'opslag ved fejl → null')
  fetchImpl = async () => new Response(JSON.stringify({ status: 'ok', fund: [{ type: 'adresse', id: '0a3f509f-ecc0-32b8-e044-0003ba298018', titel: 'Nørrebrogade 20, 2., 2200 København N', husnummerId: 'x' }] }), { status: 200 })
  const res = await searchDanishAddresses('Nørrebrogade 20, 2.')
  ok(res.length === 1 && res[0].resolved === false && res[0].kind === 'adresse' && res[0].postalCode === '2200', 'søgefund → foreløbigt forslag med id/type')
  fetchImpl = async () => new Response(JSON.stringify(SAMPLE_ADRESSE), { status: 200 })
  const full = await resolveAddressSuggestion('0a3f509f-ecc0-32b8-e044-0003ba298018', 'adresse')
  ok(!!full && full.floor === '2' && full.door === 'th', 'opslag via udbyder → fulde felter')
  ok((await resolveAddressSuggestion('ikke-et-id', 'adresse')) === null, 'ugyldigt id → null uden kald')

  // --- postnummer (importeret DAR-datasæt) ---
  ok(POSTCODE_DATASET_META.count > 1000 && !!POSTCODE_DATASET_META.fetchedAt && /CC BY 4\.0/.test(POSTCODE_DATASET_META.license), 'datasæt med kilde/version/licens')
  ok(cityForPostcodeLocal('8000') === 'Aarhus C' && cityForPostcodeLocal('2200') === 'København N' && cityForPostcodeLocal('4583') === 'Sjællands Odde', 'kendte postnumre (æ/ø/å)')
  ok(cityForPostcodeLocal('0000') === null && cityForPostcodeLocal('80000') === null && cityForPostcodeLocal('abcd') === null, 'ukendt/ugyldigt → null (intet gæt)')
  const calls = fetchCalls
  ok((await lookupPostcode('9990'))?.city === 'Skagen' && fetchCalls === calls, 'postnummeropslag er lokalt (intet netværk)')

  console.log(`\n${bad === 0 ? '✅ ALLE ADRESSE-TESTS PASS' : `❌ ${bad} FEJL`}`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
