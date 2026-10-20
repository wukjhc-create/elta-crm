/** Sagen siger naar opslaget fejler. Et aegte ukendt nummer bliver vaek. Koer: npx tsx scripts/order-edit-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const start = action.indexOf('export async function getServiceCase(')
const fn = action.slice(start, action.indexOf('// =====================================================\n// Create', start))
eq('funktionen findes', start > 0, true)
eq('ingen raekke bliver ikke fundet', fn.includes("error.code === 'PGRST116'") && fn.includes("error: 'Serviceopgave ikke fundet'"), true)
eq('databasefejl er en fejl', fn.includes("error: 'Kunne ikke hente sagen.'"), true)
eq('ikke tildelt bliver', fn.includes("error: 'Sagen er ikke tildelt dig'"), true)
eq('tilladelse bliver', fn.includes("error: 'Manglende tilladelse: cases.view'"), true)

for (const [name, file, testid] of [
  ['detalje', 'src/app/dashboard/orders/[id]/page.tsx', 'order-detail-load-error'],
  ['ret', 'src/app/dashboard/orders/[id]/edit/page.tsx', 'order-edit-load-error'],
] as const) {
  const src = fs.readFileSync(file, 'utf8')
  const branchStart = src.indexOf('if (!UUID_RE.test(id))')
  const branch = src.slice(branchStart, src.indexOf('getServiceCase(', branchStart))
  eq(`${name} opslag-fejl`, branch.includes('if (error)') && branch.includes('Kunne ikke slå sagsnummeret op'), true)
  eq(`${name} ukendt nummer bliver`, branch.includes('else notFound()'), true)
  eq(`${name} catch er ikke notFound`, branch.includes('catch {\n      notFound()') === false, true)
  eq(`${name} banner`, src.includes(`data-testid="${testid}"`) && src.includes('Det tælles ikke som at sagen ikke findes.'), true)
  eq(`${name} kendt miss bliver notFound`, src.includes('isKnownCaseMiss') && src.includes('notFound()'), true)
  eq(`${name} uuid bliver`, src.includes('const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i'), true)
}

const detail = fs.readFileSync('src/app/dashboard/orders/[id]/page.tsx', 'utf8')
eq('planlagt antal bliver', detail.includes('plannedCount = count ?? 0'), true)

console.log(fail ? `\n${fail} fejl` : '\norder-edit-load-test OK')
process.exitCode = fail ? 1 : 0
