/** Paamindelser kan krympe paa mobil. Opret, udfoer og udsaet bliver. Koer: npx tsx scripts/personal-reminder-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/tasks/personal-reminders-card.tsx', 'utf8')
eq('dato kan krympe', src.includes('aria-label="Dato"') && src.includes('max-w-full min-w-0 rounded-md border px-2 py-1.5 text-sm'), true)
eq('klokke kan krympe', src.includes('aria-label="Klokkeslæt"') && src.includes('max-w-full min-w-0 rounded-md border px-2 py-1.5 text-sm'), true)
eq('ret dato kan krympe', src.includes('aria-label="Ny dato"') && src.includes('max-w-full min-w-0 rounded-md border px-2 py-1 text-sm'), true)
eq('tidspunkt ombrydes', src.includes('text-xs text-gray-500 break-words">{fmt(r.due_at)}'), true)
eq('opret bliver', src.includes('createPersonalReminder({ title, dueAt: copenhagenLocalToIso(date, clock) })'), true)
eq('udfoer bliver', src.includes('completePersonalReminder(r.id)'), true)
eq('udsaet bliver', src.includes('snoozePersonalReminder(r.id)'), true)
eq('slet bliver', src.includes('deletePersonalReminder(r.id)'), true)
eq('gem tid bliver', src.includes('reschedulePersonalReminder(r.id, copenhagenLocalToIso(editDate, editClock))'), true)

console.log(fail ? `\n${fail} fejl` : '\npersonal-reminder-mobile-test OK')
process.exitCode = fail ? 1 : 0
