/** Revisionsloggens aendringer kan laeses paa mobil. Vaerdierne bliver. Koer: npx tsx scripts/audit-changes-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/audit/audit-client.tsx', 'utf8')
const start = src.indexOf('data-testid="audit-changes-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('felt ombrydes', mobile.includes('break-words">{field}'), true)
eq('foer bliver', mobile.includes("String(change.old ?? '—')"), true)
eq('efter bliver', mobile.includes("String(change.new ?? '—')"), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block rounded border overflow-hidden'), true)
eq('forhaandsvisning bliver', src.includes('entry.action_description.slice(0, 40)'), true)
eq('navn skjules ikke', src.includes("entry.user_name || entry.user_email || 'System'"), true)

console.log(fail ? `\n${fail} fejl` : '\naudit-changes-mobile-test OK')
process.exitCode = fail ? 1 : 0
