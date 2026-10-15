/** Projektets timer og budget ombrydes i kortet. Gates og procent bliver. Koer: npx tsx scripts/project-budget-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/projects/[id]/project-detail-client.tsx', 'utf8')
const block = src.slice(src.indexOf('{/* Progress Cards */}'), src.indexOf('{/* Notes */}'))
eq('gitteret kan krympe', block.includes('grid grid-cols-2 gap-4 min-w-0'), true)
eq('to kort kan krympe', block.split('bg-white border rounded-lg p-4 min-w-0').length - 1, 2)
eq('timer ombrydes', block.includes('text-2xl font-bold break-words ${isOverTime'), true)
eq('budget ombrydes', block.includes('text-2xl font-bold break-words ${isOverBudget'), true)
eq('timer bliver', block.includes('{project.actual_hours}t') && block.includes('{project.estimated_hours}t'), true)
eq('budget bliver', block.includes('formatBudget(project.actual_cost)') && block.includes('formatBudget(project.budget)'), true)
eq('budget-gate bliver', block.includes('{project.budget &&'), true)
eq('over-budget bliver', src.includes('project.budget && project.actual_cost > project.budget'), true)
eq('procent bliver', block.includes('Math.min((project.actual_cost / project.budget) * 100, 100)'), true)

console.log(fail ? `\n${fail} fejl` : '\nproject-budget-wrap-test OK')
process.exitCode = fail ? 1 : 0
