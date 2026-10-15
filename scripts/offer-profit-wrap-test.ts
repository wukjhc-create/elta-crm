/** Tilbuds-loensomhed ombrydes paa mobil. Tallene bliver. Koer: npx tsx scripts/offer-profit-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const card = fs.readFileSync('src/components/modules/offers/offer-profit-card.tsx', 'utf8')
const mobileAt = card.indexOf('data-testid="offer-profit-lines-mobile"')
const tableAt = card.indexOf('hidden md:block overflow-x-auto', mobileAt)
const mobile = card.slice(mobileAt, tableAt)

eq('dommen kan ombrydes', card.includes('flex flex-wrap items-center justify-between gap-2'), true)
eq('salg ombrydes', card.includes('font-semibold break-words">{kr(data.sale)}'), true)
eq('db-procent bliver', card.includes('{data.dbRealisticPct} %'), true)
eq('kendt db bliver', card.includes('{data.dbKnownPct} %'), true)
eq('fejl siger naeste skridt', card.includes('kunne ikke hentes. Åbn tilbuddet igen.'), true)
eq('timekost ombrydes', card.includes('text-xs text-muted-foreground mb-2 break-words'), true)
eq('timekost-kilden bliver', card.includes('{data.hourlyCostSource}'), true)
eq('kortlinje ombrydes', mobile.includes('font-medium break-words'), true)
eq('kost ukendt bliver', mobile.includes('Kost ukendt'), true)
eq('kortet er ikke tabellen', mobile.includes('<table'), false)
eq('kr-format bliver', card.includes('minimumFractionDigits: 0'), true)
eq('manglende kost bruger samme filter', card.includes("l.costSource === 'unknown' && l.sale > 0"), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-profit-wrap-test OK')
process.exitCode = fail ? 1 : 0
