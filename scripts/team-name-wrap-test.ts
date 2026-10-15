/** Teamlisten ombryder navn og mail. Roller bliver. Kør: npx tsx scripts/team-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const team = fs.readFileSync('src/app/dashboard/settings/team/team-settings-client.tsx', 'utf8')
const activity = fs.readFileSync('src/app/dashboard/settings/team/user-activity-panel.tsx', 'utf8')

eq('navn ombrydes', team.includes('font-medium text-gray-900 break-words') && team.includes("member.full_name || 'Ikke angivet'"), true)
eq('mail ombrydes', team.includes('text-sm text-gray-500 break-all">{member.email}'), true)
eq('team klipper ikke navn', team.includes('truncate'), false)
eq('aktivitet ombryder navn', activity.includes('font-medium text-gray-900 break-words'), true)
eq('aktivitet ombryder mail', activity.includes('break-all min-w-0'), true)
eq('roller bliver', team.includes('ROLES.map(role') && activity.includes('getRoleBadge(user.role)'), true)

console.log(fail ? `\n${fail} fejl` : '\nteam-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
