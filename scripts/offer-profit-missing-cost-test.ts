/** Tilbuds-loensomhed: linjer uden kost staar som tekst. Koer: npx tsx scripts/offer-profit-missing-cost-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const card = fs.readFileSync('src/components/modules/offers/offer-profit-card.tsx', 'utf8')
const engine = fs.readFileSync('src/lib/profit/offer-analysis.ts', 'utf8')
const listAt = card.indexOf('data-testid="offer-profit-missing-cost"')
const expandAt = card.indexOf('Linjer ({data.lines.length})')
const mobileAt = card.indexOf('data-testid="offer-profit-lines-mobile"')
const tableAt = card.indexOf('hidden md:block overflow-x-auto', mobileAt)
const mobile = card.slice(mobileAt, tableAt)

eq('manglende kost staar som liste', listAt > 0, true)
eq('listen ligger foer fold-ud', listAt < expandAt, true)
eq('listen bruger samme filter som taellingen', card.includes("l.costSource === 'unknown' && l.sale > 0"), true)
eq('linjens tekst vises', card.slice(listAt, listAt + 500).includes('l.description'), true)
eq('motorens advarsel er uaendret', engine.includes('linje(r) mangler kostpris'), true)
eq('foldede linjer er kort under md', mobileAt > 0 && tableAt > mobileAt, true)
eq('ukendt kost staar som tekst paa kortet', mobile.includes('Kost ukendt'), true)
eq('kortet er ikke tabellen', mobile.includes('<table'), false)

console.log(fail ? `\n${fail} fejl` : '\noffer-profit-missing-cost-test OK')
process.exitCode = fail ? 1 : 0
