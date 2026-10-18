/**
 * Unit-test (ingen I/O) for unverifiedDraftClaims — AI-7.
 *   npx tsx scripts/draft-content-check-test.ts
 */
import { unverifiedDraftClaims, hasDraftWarnings } from '../src/lib/agents/draft-content-check'

let bad = 0
const ok = (c: boolean, label: string, got?: unknown) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && got !== undefined ? '  → ' + JSON.stringify(got) : ''}`) }

const src = 'Hej, jeg vil gerne have et tilbud på solceller. Ring på 20 34 56 78. Budget ca. 80.000 kr.'
let w = unverifiedDraftClaims('Tak! Vi ringer på 20345678 og ser på de 80.000 kr. Se mere på eltasolar.dk', src)
ok(!hasDraftWarnings(w), 'kundens eget nummer/beløb og Eltas website giver ingen advarsel', w)

w = unverifiedDraftClaims('Betal 4.995 kr. på https://evil.example/pay eller ring 70 11 22 33', src)
ok(w.urls.length === 1 && w.phones.length === 1 && w.amounts.length === 1, 'fremmed link, nummer og beløb markeres', w)

w = unverifiedDraftClaims('Se https://www.eltasolar.dk/solceller', src)
ok(w.urls.length === 0, 'Eltas eget domæne er ok', w)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ udkast-indholdstjek ok')
process.exitCode = bad ? 1 : 0
