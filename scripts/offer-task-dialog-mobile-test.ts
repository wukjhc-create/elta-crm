/** Tilbudsopgave-dialogen kan rulles. Opret og forfald bliver. Koer: npx tsx scripts/offer-task-dialog-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/offers/offer-task-form.tsx', 'utf8')
eq('panelet kan rulles', src.includes('w-full max-w-md max-h-[90vh] overflow-y-auto p-6'), true)
eq('titel ombrydes', src.includes('break-words min-w-0">Opret opgave til tilbud'), true)
eq('manglende kunde ombrydes', src.includes('break-words">Tilbuddet skal have en tilknyttet kunde for at oprette en opgave.'), true)
eq('luk har et navn', src.includes('aria-label="Luk"'), true)
eq('opret bliver', src.includes("'Opret opgave'"), true)
eq('forfald sender stadig iso', src.includes('due_date: dueDate ? new Date(dueDate).toISOString() : undefined'), true)
eq('profilfejl bliver', src.includes('data-testid="offer-task-profiles-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-task-dialog-mobile-test OK')
process.exitCode = fail ? 1 : 0
