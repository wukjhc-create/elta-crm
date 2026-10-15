/** Profilbilledet kan ses som en handling paa mobil. Upload er den samme. Koer: npx tsx scripts/profile-avatar-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/profile/profile-settings-client.tsx', 'utf8')

eq('kameraet kan ses paa mobil', src.includes('opacity-90 sm:opacity-0 sm:group-hover:opacity-100'), true)
eq('knappen har stadig et navn', src.includes('aria-label="Skift profilbillede"'), true)
eq('upload kalder samme funktion', src.includes('uploadProfileAvatar(fd)'), true)
eq('slet kalder samme funktion', src.includes('deleteProfileAvatar()'), true)
eq('navn ombrydes', src.includes('text-xl font-semibold text-gray-900 break-words'), true)
eq('mail ombrydes', src.includes('text-gray-500 break-all">{profile.email}'), true)

console.log(fail ? `\n${fail} fejl` : '\nprofile-avatar-mobile-test OK')
process.exitCode = fail ? 1 : 0
