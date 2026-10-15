/** Arbejdsordre-dialogen ombryder titel og kunde. Status og luk er de samme. Koer: npx tsx scripts/work-order-dialog-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/edit-work-order-dialog.tsx', 'utf8')
const start = src.indexOf('id="edit-wo-title"')
const head = src.slice(start, src.indexOf('aria-label="Luk"', start))

eq('titel ombrydes', head.includes('text-base font-semibold text-gray-900 break-words'), true)
eq('titel klippes ikke', head.includes('truncate'), false)
eq('kunde ombrydes', head.includes('break-words min-w-0">· {workOrder.case.customer_name}'), true)
eq('status bliver', head.includes('STATUS_LABELS[currentStatus]'), true)
eq('luk bliver', src.includes('aria-label="Luk"'), true)
eq('fallback bliver', src.includes("workOrder.title || 'Arbejdsordre'"), true)
eq('titel er koblet', src.includes('htmlFor="edit-wo-job-title"') && src.includes('id="edit-wo-job-title"') && src.includes('value={title}'), true)
eq('dato er koblet', src.includes('htmlFor="edit-wo-date"') && src.includes('id="edit-wo-date"') && src.includes('type="date"') && src.includes('value={date}'), true)
eq('medarbejder er koblet', src.includes('htmlFor="edit-wo-employee"') && src.includes('id="edit-wo-employee"') && src.includes('value={employeeId}'), true)
eq('beskrivelse er koblet', src.includes('htmlFor="edit-wo-description"') && src.includes('id="edit-wo-description"') && src.includes('value={description}'), true)
eq('dato og medarbejder stables paa mobil', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-2'), true)
eq('overskrift beholder sit id', src.includes('id="edit-wo-title"'), true)
eq('gem bliver', src.includes('Gem ændringer'), true)
eq('panelet kan rulles', src.includes('w-full max-w-lg max-h-[90vh] overflow-y-auto'), true)
eq('fejl ombrydes', src.includes('min-w-0 break-words">{error}'), true)
eq('laast status ombrydes', src.includes('min-w-0 break-words">') && src.includes('status er låst.'), true)
eq('fod kan ombrydes', src.includes('flex flex-wrap items-center justify-end gap-2'), true)
eq('ikke tildelt bliver', src.includes('— Ikke tildelt —'), true)
eq('gem kalder samme funktion', src.includes('onClick={handleSavePatch}'), true)

console.log(fail ? `\n${fail} fejl` : '\nwork-order-dialog-mobile-test OK')
process.exitCode = fail ? 1 : 0
