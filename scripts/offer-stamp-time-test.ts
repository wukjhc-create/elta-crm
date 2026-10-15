/** Tilbuddets tidsstempler vises i københavnsk tid. Gyldig-til bliver. Kør: npx tsx scripts/offer-stamp-time-test.ts */
import fs from 'fs'
import { copenhagenDateLabel, copenhagenDateTimeLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = copenhagenDateTimeLabel('2026-01-15T23:30:00.000Z')
eq('sen aften er naeste dag', late.startsWith('16'), true)
eq('sen aften er ikke utc-dagen', late.startsWith('15'), false)
eq('klokken er 00.30', late.includes('00.30') || late.includes('00:30'), true)
const day = copenhagenDateLabel('2026-01-15T23:30:00.000Z', 'long')
eq('datoen er naeste dag', day.startsWith('16'), true)
eq('datoen er ikke utc-dagen', day.startsWith('15'), false)

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const stamps = src.slice(src.indexOf('>Tidsstempler<'), src.indexOf('OfferRejectionDetailsCard'))
eq('oprettet bruger hjaelperen', stamps.includes('copenhagenDateTimeLabel(offer.created_at)'), true)
eq('sendt bruger hjaelperen', stamps.includes('copenhagenDateTimeLabel(offer.sent_at)'), true)
eq('set bruger hjaelperen', stamps.includes('copenhagenDateTimeLabel(offer.viewed_at)'), true)
eq('accepteret bruger hjaelperen', stamps.includes('copenhagenDateTimeLabel(offer.accepted_at)'), true)
eq('afvist bruger hjaelperen', stamps.includes('copenhagenDateTimeLabel(offer.rejected_at)'), true)
eq('raekken kan ombrydes', stamps.includes('flex flex-wrap items-baseline justify-between'), true)
const preview = src.slice(src.indexOf('Dato: '), src.indexOf('Dato: ') + 500)
eq('forhaandsvisningens dato bruger hjaelperen', preview.includes("copenhagenDateLabel(offer.created_at, 'long')"), true)
eq('forhaandsvisningen kan ombrydes', src.includes('flex flex-wrap gap-x-8 gap-y-2 mb-6 text-sm'), true)
eq('gyldig-til bliver', src.includes("format(new Date(offer.valid_until), 'd. MMMM yyyy'") && src.includes("format(new Date(offer.valid_until), 'd. MMMM yyyy', { locale: da })"), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-stamp-time-test OK')
process.exitCode = fail ? 1 : 0
