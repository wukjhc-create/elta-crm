/** En fejlet mail-sync er ikke "aldrig" og ikke 0. Indbakken hentes stadig. Koer: npx tsx scripts/mail-sync-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/incoming-emails.ts', 'utf8')
const start = action.indexOf('export async function getGraphSyncState')
const end = action.indexOf('export async function getAllGraphSyncStates')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fejl kastes', fn.includes("if (error) throw new Error('Kunne ikke hente mail-sync')"), true)
eq('manglende raekke bliver null', fn.includes('return data as GraphSyncState | null'), true)
eq('postkasse bliver', fn.includes("process.env.GRAPH_MAILBOX || 'kontakt@eltasolar.dk'"), true)

const mail = fs.readFileSync('src/app/dashboard/mail/mail-client.tsx', 'utf8')
eq('indbakken overlever fejlen', mail.includes('getGraphSyncState().then((state) => ({ state, failed: false })).catch(() => ({ state: null, failed: true }))'), true)
eq('mail siger ikke aldrig', mail.includes('data-testid="mail-sync-load-error"') && mail.includes('Det tælles ikke som aldrig synket.'), true)
eq('aegte aldrig bliver', mail.includes(": 'Aldrig'"), true)
eq('tid bliver uden zone-skift', mail.includes('formatDate(syncState.last_sync_at)'), true)

const health = fs.readFileSync('src/components/modules/suppliers/supplier-health-overview.tsx', 'utf8')
eq('oversigt siger ikke 0', health.includes('data-testid="supplier-mail-sync-load-error"') && health.includes('Det tælles ikke som ikke synket, og det tælles ikke som 0.'), true)
eq('ikke synket bliver', health.includes('Ikke synket'), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-sync-load-test OK')
process.exitCode = fail ? 1 : 0
