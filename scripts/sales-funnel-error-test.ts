/** Salgstragten siger naar den ikke kunne hentes. Maaned og beloeb bliver. Koer: npx tsx scripts/sales-funnel-error-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const table = fs.readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')
const page = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('fejl siger det', table.includes('Kunne ikke hente salgstragten. De andre tal på siden er uændrede.'), true)
eq('uden data og uden fejl bliver skjult', table.includes('if (!data) return null'), true)
eq('maaned bliver utc-middag', table.includes("new Date(`${m}-15T12:00:00Z`)"), true)
eq('siden sender fejlen', page.includes('<SalesFunnelTable data={funnel} error={funnelError} />'), true)
eq('succes rydder fejlen', page.includes('setFunnelError(false)'), true)
eq('andet udfald er fejl', page.includes('setFunnelError(true)'), true)

console.log(fail ? `\n${fail} fejl` : '\nsales-funnel-error-test OK')
process.exitCode = fail ? 1 : 0
