/** Bekraeftelsen kan rulles, og teksten ombrydes. Knapperne kalder det samme. Koer: npx tsx scripts/confirm-dialog-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/shared/confirm-dialog.tsx', 'utf8')
eq('panelet kan rulles', src.includes('w-full max-w-md max-h-[90vh] overflow-y-auto'), true)
eq('titel ombrydes', src.includes('text-lg font-semibold text-gray-900 break-words'), true)
eq('beskrivelse ombrydes', src.includes('mt-2 text-sm text-gray-600 break-words'), true)
eq('fod kan ombrydes', src.includes('flex flex-wrap justify-end gap-3'), true)
eq('bekraeft bliver', src.includes("confirmLabel = 'Bekræft'"), true)
eq('annuller bliver', src.includes("cancelLabel = 'Annuller'"), true)
eq('bekraeft kalder samme', src.includes('onClick={onConfirm}'), true)
eq('annuller kalder samme', src.includes('onClick={onCancel}'), true)
eq('escape lukker stadig', src.includes("e.key === 'Escape' && !loading"), true)

console.log(fail ? `\n${fail} fejl` : '\nconfirm-dialog-mobile-test OK')
process.exitCode = fail ? 1 : 0
