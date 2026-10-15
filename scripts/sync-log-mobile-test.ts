/** Eksport-loggen kan laeses paa mobil. Tid og status bliver. Koer: npx tsx scripts/sync-log-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/economic/log/sync-log-client.tsx', 'utf8')
const start = src.indexOf('data-testid="sync-log-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('tid bliver', mobile.includes('dkDateTime(e.created_at)'), true)
eq('status bliver', mobile.includes('skin.label'), true)
eq('fejltekst bliver', mobile.includes('{e.error}'), true)
eq('kunde bliver', mobile.includes('{e.customer_name ?? \'—\'}'), true)
eq('genforsoeg bliver', mobile.includes('handleRetry(e)'), true)
eq('tom liste bliver', mobile.includes('Ingen eksportforsøg i denne visning.'), true)
eq('listefejl bliver', mobile.includes('Det tælles ikke som ingen eksportforsøg.'), true)
eq('desktop-tabel bliver', src.includes('data-testid="sync-log-table"') && src.includes('min-w-[720px]') && src.includes('overflow-x-auto'), true)
eq('desktop-fejl bliver', src.includes('data-testid="sync-log-load-error"'), true)
eq('oekonomisk tjek bliver', src.includes('retryInvoiceExportAction'), true)

console.log(fail ? `\n${fail} fejl` : '\nsync-log-mobile-test OK')
process.exitCode = fail ? 1 : 0
