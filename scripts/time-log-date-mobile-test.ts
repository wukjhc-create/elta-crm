/** Tidsregistrering: dato og klokkeslet kan krympe. Gem, kost og salg bliver. Koer: npx tsx scripts/time-log-date-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/work-order-time-logs.tsx', 'utf8')
eq('opret-gitter kan krympe', src.includes('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 min-w-0'), true)
eq('felt kan krympe', src.includes('space-y-0.5 min-w-0'), true)
eq('dato kan krympe', src.includes('type="date"') && src.includes('w-full min-w-0 max-w-full px-2 py-1 border rounded text-sm'), true)
eq('slut og timer kan krympe', src.split('w-1/2 min-w-0 max-w-full px-2 py-1 border rounded text-sm').length - 1 === 2, true)
eq('mobil-ret kan krympe', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-800 min-w-0'), true)
eq('desktop-ret beholder test', src.includes('data-testid="time-log-fix-start"') && src.includes('data-testid="time-log-fix-end"') && src.includes('data-testid="time-log-fix-save"'), true)
eq('gem bliver', src.includes("{isWorking ? 'Gemmer…' : 'Gem timer'}"), true)
eq('kost-gate bliver', src.includes('canSeeCost && totalCost > 0'), true)
eq('salg-gate bliver', src.includes('canSeeSale && totalSale > 0'), true)
eq('medarbejderfejl bliver', src.includes('Det tælles ikke som ingen medarbejdere.'), true)

console.log(fail ? `\n${fail} fejl` : '\ntime-log-date-mobile-test OK')
process.exitCode = fail ? 1 : 0
