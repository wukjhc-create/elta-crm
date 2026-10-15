/** Fragt/gebyr er tekst. Kontrollens tal aendres ikke. Koer: npx tsx scripts/invoice-charge-label-test.ts */
import fs from 'fs'
import { chargeLabel, chargeLabelText } from '../src/lib/invoice-control/charge-label'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)} ville=${JSON.stringify(want)}`}`)
}

eq('fragt', chargeLabel('Fragt'), 'fragt')
eq('levering', chargeLabel('Levering til byggeplads'), 'fragt')
eq('transport', chargeLabel('Transport'), 'fragt')
eq('porto', chargeLabel('Porto'), 'fragt')
eq('gebyr', chargeLabel('Ekspeditionsgebyr'), 'gebyr')
eq('miljoegebyr', chargeLabel('Miljøgebyr'), 'gebyr')
eq('fragtgebyr er gebyr', chargeLabel('Fragtgebyr'), 'gebyr')
eq('vare er ikke gebyr', chargeLabel('Stikkontakt'), null)
eq('leveringsadresse er ikke fragt', chargeLabel('Leveringsadresse'), null)
eq('tom', chargeLabel('  '), null)
eq('tekst fragt', chargeLabelText('fragt'), 'Fragt')
eq('tekst gebyr', chargeLabelText('gebyr'), 'Gebyr')

const panel = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/invoice-control-panel.tsx', 'utf8')
const engine = fs.readFileSync('src/lib/invoice-control/engine.ts', 'utf8')
eq('panelet markerer linjen', panel.includes('<ChargeMark description={l.description} />'), true)
eq('overpris-udtrykket er det samme', panel.includes('res.control.controlledLines > 0 ? kr(res.control.overchargeAmount) : \'—\''), true)
eq('motoren naevner ikke fragt', engine.includes('chargeLabel'), false)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-charge-label-test OK')
process.exitCode = fail ? 1 : 0
