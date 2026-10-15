/** Ikonknapper har et dansk navn. Handlingen er den samme. Kør: npx tsx scripts/icon-button-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const modal = fs.readFileSync('src/components/modules/service-cases/create-service-case-modal.tsx', 'utf8')
const kalkia = fs.readFileSync('src/app/dashboard/settings/kalkia/nodes/[id]/kalkia-node-detail-client.tsx', 'utf8')

eq('fjern kunde har navn', modal.includes('aria-label="Fjern valgt kunde"'), true)
eq('fjern kunde rydder valget', modal.includes('setSelectedCustomerId(null)') && modal.includes("setSelectedCustomerName('')"), true)
eq('luk har stadig navn', modal.includes('aria-label="Luk"'), true)
eq('kundenavn ombrydes', modal.includes('flex-1 min-w-0 break-words">{selectedCustomerName}'), true)
eq('fjern link har navn', kalkia.includes('aria-label="Fjern link"') && kalkia.includes('handleUnlink(material.id)'), true)
eq('link-titel bliver', kalkia.includes('title="Fjern link"'), true)

console.log(fail ? `\n${fail} fejl` : '\nicon-button-label-test OK')
process.exitCode = fail ? 1 : 0
