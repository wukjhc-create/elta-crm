/** Sagens sla-til-knapper siger hvilken raekke. Lav DB og auto-faktura bliver. Koer: npx tsx scripts/case-toggle-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-actions-tab.tsx', 'utf8')
eq('knappen siger kontakten', src.includes('aria-label={`${value ? \'Slå fra\' : \'Slå til\'}: ${label}`}'), true)
eq('synlig tekst bliver', src.includes("{value ? 'Slå fra' : 'Slå til'}"), true)
eq('raekken ombrydes', src.includes('flex flex-wrap items-center justify-between gap-2'), true)
eq('kan rammes', src.includes('min-h-[44px]'), true)
eq('lav db bliver', src.includes('onToggle={onToggleLowProfit}'), true)
eq('auto-faktura bliver', src.includes('onToggle={onToggleAutoInvoice}'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-toggle-name-test OK')
process.exitCode = fail ? 1 : 0
