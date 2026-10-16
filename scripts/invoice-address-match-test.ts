/**
 * LF-8 (indkøbs-review 2026-10-16): adresse-fallback i leverandørfaktura-matcheren bruger gadenavn + husnummer
 * (ikke kun første ord), så et brevhoved eller en anden sag på samme vej ikke matches.
 * Kør: npx tsx scripts/invoice-address-match-test.ts
 */
import { pickAddressCandidate as pick } from '../src/lib/services/incoming-invoice-matcher'

let bad = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${JSON.stringify(got)} (forventet ${JSON.stringify(want)})`}`)
}

eq('gade + nummer + postnr', pick(['Hovedgaden 12 8000 Aarhus C']), { zip: '8000', streetToken: 'Hovedgaden 12' })
eq('med etage efter komma', pick(['Hovedgaden 12, 2. th 8000 Aarhus C']), { zip: '8000', streetToken: 'Hovedgaden 12' })
eq('navn foran (leveringsadresse) → kun gade + nummer', pick(['Jens Hansen Hovedgaden 12 8000 Aarhus']), { zip: '8000', streetToken: 'Hovedgaden 12' })
eq('flerordet gadenavn → sidste ord + nummer', pick(['Gl. Kongevej 5 1610 København V']), { zip: '1610', streetToken: 'Kongevej 5' })
eq('husnummer med bogstav', pick(['Industrivej 5B 7100 Vejle']), { zip: '7100', streetToken: 'Industrivej 5B' })
eq('ingen adresse', pick(['Faktura 12345']), null)

console.log(bad ? `\n❌ ${bad} fejl` : '\nALL PASS')
process.exitCode = bad ? 1 : 0
