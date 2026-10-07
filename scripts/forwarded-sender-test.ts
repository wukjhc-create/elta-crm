/**
 * Unit-tests for oprindelig afsender (extractOriginalSender i src/lib/services/email-linker.ts). Ingen DB.
 *   npx tsx scripts/forwarded-sender-test.ts
 */
import { extractOriginalSender } from '../src/lib/services/email-linker'

let bad = 0
const ok = (c: boolean, label: string, got?: unknown) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && got !== undefined ? '  → ' + JSON.stringify(got) : ''}`) }

// Almindeligt svar fra kunden med citeret Elta-mail (Outlook)
const reply = 'Tak, det passer fint.\n\nFra: Elta Solar <kontakt@eltasolar.dk>\nSendt: 6. oktober 2026\nEmne: Tilbud'
let r = extractOriginalSender('kunde@firma.dk', 'Kunde', 'SV: Tilbud', null, reply)
ok(r.email === 'kunde@firma.dk' && !r.isForwarded, 'svar (SV:) med citeret Elta-"Fra:" → kundens egen adresse (før kontakt@eltasolar.dk)', r)
r = extractOriginalSender('kunde@firma.dk', 'Kunde', 'Re: Tilbud', null, 'Hej\nFrom: Elta <ordre@eltasolar.dk>')
ok(r.email === 'kunde@firma.dk' && !r.isForwarded, 'svar (Re:) engelsk citat → kundens adresse', r)
// Rigtig videresendelse fra medarbejder
r = extractOriginalSender('henrik@eltasolar.dk', 'Henrik', 'VS: hjælp', null, '---------- Videresendt besked ----------\nFra: Kunde A <a@kunde.dk>\nEmne: hjælp')
ok(r.email === 'a@kunde.dk' && r.isForwarded, 'videresendt (VS:) → oprindelig afsender', r)
r = extractOriginalSender('henrik@eltasolar.dk', 'Henrik', 'tjek denne', null, '---------- Forwarded message ---------\nFrom: Bo <bo@kunde.dk>')
ok(r.email === 'bo@kunde.dk' && r.isForwarded, 'videresendt-markør uden VS: i emnet', r)
// Videresendt hvor første "Fra:" er intern (kæde) → næste mønster / fallback
r = extractOriginalSender('henrik@eltasolar.dk', 'Henrik', 'VS: SV: tilbud', null, 'Fra: Elta <kontakt@eltasolar.dk>')
ok(r.email === 'henrik@eltasolar.dk' && r.isForwarded, 'videresendt kun med intern Fra: → falder tilbage til afsender (intet internt "kunde"-match)', r)
r = extractOriginalSender('kunde@firma.dk', null, 'Spørgsmål', null, 'Hej, jeg har et spørgsmål')
ok(r.email === 'kunde@firma.dk' && !r.isForwarded, 'almindelig mail uden citat', r)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle afsender-tests bestået')
process.exitCode = bad ? 1 : 0
