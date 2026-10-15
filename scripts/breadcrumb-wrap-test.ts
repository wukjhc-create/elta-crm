/** Brødkrummen ombryder det sidste led. Home og navnet er de samme. Kør: npx tsx scripts/breadcrumb-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/shared/breadcrumb.tsx', 'utf8')

eq('navnet bliver', src.includes('aria-label="Brødkrumme"'), true)
eq('home bliver', src.includes('href="/dashboard"'), true)
eq('leddet ombrydes', src.includes('text-gray-900 font-medium break-words'), true)
eq('link ombrydes', src.includes('hover:text-gray-900 transition-colors break-words'), true)
eq('leddet klippes ikke', src.includes('truncate max-w-[200px]'), false)
eq('raekken kan ombrydes', src.includes('flex flex-wrap items-center'), true)

console.log(fail ? `\n${fail} fejl` : '\nbreadcrumb-wrap-test OK')
process.exitCode = fail ? 1 : 0
