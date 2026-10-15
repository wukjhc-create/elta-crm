/** Vis/skjul af adgangskode har et navn. Feltet og vaerdien bliver. Koer: npx tsx scripts/password-toggle-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const cred = fs.readFileSync('src/components/modules/suppliers/supplier-credentials-form.tsx', 'utf8')
const security = fs.readFileSync('src/app/dashboard/settings/security/security-settings-client.tsx', 'utf8')

eq('leverandoer vis har et navn', cred.includes("aria-label={showPasswords['new'] ? 'Skjul adgangskode' : 'Vis adgangskode'}"), true)
eq('leverandoer feltet skifter type', cred.includes("type={showPasswords['new'] ? 'text' : 'password'}"), true)
eq('leverandoer skifter synlighed', cred.includes("setShowPasswords({ ...showPasswords, new: !showPasswords['new'] })"), true)
eq('leverandoer logger ikke', cred.includes('console.log'), false)

eq('nuvaerende har et navn', security.includes("aria-label={showCurrentPassword ? 'Skjul nuværende adgangskode' : 'Vis nuværende adgangskode'}"), true)
eq('ny har et navn', security.includes("aria-label={showNewPassword ? 'Skjul ny adgangskode' : 'Vis ny adgangskode'}"), true)
eq('bekraeft har et navn', security.includes("aria-label={showConfirmPassword ? 'Skjul bekræftelse af adgangskode' : 'Vis bekræftelse af adgangskode'}"), true)
eq('plads til ikonet', security.split('pr-10').length - 1 === 3, true)
eq('styrke bliver', security.includes('Styrke:'), true)
eq('skift bliver', security.includes('setShowCurrentPassword(!showCurrentPassword)') && security.includes('setShowNewPassword(!showNewPassword)') && security.includes('setShowConfirmPassword(!showConfirmPassword)'), true)
eq('sikkerhed logger ikke', security.includes('console.log'), false)

console.log(fail ? `\n${fail} fejl` : '\npassword-toggle-label-test OK')
process.exitCode = fail ? 1 : 0
