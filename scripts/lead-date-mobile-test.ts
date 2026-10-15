/** Lead: forventet lukkedato kan krympe. Vaerdi og status bliver. Koer: npx tsx scripts/lead-date-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/leads/lead-form.tsx', 'utf8')
eq('gitter kan krympe', src.includes('grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0'), true)
eq('dato kan krympe', src.includes('type="date"') && src.includes('className={`${inputClass()} min-w-0 max-w-full`}'), true)
eq('lukkedato bliver', src.includes("register('expected_close_date')"), true)
eq('vaerdi bliver', src.includes("register('value', { valueAsNumber: true })"), true)
eq('sandsynlighed bliver', src.includes('min="0" max="100"'), true)
eq('ikke tildelt bliver', src.includes('Ikke tildelt'), true)
eq('fejlen bliver', src.includes("setError(result.error || 'Der opstod en fejl')"), true)

console.log(fail ? `\n${fail} fejl` : '\nlead-date-mobile-test OK')
process.exitCode = fail ? 1 : 0
