/** Profil, snapshot, prisforklaring og leverandørtest vises i københavnsk dato. Kør: npx tsx scripts/record-stamp-time-test.ts */
import fs from 'fs'
import { copenhagenDateLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = copenhagenDateLabel('2026-01-15T23:30:00.000Z')
eq('sen aften er naeste dag', late.startsWith('16'), true)
eq('sen aften er ikke utc-dagen', late.startsWith('15'), false)

const profile = fs.readFileSync('src/app/dashboard/settings/profile/profile-settings-client.tsx', 'utf8')
eq('oprettet bruger hjaelperen', profile.includes('copenhagenDateLabel(profile.created_at)'), true)
eq('opdateret bruger hjaelperen', profile.includes('copenhagenDateLabel(profile.updated_at)'), true)
eq('kontoen stables paa mobil', profile.includes('grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm'), true)
eq('billede-knappen bliver', profile.includes('aria-label="Skift profilbillede"'), true)

const snap = fs.readFileSync('src/components/modules/calculations/calculation-snapshots.tsx', 'utf8')
eq('snapshot bruger hjaelperen', snap.includes('copenhagenDateLabel(snap.created_at)'), true)
eq('snapshot kan ombrydes', snap.includes('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5'), true)
eq('pris bliver', snap.includes('formatCurrency(snap.total_price)'), true)

const price = fs.readFileSync('src/components/modules/offers/price-explanation-card.tsx', 'utf8')
eq('prisforklaring bruger hjaelperen', price.includes('copenhagenDateLabel(savedExplanation.generated_at)'), true)

const cred = fs.readFileSync('src/components/modules/suppliers/supplier-credentials-form.tsx', 'utf8')
eq('leverandoertest bruger hjaelperen', cred.includes('copenhagenDateLabel(cred.last_test_at)'), true)
eq('status kan ombrydes', cred.includes('flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-sm'), true)
eq('forbindelse ok bliver', cred.includes('Forbindelse OK'), true)
eq('adgangskode har et navn', cred.includes("aria-label={showPasswords['new'] ? 'Skjul adgangskode' : 'Vis adgangskode'}"), true)

console.log(fail ? `\n${fail} fejl` : '\nrecord-stamp-time-test OK')
process.exitCode = fail ? 1 : 0
