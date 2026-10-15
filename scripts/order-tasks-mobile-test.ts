/** Sagens opgave kan markeres med et navn, og titlen ombrydes. Kør: npx tsx scripts/order-tasks-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-tasks-tab.tsx', 'utf8')

eq('udfoer har et navn', src.includes('aria-label={`Markér ${t.title} som udført`}'), true)
eq('udfoer kan rammes', src.includes('min-h-[44px] min-w-[44px]'), true)
eq('titel ombrydes', src.includes('text-sm font-medium break-words'), true)
eq('ansvarlig ombrydes', src.includes('text-xs text-gray-500 break-words'), true)
eq('tom tekst bliver', src.includes('Når en sag oprettes fra et tilbud, får den automatisk en opstartstjekliste her.'), true)
eq('complete bliver', src.includes('completeCustomerTask(taskId)'), true)
eq('kun med ret', src.includes('canComplete && !done'), true)
eq('fejl ved udfoer skjuler ikke listen', src.includes('error && tasks.length === 0'), true)
eq('fejl vises over listen', src.includes('{error && <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">{error}</div>}'), true)

console.log(fail ? `\n${fail} fejl` : '\norder-tasks-mobile-test OK')
process.exitCode = fail ? 1 : 0
