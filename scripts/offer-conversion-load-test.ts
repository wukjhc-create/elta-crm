/** Tilbud klar til sag siger naar taellingen fejler. Groent nul og beloeb bliver. Koer: npx tsx scripts/offer-conversion-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/offers.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function getOfferConversionSummaryAction'), src.indexOf('const DUPLICATE_HEADER_FIELDS'))
const ready = fn.slice(0, fn.indexOf('converted_30d — head count'))
const conv = fn.slice(fn.indexOf('converted_30d — head count'), fn.indexOf('latest_ready —'))
eq('klar-tal tjekker fejl', ready.includes('if (error)'), true)
eq('klar-tal returnerer ikke 0', ready.indexOf("return { ...empty, message: 'Kunne ikke hente tilbudsstatus' }") < ready.indexOf('readyCount = count ?? 0'), true)
eq('30 dage tjekker fejl', conv.includes('if (error)'), true)
eq('30 dage returnerer ikke 0', conv.indexOf("return { ...empty, message: 'Kunne ikke hente tilbudsstatus' }") < conv.indexOf('converted30d = count ?? 0'), true)
eq('tilladelse bliver', fn.includes('Manglende tilladelse: offers.view'), true)
eq('status bliver', fn.includes("const CONVERSION_READY_STATUSES = ['sent', 'viewed', 'accepted']") || src.includes("const CONVERSION_READY_STATUSES = ['sent', 'viewed', 'accepted']"), true)
eq('beloeb bliver', fn.includes('amount: (data.final_amount as number | null) ?? null'), true)

const view = fs.readFileSync('src/components/modules/dashboard/offer-conversion-widget.tsx', 'utf8')
eq('fejltekst', view.includes('Kunne ikke hente tilbudsstatus. Det tælles ikke som 0.'), true)
eq('testid', view.includes('data-testid="offer-conversion-load-error"'), true)
eq('groent nul bliver', view.includes('Ingen tilbud venter på at blive til sag.'), true)
eq('tilladelse vises', view.includes("data?.message?.includes('Manglende tilladelse')"), true)
eq('beloeb vises', view.includes('formatCurrency(data.latest_ready.amount'), true)
eq('klipper ikke', view.includes('truncate') === false, true)

console.log(fail ? `\n${fail} fejl` : '\noffer-conversion-load-test OK')
process.exitCode = fail ? 1 : 0
