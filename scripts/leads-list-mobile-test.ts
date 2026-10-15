/** Leadkortet ombryder navn, henvendelse og mail. Vaerdi og status er de samme. Koer: npx tsx scripts/leads-list-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/leads/leads-table.tsx', 'utf8')
const start = src.indexOf('data-testid="leads-mobile-list"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))

eq('firmanavn ombrydes', mobile.includes('break-words min-w-0 flex-1">{lead.company_name}'), true)
eq('kontakt ombrydes', mobile.includes('text-sm text-gray-500 break-words">{lead.contact_person}'), true)
eq('henvendelse ombrydes', mobile.includes('break-words" title={lead.notes} data-testid="lead-row-inquiry"'), true)
eq('mail ombrydes', mobile.includes('break-all min-w-0">{lead.email}'), true)
eq('kortet klipper ikke', mobile.includes('truncate') || mobile.includes('max-w-[180px]'), false)
eq('vaerdi bliver', mobile.includes('formatValue(lead.value)'), true)
eq('status bliver', mobile.includes('LeadStatusBadge'), true)
eq('vaelg har et navn', mobile.includes('aria-label={`Vælg ${lead.company_name}`}'), true)

const desk = src.slice(src.indexOf('hidden md:block', start))
eq('desktop-henvendelse klippes ikke til 320', desk.includes('max-w-[320px] truncate'), false)
eq('desktop-henvendelse viser tre linjer', desk.includes('break-words line-clamp-3" title={lead.notes} data-testid="lead-row-inquiry"'), true)
eq('desktop-firma ombrydes', desk.includes('font-medium text-gray-900 hover:text-primary break-words'), true)
eq('desktop-kontakt ombrydes', desk.includes('className="text-sm text-gray-500 break-words"') && desk.includes('{lead.contact_person}'), true)
eq('desktop-mail ombrydes', desk.includes('break-all min-w-0">{lead.email || \'-\'}'), true)
eq('desktop-ansvarlig ombrydes', desk.includes('text-sm text-gray-500 hidden lg:table-cell break-words'), true)
eq('vaerdi bliver paa desktop', desk.includes('formatValue(lead.value)'), true)
eq('status bliver paa desktop', desk.includes('LeadStatusBadge'), true)

console.log(fail ? `\n${fail} fejl` : '\nleads-list-mobile-test OK')
process.exitCode = fail ? 1 : 0
