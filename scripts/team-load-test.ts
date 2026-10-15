/** Brugerstyring siger naar invitationer eller aktivitet ikke kan hentes. Listen bliver. Koer: npx tsx scripts/team-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/team/page.tsx', 'utf8')
const panel = fs.readFileSync('src/app/dashboard/settings/team/user-activity-panel.tsx', 'utf8')

eq('invitationer siges', page.includes('Det tælles ikke som ingen invitationer.'), true)
eq('aktivitet siges', page.includes('Det tælles ikke som ingen aktivitet.'), true)
eq('medlemmer bliver', page.includes("result.error || 'Kunne ikke hente teammedlemmer'"), true)
eq('panel bliver', page.includes('<UserActivityPanel users={activityResult.data} />'), true)
eq('aldrig bliver', panel.includes("'Aldrig logget ind'"), true)

console.log(fail ? `\n${fail} fejl` : '\nteam-load-test OK')
process.exitCode = fail ? 1 : 0
