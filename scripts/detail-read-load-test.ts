/** Kalkulation og pakke siger naar laesningen fejler. Et aegte ukendt id bliver vaek. Koer: npx tsx scripts/detail-read-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const calc = fs.readFileSync('src/app/dashboard/calculations/[id]/page.tsx', 'utf8')
eq('kalkulation ukendt bliver', calc.includes("calculationResult.error !== 'Kalkulationen blev ikke fundet'") && calc.includes('notFound()'), true)
eq('kalkulation laese-fejl', calc.includes('data-testid="calculation-detail-load-error"') && calc.includes('Det tælles ikke som at kalkulationen mangler.'), true)

const pkg = fs.readFileSync('src/app/dashboard/packages/[id]/page.tsx', 'utf8')
eq('pakke ukendt bliver', pkg.includes("packageResult.error !== 'Pakken blev ikke fundet'") && pkg.includes('notFound()'), true)
eq('pakke laese-fejl', pkg.includes('data-testid="package-detail-load-error"') && pkg.includes('Det tælles ikke som at pakken mangler.'), true)
eq('pakke lister bliver', pkg.includes('categoriesResult.success && categoriesResult.data ? categoriesResult.data : []'), true)

const calcAction = fs.readFileSync('src/lib/actions/calculations.ts', 'utf8')
eq('kalkulation ikke-fundet bliver', calcAction.includes("return { success: false, error: 'Kalkulationen blev ikke fundet' }"), true)

const pkgAction = fs.readFileSync('src/lib/actions/packages.ts', 'utf8')
eq('pakke ikke-fundet bliver', pkgAction.includes("return { success: false, error: 'Pakken blev ikke fundet' }"), true)

console.log(fail ? `\n${fail} fejl` : '\ndetail-read-load-test OK')
process.exitCode = fail ? 1 : 0
