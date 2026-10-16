/**
 * Unit-tests: lead-opfølgning (X-11) — src/lib/leads/follow-up.ts. Ingen DB.
 *   npx tsx scripts/lead-follow-up-test.ts
 */
import { followUpState, validateFollowUpInput } from '../src/lib/leads/follow-up'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const now = new Date('2026-10-16T08:00:00Z') // 10:00 dansk tid
ok(followUpState({ status: 'new', follow_up_at: null }, now) === 'none', 'ingen opfølgning')
ok(followUpState({ status: 'new', follow_up_at: '2026-10-16T07:00:00Z' }, now) === 'overdue', 'tidligere i dag = forfalden')
ok(followUpState({ status: 'new', follow_up_at: '2026-10-16T12:00:00Z' }, now) === 'today', 'senere i dag = i dag')
ok(followUpState({ status: 'new', follow_up_at: '2026-10-16T22:30:00Z' }, now) === 'planned', '00:30 dansk næste dag = planlagt (ikke "i dag" pga. UTC)')
ok(followUpState({ status: 'won', follow_up_at: '2026-10-01T07:00:00Z' }, now) === 'none', 'vundet lead har ingen aktiv opfølgning')
ok(followUpState({ status: 'lost', follow_up_at: '2026-10-01T07:00:00Z' }, now) === 'none', 'tabt lead har ingen aktiv opfølgning')
ok(followUpState({ status: 'new', follow_up_at: 'ikke-en-dato' }, now) === 'none', 'ugyldig dato ignoreres')

const v1 = validateFollowUpInput({ date: '2026-10-20', clock: '', note: ' Ring  ' })
ok(v1.ok && v1.clock === '09:00' && v1.note === 'Ring', 'standard 09:00 og trimmet note')
ok(!validateFollowUpInput({ date: '20-10-2026' }).ok, 'forkert datoformat afvises')
ok(!validateFollowUpInput({ date: '2026-10-20', clock: '9' }).ok, 'forkert klokkeslæt afvises')
ok(!validateFollowUpInput({ date: '2026-10-20', note: 'x'.repeat(501) }).ok, 'note over 500 afvises')

console.log(bad ? `\n${bad} FAIL` : '\nALL PASS')
process.exit(bad ? 1 : 0)
