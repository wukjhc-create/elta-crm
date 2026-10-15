/** Afleveringsfoto slettes fra et hjoerne, ikke ved at trykke paa billedet. Koer: npx tsx scripts/handover-photo-delete-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/shared/completion-checklist.tsx', 'utf8')

eq('slet har et navn', src.includes('aria-label="Slet foto"'), true)
eq('slet kraever bekraeftelse', src.includes("window.confirm('Slet dette foto fra afleveringen?')"), true)
eq('slet kalder samme handler', src.includes('onDeleteAttachment(att.id)'), true)
eq('slet daekker ikke billedet', src.includes('absolute inset-0 bg-black/0'), false)
eq('fotoet kan stadig ses', src.includes('alt={att.file_name}'), true)

console.log(fail ? `\n${fail} fejl` : '\nhandover-photo-delete-test OK')
process.exitCode = fail ? 1 : 0
