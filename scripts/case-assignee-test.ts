/** Sagsoverblikket viser den tildelte. Opretteren bliver i ansvar-panelet. Koer: npx tsx scripts/case-assignee-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-detail-client.tsx', 'utf8')
const header = src.slice(src.indexOf('Quick info row'), src.indexOf('Planlagt tid'))
const buttonAt = src.indexOf('<OfferAgentButton')
const actions = src.slice(buttonAt - 250, buttonAt)
const panel = src.slice(src.indexOf('title="Ansvar"'), src.indexOf('title="Økonomi"'))

eq('header viser den tildelte', header.includes('label="Tildelt"') && header.includes("sag.assignee?.full_name?.trim() || 'Ikke tildelt'"), true)
eq('header kalder ikke opretteren ansvarlig', header.includes('label="Ansvarlig"'), false)
eq('formand bliver i headeren', header.includes('label="Formand"'), true)
eq('handlinger ombrydes', actions.includes('flex-wrap'), true)
eq('panelet beholder saelgeren', panel.includes('Ansvarlig (sælger)') && panel.includes('creator?.full_name'), true)
eq('panelet siger naar ingen er tildelt', panel.includes('Ikke tildelt'), true)
eq('formand bliver i panelet', panel.includes('label="Formand"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-assignee-test OK')
process.exitCode = fail ? 1 : 0
