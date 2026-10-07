/**
 * Unit-tests for ELTA Assistant-kommandofortolkeren (src/lib/assistant/command-parser.ts). Ingen DB/netværk.
 *   npx tsx scripts/assistant-parser-test.ts
 * "Nu" er fast: tirsdag 2026-10-06 14:30 dansk tid (12:30 UTC, sommertid).
 */
import { parseAssistantCommand as p } from '../src/lib/assistant/command-parser'

const NOW = new Date('2026-10-06T12:30:00Z')
let bad = 0
const ok = (c: boolean, label: string, got?: unknown) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && got !== undefined ? '  → ' + JSON.stringify(got) : ''}`) }
const run = (s: string) => p(s, NOW)
type Ok = Extract<ReturnType<typeof p>, { ok: true }>
const as = (r: ReturnType<typeof p>) => r as Ok

let r = run('Ring til kunde Hansen i morgen kl. 10')
ok(r.ok && as(r).intent === 'callback' && as(r).target === 'Hansen' && as(r).when?.date === '2026-10-07' && as(r).when?.clock === '10:00' && as(r).when?.iso === '2026-10-07T08:00:00.000Z', 'callback i morgen kl. 10 (sommertid → 08:00Z)', r)
r = run('ring til Jens Pedersen ApS på fredag kl 8:30')
ok(r.ok && as(r).target === 'Jens Pedersen ApS' && as(r).when?.date === '2026-10-09' && as(r).when?.clock === '08:30', 'ugedag "på fredag" + kl 8:30', r)
r = run('Ring til Hansen tirsdag kl. 9')
ok(r.ok && as(r).when?.date === '2026-10-13', 'samme ugedag som i dag → om en uge', r)
r = run('Ring til Hansen d. 2/11 kl. 9.15')
ok(r.ok && as(r).when?.date === '2026-11-02' && as(r).when?.clock === '09:15', 'dato d. 2/11 + kl. 9.15', r)
r = run('Ring til Hansen d. 1/3 kl 9')
ok(r.ok && as(r).when?.date === '2027-03-01', 'dato i fortiden uden år → næste år', r)
r = run('Ring til Hansen d. 30/2 kl 9')
ok(!r.ok, 'ugyldig dato afvises', r)
r = run('Ring til Hansen kl 25')
ok(!r.ok, 'ugyldigt klokkeslæt afvises', r)
r = run('Ring til Hansen om 2 timer')
ok(r.ok && as(r).when?.date === '2026-10-06' && as(r).when?.clock === '16:30', 'om 2 timer', r)
r = run('Ring til Hansen i morgen')
ok(!r.ok && /Hvad tid/.test((r as { reason: string }).reason), 'callback uden klokkeslæt → spørg (gæt aldrig)', r)
r = run('Ring til Hansen')
ok(!r.ok && /Hvornår/.test((r as { reason: string }).reason), 'callback uden tid → spørg', r)
r = run('Mind mig om at bestille tavle fredag kl 8')
ok(r.ok && as(r).intent === 'reminder' && as(r).text === 'bestille tavle' && as(r).when?.clock === '08:00', 'mind mig om … fredag kl 8', r)
r = run('Husk at sende tilbud til Hansen i overmorgen kl. 7')
ok(r.ok && as(r).intent === 'reminder' && as(r).text === 'sende tilbud til Hansen' && as(r).when?.date === '2026-10-08', 'husk at … i overmorgen', r)
r = run('Note til SVC-01019: kunden ønsker hvid tavle i morgen')
ok(r.ok && as(r).intent === 'note' && as(r).target === 'SVC-01019' && as(r).text === 'kunden ønsker hvid tavle i morgen' && as(r).when === null, 'note — tidsord i teksten bevares', r)
r = run('note på kunde Hansen: ring efter kl 16')
ok(r.ok && as(r).target === 'Hansen' && as(r).text === 'ring efter kl 16', 'note på kunde X', r)
r = run('Status på SVC-01019')
ok(r.ok && as(r).intent === 'lookup' && as(r).target === 'SVC-01019', 'status på sag', r)
r = run('find kunden Hansen')
ok(r.ok && as(r).intent === 'lookup' && as(r).target === 'Hansen', 'find kunden X', r)
r = run('Besigtigelse hos Jensen d. 14/10 kl 9')
ok(r.ok && as(r).intent === 'appointment' && as(r).target === 'Jensen' && as(r).when?.date === '2026-10-14' && as(r).text === 'besigtigelse', 'besigtigelse hos X d. 14/10 kl 9', r)
r = run('Ring til Hansen kl 10.30')
ok(r.ok && as(r).when?.clock === '10:30' && as(r).when?.date === '2026-10-06', '"kl 10.30" er klokkeslæt (ikke dato) → i dag', r)
r = run('hvad er vejret')
ok(!r.ok, 'ukendt kommando → forklaring', r)
ok(!run('').ok && !run('x'.repeat(501)).ok, 'tom / for lang afvises')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle assistant-parser-tests bestået')
process.exitCode = bad ? 1 : 0
