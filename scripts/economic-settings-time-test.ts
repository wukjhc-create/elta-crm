/** e-conomic-indstillingens sidste tider er københavnske. Nøgler og testkald bliver. Kør: npx tsx scripts/economic-settings-time-test.ts */
import fs from 'fs'
import { copenhagenDateTimeLabel } from '../src/lib/utils/copenhagen-time'

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

const src = fs.readFileSync('src/app/dashboard/settings/economic/economic-settings-client.tsx', 'utf8')
eq('tiden bruger hjaelperen', src.includes('iso ? copenhagenDateTimeLabel(iso) :'), true)
eq('ingen lokal intl-klokke', src.includes("Intl.DateTimeFormat('da-DK'"), false)
eq('synk vises', src.includes('dkDateTime(status.last_sync_at)'), true)
eq('test vises', src.includes('dkDateTime(status.last_tested_at)'), true)
eq('raekker kan ombrydes', src.split('flex flex-wrap').length - 1 >= 6, true)
eq('maskeret noegle bliver', src.includes('status.api_token_masked') && src.includes('status.grant_token_masked'), true)
eq('adgangskodefelt bliver', src.includes('type="password"'), true)
eq('gem bliver', src.includes('updateEconomicCredentialsAction'), true)
eq('statushentning bliver', src.includes('getEconomicIntegrationStatusAction'), true)
eq('forbindelsestest bliver', src.includes('testEconomicConnectionAction'), true)
eq('ryd bliver', src.includes('clearEconomicIntegrationAction'), true)
eq('klar-til-bogfoering bliver', src.includes('data-testid="economic-readiness"'), true)

console.log(fail ? `\n${fail} fejl` : '\neconomic-settings-time-test OK')
process.exitCode = fail ? 1 : 0
