/** Go-live bliver ikke groen, naar en taelling fejler. Groent nul og rykkertekst bliver. Koer: npx tsx scripts/golive-count-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/go-live.ts', 'utf8')
eq('regler', src.includes('rules_error: rulesFailed') && src.includes('live_count: rulesFailed ? null'), true)
eq('bank', src.includes('bankCount.error ? null : (bankCount.count ?? 0)'), true)
eq('umatchet', src.includes('bankUnmatched.error ? null : (bankUnmatched.count ?? 0)'), true)
eq('fejl-log', src.includes('sysErr.error ? null : (sysErr.count ?? 0)'), true)
eq('rykker-tal', src.includes('reminderSent24h.error ? null : (reminderSent24h.count ?? 0)'), true)
eq('mail', src.includes('mailbox_count: syncFailed ? null'), true)
eq('banktest', src.includes('Kunne ikke tælle bankposteringer. Det tælles ikke som 0.'), true)
eq('ingen import bliver', src.includes('Ingen bankposteringer importeret de sidste 7 dage.'), true)
eq('syv dage bliver', src.includes('copenhagenDatePlusDays(-7)'), true)

const view = fs.readFileSync('src/app/dashboard/go-live/go-live-client.tsx', 'utf8')
eq('fejl er ikke groen', view.includes("status.system_errors_last_24h == null") && view.includes('Kunne ikke tælle fejl. Det tælles ikke som 0.'), true)
eq('regler siger fejl', view.includes('data-testid="golive-rules-load-error"') && view.includes('Det tælles ikke som ingen regler.'), true)
eq('ingen regler bliver', view.includes('Ingen regler.'), true)
eq('bank siger fejl', view.includes('Umatchede kunne ikke tælles. Det tælles ikke som 0.'), true)
eq('rykkertekst bliver', view.includes('Rykker-tjek sender RIGTIGE rykkermails til kunder med forfaldne fakturaer'), true)

console.log(fail ? `\n${fail} fejl` : '\ngolive-count-load-test OK')
process.exitCode = fail ? 1 : 0
