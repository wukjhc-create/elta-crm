/** Tidsformularens gem og annuller kan rammes, og raekken ombrydes. Kost og salg bliver bag gates. Koer: npx tsx scripts/time-log-form-touch-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/work-order-time-logs.tsx', 'utf8')
eq('annuller har et navn', src.includes('aria-label="Annullér tidsregistrering"'), true)
eq('gem har et navn', src.includes("aria-label={isWorking ? 'Gemmer timer' : 'Gem timer'}"), true)
eq('synlig gem bliver', src.includes("{isWorking ? 'Gemmer…' : 'Gem timer'}"), true)
eq('knapper kan rammes', src.split('min-h-[44px]').length >= 3, true)
eq('raekken ombrydes', src.includes('flex flex-wrap items-center justify-between gap-2'), true)
eq('kost-gate bliver', src.includes('canSeeCost && totalCost > 0'), true)
eq('salg-gate bliver', src.includes('canSeeSale && totalSale > 0'), true)

console.log(fail ? `\n${fail} fejl` : '\ntime-log-form-touch-test OK')
process.exitCode = fail ? 1 : 0
