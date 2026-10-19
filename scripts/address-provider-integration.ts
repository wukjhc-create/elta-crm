/**
 * ADDR-1 integrationstest mod den RIGTIGE Adressevælger (adressevaelger.dk). Kun læsende GET-kald.
 * Tokenet genereres tilfældigt pr. kørsel (KDS har endnu ingen brugerregistrering) og gemmes ingen steder — i miljøerne
 * ligger det i ADDRESS_LOOKUP_TOKEN (serverside).
 *   npx tsx scripts/address-provider-integration.ts
 */
import { randomBytes } from 'crypto'

process.env.ADDRESS_LOOKUP_ENABLED = 'true'
process.env.ADDRESS_LOOKUP_PROVIDER = 'adressevaelger'
process.env.ADDRESS_LOOKUP_TOKEN = `elta-crm-it-${randomBytes(16).toString('hex')}`

let bad = 0
const ok = (c: boolean, l: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${note ? `  — ${note}` : ''}`) }

async function main() {
  const { searchDanishAddresses, resolveAddressSuggestion, lookupPostcode } = await import('../src/lib/services/address-lookup')
  const { getAddressProvider } = await import('../src/lib/address/provider')

  const a = await searchDanishAddresses('Ålekistevej 12, 2720')
  ok(a.some((s) => s.label.startsWith('Ålekistevej 12') && s.postalCode === '2720' && s.city === 'Vanløse'), 'æ/ø/å: Ålekistevej 12, 2720 Vanløse', a[0]?.label)

  const f = await searchDanishAddresses('Nørrebrogade 20, 2. th, 2200')
  const fa = f.find((s) => s.kind === 'adresse')
  ok(!!fa, 'etage/dør: enhedsforslag fundet', f.map((s) => s.label).join(' | '))
  if (fa?.id) {
    const full = await resolveAddressSuggestion(fa.id, 'adresse')
    ok(!!full && full.street === 'Nørrebrogade' && full.houseNumber === '20' && full.floor === '2' && full.postalCode === '2200' && full.city === 'København N', 'opslag af enhed: vej/nr/etage/postnr/by', full ? `${full.label} etage=${full.floor} dør=${full.door ?? '-'}` : 'null')
    ok(!!full && (full.latitude ?? 0) > 55.6 && (full.latitude ?? 0) < 55.8 && (full.longitude ?? 0) > 12.4 && (full.longitude ?? 0) < 12.7, 'opslag: WGS84-koordinater i København', full ? `${full.latitude},${full.longitude}` : '')
  }

  const c = await searchDanishAddresses('Nørrebrogade 20,2200')
  ok(c.some((s) => s.postalCode === '2200'), 'komma uden mellemrum giver alligevel fund', c[0]?.label)

  const v = await searchDanishAddresses('Noerrebrogade 20, 2200')
  ok(v.some((s) => s.label.startsWith('Nørrebrogade 20')), 'oe → ø-variant ved 0 fund', v[0]?.label)

  const h = await searchDanishAddresses('Nørrebrogade 20, 2200')
  const hh = h.find((s) => s.kind === 'husnummer')
  if (hh?.id) {
    const full = await resolveAddressSuggestion(hh.id, 'husnummer')
    ok(!!full && full.street === 'Nørrebrogade' && full.postalCode === '2200' && !full.floor, 'opslag af husnummer (adgangsadresse)', full?.label)
  } else ok(h.length > 0, 'husnummer-forslag eller enhedsforslag findes', h[0]?.label)

  const none = await searchDanishAddresses('xqzvw 99999')
  ok(none.length === 0, 'intet fund → tom liste')

  const p = getAddressProvider()
  const slow = await p.searchAddresses('Ålekistevej 12', { timeoutMs: 1 })
  ok(slow.length === 0, 'timeout → tom liste (ingen fejl)')

  ok((await lookupPostcode('4583'))?.city === 'Sjællands Odde', 'postnummer → by (lokalt DAR-datasæt)')
  ok((await lookupPostcode('0000')) === null, 'ukendt postnummer → null')

  console.log(`\n${bad === 0 ? '✅ ADRESSE-INTEGRATION PASS' : `❌ ${bad} FEJL`}`)
  process.exit(bad === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
