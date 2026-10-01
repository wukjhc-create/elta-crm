/** Unit: dekodning af grossist-CSV (UTF-8 / ISO-8859-1). Kør: npx tsx scripts/decode-text-file-test.ts */
import { decodeTextFile } from '../src/lib/utils/decode-text-file'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`) }
const header = 'Varenummer;Beskrivelse;Indkøbspris;Leverandør'
const latin1 = Buffer.from(header + '\n1234;Kabel 3x1,5 mørkegrå;12,50;Ærø El', 'latin1')
eq('ISO-8859-1 header bevares', decodeTextFile(latin1).text.split('\n')[0], header)
eq('ISO-8859-1 → windows-1252', decodeTextFile(latin1).encoding, 'windows-1252')
eq('ISO-8859-1 æøå i data', decodeTextFile(latin1).text.split('\n')[1], '1234;Kabel 3x1,5 mørkegrå;12,50;Ærø El')
const utf8 = Buffer.from(header + '\n1;Stikkontakt hvid;9,95;Lemvigh-Müller', 'utf8')
eq('UTF-8 bevares', decodeTextFile(utf8).text.split('\n')[1], '1;Stikkontakt hvid;9,95;Lemvigh-Müller')
eq('UTF-8 genkendes', decodeTextFile(utf8).encoding, 'utf-8')
const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(header, 'utf8')])
eq('UTF-8 BOM fjernes', decodeTextFile(bom).text, header)
eq('euro i windows-1252', decodeTextFile(new Uint8Array([0x80, 0x31])).text, '€1')
eq('ren ASCII = utf-8', decodeTextFile(Buffer.from('a;b;c')).encoding, 'utf-8')
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle dekodnings-tests PASS')
process.exitCode = fail ? 1 : 0
