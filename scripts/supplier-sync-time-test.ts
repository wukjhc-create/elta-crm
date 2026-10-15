/** Leverandørsynkens tider er københavnske. Synk, import og produkttal bliver. Kør: npx tsx scripts/supplier-sync-time-test.ts */
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
const long = copenhagenDateTimeLabel('2026-10-14T22:30:00Z', 'long')
eq('lang maaned er oktober', long.toLowerCase().includes('oktober'), true)
eq('lang maaned er naeste dag', long.startsWith('15'), true)

const lemu = fs.readFileSync('src/components/modules/suppliers/lemu-sync-status.tsx', 'utf8')
const overview = fs.readFileSync('src/components/modules/suppliers/supplier-sync-overview.tsx', 'utf8')
const settings = fs.readFileSync('src/components/modules/suppliers/supplier-settings-form.tsx', 'utf8')

eq('lm bruger hjaelperen', lemu.includes('return copenhagenDateTimeLabel(iso)'), true)
eq('lm aldrig bliver', lemu.includes("if (!iso) return 'Aldrig'"), true)
eq('lm synk bliver', lemu.includes('triggerLemuSync') && lemu.includes('getLemuSyncStatus'), true)
eq('lm ingen lokal klokke', lemu.includes('toLocaleDateString'), false)

eq('oversigt bruger hjaelperen', overview.includes('return copenhagenDateTimeLabel(iso)'), true)
eq('oversigt aldrig bliver', overview.includes("if (!iso) return 'Aldrig'"), true)
eq('oversigt synk bliver', overview.includes('triggerLemuSync') && overview.includes('getAllSupplierSyncStatuses'), true)
eq('produkttal bliver', overview.includes("s.product_count.toLocaleString('da-DK')"), true)
eq('importlink bliver', overview.includes('supplier-import-${s.code}'), true)
eq('oversigt kan ombrydes', overview.includes('flex flex-wrap items-center gap-x-4 gap-y-1'), true)
eq('oversigt ingen lokal klokke', overview.includes('toLocaleDateString'), false)

eq('sidst importeret bruger hjaelperen', settings.includes("copenhagenDateTimeLabel(settings.last_import_at, 'long')"), true)
eq('indstillinger gemmes stadig', settings.includes('updateSupplierSettings') && settings.includes('getSupplierSettings'), true)
eq('indstillinger ingen lokal klokke', settings.includes('toLocaleString'), false)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-sync-time-test OK')
process.exitCode = fail ? 1 : 0
