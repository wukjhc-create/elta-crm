/** Integrationssiden ombryder webhook-URL og kald. Kopiér bliver. Koer: npx tsx scripts/integrations-url-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/integrations/integrations-settings-client.tsx', 'utf8')

eq('webhook ombrydes', src.includes('font-mono break-all'), true)
eq('webhook-sti bliver', src.includes('/api/integrations/webhook/${selectedIntegration.id}'), true)
eq('kopi har et navn', src.includes('aria-label="Kopiér webhook-URL"') && src.includes('copyWebhookUrl'), true)
eq('kald ombrydes', src.includes('text-xs text-gray-500 break-all') && src.includes('{log.request_url}'), true)
eq('fejl ombrydes', src.includes('text-xs text-red-600 mt-1 break-words'), true)

console.log(fail ? `\n${fail} fejl` : '\nintegrations-url-wrap-test OK')
process.exitCode = fail ? 1 : 0
