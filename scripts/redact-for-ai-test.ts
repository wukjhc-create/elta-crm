/**
 * Unit-test (ingen I/O) for redactForAi — AI-4.
 *   npx tsx scripts/redact-for-ai-test.ts
 */
import { redactForAi } from '../src/lib/ai/redact-for-ai'

let bad = 0
const ok = (c: boolean, label: string, got?: unknown) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && got !== undefined ? '  → ' + JSON.stringify(got) : ''}`) }

ok(redactForAi('Mit CPR er 010190-1234, tak') === 'Mit CPR er [CPR], tak', 'CPR med bindestreg', redactForAi('Mit CPR er 010190-1234, tak'))
ok(redactForAi('cpr 0101901234') === 'cpr [CPR]', 'CPR uden bindestreg', redactForAi('cpr 0101901234'))
ok(redactForAi('Ordre 9999991234') === 'Ordre 9999991234', '10 cifre der ikke ligner en dato bevares', redactForAi('Ordre 9999991234'))
ok(redactForAi('Ring 20 34 56 78 eller 20345678') === 'Ring 20 34 56 78 eller 20345678', 'telefonnumre bevares', redactForAi('Ring 20 34 56 78 eller 20345678'))
ok(redactForAi('Reg 1234 konto 1234 0012345678') === 'Reg 1234 konto [KONTONR]', 'reg.nr. + kontonr.', redactForAi('Reg 1234 konto 1234 0012345678'))
ok(redactForAi('Kort 4111 1111 1111 1111') === 'Kort [KORTNR]', 'kortnummer', redactForAi('Kort 4111 1111 1111 1111'))
ok(redactForAi('IBAN DK50 0040 0440 1162 43') === 'IBAN [IBAN]', 'IBAN', redactForAi('IBAN DK50 0040 0440 1162 43'))
ok(redactForAi('Solvej 12, 4000 Roskilde') === 'Solvej 12, 4000 Roskilde', 'adresse/postnummer bevares')
ok(redactForAi(null) === '', 'null → tom')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ AI-maskering ok')
process.exitCode = bad ? 1 : 0
