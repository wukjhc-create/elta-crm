/**
 * Assistentens opslagssvar. Ingen webhook, ingen hemmelighed, ingen afsendelse.
 *   npx tsx scripts/lookup-reply-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lookupReply } from '../src/lib/assistant/lookup-reply'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

const none = lookupReply('Hansen', 'none', [])
ok(none === 'Jeg fandt ingen kunde eller sag for "Hansen".', 'ingen træf siger det', none)
ok(!none.includes('passer på'), 'ingen træf er ikke en kandidatliste')

const many = lookupReply('Hansen', 'ambiguous', ['Hansen A/S (K-10)', 'Hansen VVS (K-22)'])
ok(many.startsWith('"Hansen" passer på 2 — skriv kommandoen igen med kundenummer/sagsnummer:'), 'flere træf siger antallet')
ok(many.includes('• Hansen A/S (K-10)') && many.includes('• Hansen VVS (K-22)'), 'kandidaterne står i svaret')
ok(lookupReply('X', 'ambiguous', []).includes('Jeg fandt ingen kunde eller sag'), 'tom kandidatliste er ikke et gæt')

const reply = readFileSync(join('src', 'lib', 'assistant', 'lookup-reply.ts'), 'utf8')
ok(!reply.includes('webhook') && !reply.includes('TELEGRAM') && !reply.includes('process.env'), 'svaret tænder ikke noget live')

const run = readFileSync(join('src', 'lib', 'assistant', 'run-command.ts'), 'utf8')
ok(run.includes("lookupReply(cmd.target, 'none', [])"), 'ingen træf går gennem funktionen')
ok(run.includes("lookupReply(cmd.target, 'ambiguous', res.candidates.map((c) => c.label))"), 'flere træf går gennem funktionen')

const hook = readFileSync(join('src', 'lib', 'assistant', 'telegram', 'handle-update.ts'), 'utf8')
ok(!hook.includes('lookupReply'), 'webhook-handleren er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  lookup-reply-test')
