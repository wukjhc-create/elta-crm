/** Dublet-mærke på leverandørfakturaer. Status og bogføring bliver. Kør: npx tsx scripts/incoming-invoice-duplicate-badge-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const list = fs.readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const detail = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const start = 'data-testid="incoming-invoices-mobile-list"'
const end = 'hidden md:block'
const a = list.indexOf(start)
const b = list.indexOf(end, a + start.length)
const mobile = a >= 0 && b > a ? list.slice(a, b) : ''
const desktop = b > a ? list.slice(b) : ''

eq('listen henter dublet-kolonnen', action.includes('duplicate_of_id, created_at, source_email_id'), true)
eq('listen mapper dublet', action.includes('duplicate_of_id: (r as { duplicate_of_id?: string | null }).duplicate_of_id ?? null'), true)
eq('koeen mapper dublet', action.includes('duplicate_of_id: r.duplicate_of_id ?? null'), true)
eq('status bliver raekkens status', action.includes('status: r.status as IncomingInvoiceStatus') && action.includes('status: r.status,'), true)
eq('mobil viser dublet', mobile.includes('{r.duplicate_of_id && <DuplicateBadge />}'), true)
eq('skrivebord viser dublet', desktop.includes('{r.duplicate_of_id && <DuplicateBadge />}'), true)
eq('maerket siger dublet', list.includes('Dublet') && list.includes('data-testid="invoice-duplicate-badge"'), true)
eq('maerket lover ikke ny bogfoering', list.includes('Status og bogføring er uændret.'), true)
eq('detaljen aabner originalen', detail.includes('href={`/dashboard/incoming-invoices/${inv.duplicate_of_id}`}') && detail.includes('Åbn originalen'), true)
eq('detaljen viser ikke raa id som tekst', detail.includes('>{inv.duplicate_of_id}</Link>'), false)
eq('detaljen lover ikke ny bogfoering', detail.includes('Status og bogføring er uændret.'), true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-invoice-duplicate-badge-test OK')
process.exitCode = fail ? 1 : 0
