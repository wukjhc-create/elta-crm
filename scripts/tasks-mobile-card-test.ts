/** Opgavelisten har et mobilkort. Udført, status og slet er de samme. Koer: npx tsx scripts/tasks-mobile-card-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/tasks/tasks-page-client.tsx', 'utf8')
const listStart = src.indexOf('data-testid="tasks-mobile-list"')
const list = src.slice(listStart, src.indexOf('hidden md:block', listStart))
const cardStart = src.indexOf("if (layout === 'card')")
const card = src.slice(cardStart, src.indexOf('id={`task-${task.id}`}', cardStart))

eq('mobilkortet findes', list.includes('layout="card"') && card.includes('data-testid="task-mobile-card"'), true)
eq('desktop-gitteret bliver', src.includes('hidden md:block overflow-x-auto') && src.includes('min-w-[900px]'), true)
eq('titel ombrydes', card.includes('text-sm font-medium break-words'), true)
eq('desktop-titel ombrydes', src.includes('text-sm font-medium break-words min-w-0'), true)
eq('desktop-kunde ombrydes', src.includes('hover:underline break-words min-w-0'), true)
eq('desktop klipper ikke titel', src.includes('font-medium truncate'), false)
eq('udfoert har samme navn', card.includes("aria-label={isDone ? 'Genåbn opgave' : 'Marker som udført'}"), true)
eq('status kan stadig skiftes', card.includes('onStatusChange(e.target.value as TaskStatus)'), true)
eq('slet kraever samme gate', card.includes('canManage && isDeleting') && card.includes('aria-label="Slet opgave"'), true)
eq('bekraeft og annuller bliver', card.includes('aria-label="Bekræft sletning"') && card.includes('aria-label="Annuller sletning"'), true)
eq('dybt link rammer det synlige kort', src.includes('getClientRects().length > 0'), true)
eq('tom liste uden filter bliver', src.includes('Ingen opgaver fundet') && src.includes('Klik "Ny opgave" for at oprette en'), true)
eq('filter uden traef kan stadig ryddes', src.includes('data-testid="tasks-clear-filters"'), true)

console.log(fail ? `\n${fail} fejl` : '\ntasks-mobile-card-test OK')
process.exitCode = fail ? 1 : 0
