/** Ny sag og ret sag siger naar kunder eller profiler ikke kan hentes. Et aegte tomt valg bliver. Koer: npx tsx scripts/order-party-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const newPage = fs.readFileSync('src/app/dashboard/orders/new/page.tsx', 'utf8')
const editPage = fs.readFileSync('src/app/dashboard/orders/[id]/edit/page.tsx', 'utf8')
const created = fs.readFileSync('src/app/dashboard/orders/new/new-order-form.tsx', 'utf8')
const edited = fs.readFileSync('src/app/dashboard/orders/[id]/edit/edit-order-form.tsx', 'utf8')

for (const [name, page] of [['ny', newPage], ['ret', editPage]] as const) {
  eq(`${name} sender kundefejl`, page.includes("customersError={customersRes.success ? null : (customersRes.error ?? 'Kunne ikke hente kunder')}"), true)
  eq(`${name} sender profilfejl`, page.includes("profilesError={profilesRes.success ? null : (profilesRes.error ?? 'Kunne ikke hente brugere')}"), true)
  eq(`${name} aegte lister bliver`, page.includes('customersRes.success && customersRes.data ? customersRes.data : []') && page.includes('profilesRes.success && profilesRes.data ? profilesRes.data : []'), true)
}

for (const [name, src] of [['ny', created], ['ret', edited]] as const) {
  eq(`${name} siger kundefejl`, src.includes('data-testid="order-customers-load-error"') && src.includes('Det tælles ikke som ingen kunder.'), true)
  eq(`${name} siger profilfejl`, src.includes('data-testid="order-profiles-load-error"') && src.includes('Det tælles ikke som ingen brugere.'), true)
  eq(`${name} formand bliver`, src.includes('— Ingen formand —') && src.includes('data-testid="order-employees-load-error"'), true)
}

eq('vaelg kunde bliver', created.includes('— Vælg kunde —'), true)
eq('mig bliver', created.includes('— Mig (standard) —'), true)
eq('opret sag bliver', created.includes('createServiceCase({'), true)
eq('ingen kunde bliver', edited.includes('— Ingen kunde —'), true)
eq('ingen ansvarlig bliver', edited.includes('— Ingen ansvarlig —'), true)

console.log(fail ? `\n${fail} fejl` : '\norder-party-load-test OK')
process.exitCode = fail ? 1 : 0
