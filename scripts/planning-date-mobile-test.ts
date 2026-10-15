/** Sagens plan: datoer kan krympe. Opret og omplan bliver. Koer: npx tsx scripts/planning-date-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-planning-tab.tsx', 'utf8')
const dateClass = 'w-full min-w-0 max-w-full px-3 py-2 border rounded-md text-sm'
eq('opret-gitter kan krympe', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0'), true)
eq('omplan-gitter kan krympe', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0'), true)
eq('dato kan krympe', src.split(dateClass).length - 1 === 2, true)
eq('opret-dato har navn', src.includes('aria-label="Planlagt dato"'), true)
eq('omplan-dato har navn', src.includes('aria-label="Ret planlagt dato"'), true)
eq('ingen tildelt bliver', src.includes('— Ingen tildelt —'), true)
eq('opret bliver', src.includes('Opret arbejdsordre'), true)
eq('gem bliver', src.includes('Gem dato og montør'), true)
eq('opdatering bliver', src.includes('updateWorkOrderPlanning(woId, patch)'), true)

console.log(fail ? `\n${fail} fejl` : '\nplanning-date-mobile-test OK')
process.exitCode = fail ? 1 : 0
