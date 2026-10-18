/**
 * Unit-test (ingen DB) for lead-vedhæftningsadgang — LD-1.
 *   npx tsx scripts/lead-attachment-access-test.ts
 */
import { leadCopyAllowed, sourcePathAllowed, isSafeStoragePath } from '../src/lib/leads/attachment-access'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }

const lead = '11111111-1111-1111-1111-111111111111'
const own = `lead-attachments/${lead}/tilbud.pdf`
const src = 'email-attachments/mail-1/0-billede.jpg'
const foreign = 'supplier-invoices/2026/faktura.pdf'
const atts = [{ leadStoragePath: own, sourcePath: src }, { leadStoragePath: foreign, sourcePath: foreign }]
const mailAtts = [{ filename: 'billede.jpg', storagePath: src }]

ok(leadCopyAllowed(lead, own, atts), 'leadets egen kopi signeres')
ok(!leadCopyAllowed(lead, foreign, atts), 'indsat fremmed sti som leadStoragePath afvises')
ok(!leadCopyAllowed('22222222-2222-2222-2222-222222222222', own, atts), 'andet leads mappe afvises')
ok(sourcePathAllowed(src, atts, mailAtts), 'kildesti fra leadets egen kildemail signeres')
ok(!sourcePathAllowed(foreign, atts, mailAtts), 'indsat fremmed kildesti (ikke på kildemailen) afvises')
ok(!sourcePathAllowed(src, atts, null), 'kildemail uden vedhæftninger → afvist')
ok(!sourcePathAllowed(src, [], mailAtts), 'sti der ikke står på leadet → afvist')
ok(!isSafeStoragePath(`lead-attachments/${lead}/../../x`) && !isSafeStoragePath('') && !isSafeStoragePath('/abs'), 'stier med .. / tom / absolut afvises')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ lead-vedhæftningsadgang ok')
process.exitCode = bad ? 1 : 0
