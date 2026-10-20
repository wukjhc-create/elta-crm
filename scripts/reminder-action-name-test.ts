/** Paamindelseskortets knapper siger hvilken paamindelse, og raekken ombrydes. Tiderne bliver. Koer: npx tsx scripts/reminder-action-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/layout/task-reminder-overlay.tsx', 'utf8')
eq('udfoert siger titlen', src.includes('aria-label={`Markér udført: ${reminder.title}`}'), true)
eq('kvarter siger titlen', src.includes('aria-label={`Udsæt ${reminder.title} 15 minutter`}'), true)
eq('time siger titlen', src.includes('aria-label={`Udsæt ${reminder.title} 1 time`}'), true)
eq('i morgen siger titlen', src.includes('aria-label={`Udsæt ${reminder.title} til i morgen`}'), true)
eq('synlig tekst bliver', src.includes('            Udført') && src.includes('15 min') && src.includes('1 time') && src.includes('I morgen'), true)
eq('raekken ombrydes', src.includes('flex flex-wrap items-center gap-1.5 mt-3'), true)
eq('kvarter bliver', src.includes('onSnooze(15)'), true)
eq('time bliver', src.includes('onSnooze(60)'), true)
eq('dagen bliver', src.includes('onSnooze(60 * 24)'), true)
eq('luk bliver', src.includes('aria-label="Luk påmindelse"'), true)

console.log(fail ? `\n${fail} fejl` : '\nreminder-action-name-test OK')
process.exitCode = fail ? 1 : 0
