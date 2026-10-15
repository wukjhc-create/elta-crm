/** Laaste tilbudslinjer kan laeses paa mobil. Beloeb og kost-gate bliver. Koer: npx tsx scripts/line-items-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/shared/line-items-table.tsx', 'utf8')
const start = src.indexOf('data-testid="line-items-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('kun naar den er laast', src.includes('{!editable && (') && mobile.includes('data-testid="line-items-mobile"'), true)
eq('beskrivelse ombrydes', mobile.includes('{item.description}'), true)
eq('antal bliver', mobile.includes('{item.quantity}'), true)
eq('enhed bliver', mobile.includes("{item.unit || 'stk'}"), true)
eq('enhedspris bliver', mobile.includes('formatCurrency(item.unit_price, currency, 2)'), true)
eq('total bliver', mobile.includes('formatCurrency(item.total, currency, 2)'), true)
eq('kost kun med gate', mobile.includes('{showCostData && ('), true)
eq('kost-fallback bliver', mobile.includes('item.cost_price || item.supplier_cost_price_at_creation || null'), true)
eq('kladde beholder tabellen', src.includes("editable ? 'overflow-x-auto' : 'hidden md:block overflow-x-auto'"), true)
eq('tom tekst bliver', src.includes('data-testid="line-items-empty"'), true)

console.log(fail ? `\n${fail} fejl` : '\nline-items-mobile-test OK')
process.exitCode = fail ? 1 : 0
