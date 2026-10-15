/** Ret sag: planlagte datoer kan krympe. Register og opdatering bliver. Koer: npx tsx scripts/edit-order-date-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/edit/edit-order-form.tsx', 'utf8')
eq('plan stables', src.split('grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0').length - 1 === 3, true)
eq('dato kan krympe', src.split('type="date"').length - 1 === 2 && src.includes('w-full min-w-0 max-w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary'), true)
eq('start bliver', src.includes("register('start_date')"), true)
eq('slut bliver', src.includes("register('end_date')"), true)
eq('timer bliver', src.includes("register('planned_hours')"), true)
eq('felt kan krympe', src.includes('space-y-1 min-w-0'), true)
eq('opdatering bliver', src.includes('updateServiceCase(sag.id, payload)'), true)
eq('medarbejderfejl bliver', src.includes('Det tælles ikke som ingen medarbejdere.'), true)

console.log(fail ? `\n${fail} fejl` : '\nedit-order-date-mobile-test OK')
process.exitCode = fail ? 1 : 0
