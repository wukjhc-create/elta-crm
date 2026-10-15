/** Naeste skridt paa et lead er tekst. Statusovergange er de samme. Koer: npx tsx scripts/lead-next-hint-test.ts */
import fs from 'fs'
import { nextLeadHint } from '../src/lib/leads/next-hint'
import { isValidLeadTransition } from '../src/types/leads.types'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const open = { hasCustomer: false, canConvert: true, canCreateOffer: true }
const linked = { hasCustomer: true, canConvert: true, canCreateOffer: true }
eq('ny', nextLeadHint('new', open).includes('kontakt'), true)
eq('kvalificeret uden kunde', nextLeadHint('qualified', open).includes('opret kunden'), true)
eq('kvalificeret med kunde', nextLeadHint('qualified', linked).includes('opret tilbuddet'), true)
eq('tabt', nextLeadHint('lost', open).includes('genåbn'), true)
eq('vundet aendrer ikke overgangen', isValidLeadTransition('won', 'negotiation'), true)
eq('ulovlig overgang er stadig ulovlig', isValidLeadTransition('new', 'won'), false)

const detail = fs.readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
const types = fs.readFileSync('src/types/leads.types.ts', 'utf8')
eq('detaljen viser hintet', detail.includes('data-testid="lead-next-hint"') && detail.includes('nextLeadHint('), true)
eq('overgangene staar som foer', types.includes("new: ['contacted', 'lost']") && types.includes("won: ['negotiation']"), true)

console.log(fail ? `\n${fail} fejl` : '\nlead-next-hint-test OK')
process.exitCode = fail ? 1 : 0
