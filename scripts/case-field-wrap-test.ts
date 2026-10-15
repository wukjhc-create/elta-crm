/** Sagens feltvaerdier ombrydes. Streng-titel og noegletal er de samme. Koer: npx tsx scripts/case-field-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-detail-client.tsx', 'utf8')
const rowStart = src.indexOf('function Row({ label, value }')
const row = src.slice(rowStart, src.indexOf('function Stat', rowStart))
const panelStart = src.indexOf('function Panel(')
const panel = src.slice(panelStart, rowStart)

eq('feltvaerdi ombrydes', row.includes('text-right text-gray-900 min-w-0 break-words'), true)
eq('feltvaerdi klippes ikke', row.includes('truncate') || row.includes('max-w-[65%]'), false)
eq('streng har stadig titel', row.includes("title={typeof value === 'string' ? value : undefined}"), true)
eq('panelets titel ombrydes', panel.includes('text-sm font-semibold break-words min-w-0'), true)
eq('noegletal ombrydes stadig', src.includes('text-sm font-medium text-gray-900 break-words">{value}'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-field-wrap-test OK')
process.exitCode = fail ? 1 : 0
