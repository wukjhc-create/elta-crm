/** Kreditnota kobler felterne. Beløb og fortegn bliver. Koer: npx tsx scripts/credit-note-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/[id]/credit-note-dialog.tsx', 'utf8')

eq('beloeb er koblet', src.includes('htmlFor="credit-note-amount"') && src.includes('id="credit-note-amount"') && src.includes('value={customAmountStr}'), true)
eq('begrundelse er koblet', src.includes('htmlFor="credit-note-reason"') && src.includes('id="credit-note-reason"') && src.includes('value={reason}'), true)
eq('frist er koblet', src.includes('htmlFor="credit-note-due"') && src.includes('id="credit-note-due"') && src.includes('value={dueDays}'), true)
eq('note er koblet', src.includes('htmlFor="credit-note-notes"') && src.includes('id="credit-note-notes"') && src.includes('value={notes}'), true)
eq('frist klemmes stadig', src.includes('Math.max(0, Math.min(120, Number(e.target.value) || 0))'), true)
eq('fortegn bliver', src.includes('preview.exVat > 0 ? `−${fmtKr(preview.exVat)}` : fmtKr(0)'), true)
eq('preview stables', src.includes('grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm'), true)

console.log(fail ? `\n${fail} fejl` : '\ncredit-note-label-test OK')
process.exitCode = fail ? 1 : 0
