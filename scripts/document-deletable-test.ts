/**
 * Unit-tests: hvilke dokumenter må slettes (X-12) — src/lib/documents/document-deletable.ts. Ingen DB.
 *   npx tsx scripts/document-deletable-test.ts
 */
import { documentDeleteBlockReason } from '../src/lib/documents/document-deletable'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

ok(documentDeleteBlockReason({ document_type: 'other' }) === null, 'uploadet "andet" må slettes')
ok(documentDeleteBlockReason({ document_type: 'internal' }) === null, 'internt dokument må slettes')
for (const t of ['invoice', 'quote', 'contract', 'besigtigelse']) ok(documentDeleteBlockReason({ document_type: t }) !== null, `${t} er beskyttet`)
ok(documentDeleteBlockReason({ document_type: 'other', offer_id: 'x' }) !== null, 'koblet til tilbud er beskyttet')
ok(documentDeleteBlockReason({ document_type: 'other', sent_quote_id: 'x' }) !== null, 'koblet til sendt tilbud er beskyttet')
ok(documentDeleteBlockReason({ document_type: 'other', source_email_id: 'x' }) !== null, 'arkiveret mail-vedhæftning er beskyttet')
ok(documentDeleteBlockReason({ document_type: 'other', description: JSON.stringify({ type: 'outbound_attachment' }) }) !== null, 'udgående mail-vedhæftning er beskyttet')
ok(documentDeleteBlockReason({ document_type: 'other', description: 'ikke json' }) === null, 'ugyldig beskrivelse blokerer ikke')
ok(documentDeleteBlockReason({ document_type: null }) !== null, 'ukendt type er beskyttet')
// DL-1 (2026-10-18): ældre besigtigelse gemt som 'other'
ok(documentDeleteBlockReason({ document_type: 'other', title: 'Besigtigelse Solvej 12' }) !== null, "'other' med besigtigelse i titlen er beskyttet")
ok(documentDeleteBlockReason({ document_type: 'other', title: 'Foto af tavle' }) === null, 'almindeligt andet-dokument kan stadig slettes')

console.log(bad ? `\n${bad} FAIL` : '\nALL PASS')
process.exit(bad ? 1 : 0)
