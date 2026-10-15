/** Ny sag: planlagte datoer kan krympe. Register bliver. Koer: npx tsx scripts/new-order-date-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/new/new-order-form.tsx', 'utf8')
eq('plan stables', src.split('grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0').length - 1 === 3, true)
eq('dato kan krympe', src.split('type="date"').length - 1 === 2 && src.includes('w-full min-w-0 max-w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary'), true)
eq('start bliver', src.includes("register('start_date')"), true)
eq('slut bliver', src.includes("register('end_date')"), true)
eq('timer bliver', src.includes("register('planned_hours')"), true)
eq('felt kan krympe', src.includes('space-y-1 min-w-0'), true)

console.log(fail ? `\n${fail} fejl` : '\nnew-order-date-mobile-test OK')
process.exitCode = fail ? 1 : 0
