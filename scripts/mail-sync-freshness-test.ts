/**
 * N71: unit-tests for src/lib/mail/sync-freshness.ts.
 *   npx tsx scripts/mail-sync-freshness-test.ts
 */
import { staleMailboxes } from '../src/lib/mail/sync-freshness'

let failed = 0
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '❌'} ${name}${ok ? '' : ` — fik ${JSON.stringify(got)}, ville have ${JSON.stringify(want)}`}`)
}

const now = Date.parse('2026-10-04T12:00:00Z')
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString()

eq('frisk postkasse synkes ikke', staleMailboxes(['kontakt@x.dk'], [{ mailbox: 'kontakt@x.dk', last_sync_at: iso(3) }], now, 10), [])
eq('gammel postkasse synkes', staleMailboxes(['kontakt@x.dk'], [{ mailbox: 'kontakt@x.dk', last_sync_at: iso(400) }], now, 10), ['kontakt@x.dk'])
eq('aldrig synket postkasse synkes', staleMailboxes(['ordre@x.dk'], [], now, 10), ['ordre@x.dk'])
eq('ikke-konfigureret gammel postkasse (crm@) ignoreres', staleMailboxes(['kontakt@x.dk'],
  [{ mailbox: 'kontakt@x.dk', last_sync_at: iso(2) }, { mailbox: 'crm@x.dk', last_sync_at: '2026-02-28T17:11:36Z' }], now, 10), [])
eq('store/små bogstaver ens', staleMailboxes(['Kontakt@X.dk'], [{ mailbox: 'kontakt@x.dk', last_sync_at: iso(1) }], now, 10), [])
eq('ugyldig dato = forældet', staleMailboxes(['kontakt@x.dk'], [{ mailbox: 'kontakt@x.dk', last_sync_at: 'ikke-en-dato' }], now, 10), ['kontakt@x.dk'])
eq('præcis på grænsen er frisk', staleMailboxes(['kontakt@x.dk'], [{ mailbox: 'kontakt@x.dk', last_sync_at: iso(10) }], now, 10), [])

if (failed) { console.log(`❌ ${failed} fejlede`); process.exit(1) }
console.log('✅ alle mail-synk-friskheds-tests bestået')
