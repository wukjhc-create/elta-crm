/** Overtidssatser seedes ikke naar listen fejler. Satser og historik bliver. Koer: npx tsx scripts/overtime-seed-guard-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const ui = fs.readFileSync('src/components/modules/employees/employee-overtime-rates-panel.tsx', 'utf8')
const action = fs.readFileSync('src/lib/actions/employee-overtime-rates.ts', 'utf8')
const seed = action.slice(action.indexOf('export async function ensureDefaultOvertimeRates'), action.indexOf('export async function createOvertimeRate'))

eq('fejl seeder ikke', ui.includes('if (!alive || !result.ok || result.data.length > 0 || !canEdit || seeded) return'), true)
eq('kast siges', ui.includes("setError('Kunne ikke hente satser')"), true)
eq('ikke tom', ui.includes('Det tælles ikke som ingen satser.'), true)
eq('tom liste bliver', ui.includes('Ingen satser endnu.') && ui.includes('Standard-satser oprettes automatisk.'), true)
eq('historik bliver', ui.includes('Historiske timer ændres ikke automatisk.'), true)
eq('loft bliver', ui.includes('mult < 0 || mult > 10') && ui.includes('(cN ?? 0) > 5000'), true)
eq('opslagfejl seeder ikke', seed.includes("if (existingErr) return { success: false, error: 'Kunne ikke hente satser' }"), true)
eq('eksisterende bliver', seed.includes('if (existing && existing.length > 0)'), true)
eq('multiplikator bliver', seed.includes('cost_rate: baseCost != null ? r2(baseCost * d.multiplier) : null'), true)

console.log(fail ? `\n${fail} fejl` : '\novertime-seed-guard-test OK')
process.exitCode = fail ? 1 : 0
