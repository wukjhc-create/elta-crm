/** Kalkia-jobvælgeren ombryder jobnavn. Tid og valg bliver. Koer: npx tsx scripts/kalkia-job-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/kalkia/QuickJobsPicker.tsx', 'utf8')

eq('fremhaevet navn ombrydes', src.includes('text-sm font-medium break-words">{job.name}'), true)
eq('listenavn ombrydes', src.includes('font-medium break-words min-w-0">{job.name}'), true)
eq('beskrivelse viser to linjer', src.includes('text-xs text-gray-400 mt-1 break-words line-clamp-2'), true)
eq('navn klippes ikke', src.includes('font-medium truncate'), false)
eq('tid bliver', src.includes('formatTimeMinutes(job.estimated_time_minutes)'), true)
eq('valg bliver', src.includes('handleSelectJob(job)'), true)
eq('tom liste bliver', src.includes('Ingen jobs fundet'), true)

console.log(fail ? `\n${fail} fejl` : '\nkalkia-job-name-test OK')
process.exitCode = fail ? 1 : 0
