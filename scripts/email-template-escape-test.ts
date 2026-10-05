/**
 * Unit-tests: kundetekst escapes i udgående mailskabeloner (kommunikations-review 2026-10-04). Ingen DB.
 *   npx tsx scripts/email-template-escape-test.ts
 */
import { generateCrmReplyHtml } from '../src/lib/email/templates/crm-reply-email'
import { generateReminderEmailHtml } from '../src/lib/email/templates/reminder-email'
import { generateQuoteEmailHtml } from '../src/lib/email/templates/quote-email'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
const EVIL = '<a href="https://evil.example/login">Log ind hos Elta</a>'

const reply = generateCrmReplyHtml({
  messageBody: 'Hej\nVi kommer tirsdag',
  senderName: 'Elta', senderEmail: 'kontakt@eltasolar.dk',
  originalDate: '4. oktober 2026', originalSender: 'Hanne <hanne@example.dk>',
  originalBody: `Linje 1\n${EVIL}`,
})
ok(!reply.includes(EVIL) && reply.includes('&lt;a href=&quot;https://evil.example/login&quot;&gt;'), 'citeret kundemail: link escapes (ikke klikbart)')
ok(reply.includes('Hanne &lt;hanne@example.dk&gt;'), 'afsendernavn med <adresse> vises (før forsvandt det)')
ok(reply.includes('Linje 1<br/>') && reply.includes('Hej<br/>Vi kommer tirsdag'), 'linjeskift bevares')

const rem = generateReminderEmailHtml({ customerName: EVIL, companyName: 'A/S', offerNumber: 'T-1', offerTitle: '<b>Sol</b>',
  finalAmount: '1.000 kr.', validUntil: null, portalUrl: 'https://crm/portal/x', senderName: 'Elta', reminderCount: 1 })
ok(!rem.includes(EVIL) && !rem.includes('<b>Sol</b>') && rem.includes('&lt;b&gt;Sol&lt;/b&gt;'), 'rykker: kundenavn/titel escapes')
ok(rem.includes('href="https://crm/portal/x"'), 'rykker: portal-link uændret')

const q = generateQuoteEmailHtml({ quoteReference: 'Q-1', title: EVIL, customerName: 'Ole & Co', companyName: '',
  total: 1000, validUntil: new Date('2026-11-01T12:00:00Z'), companySettings: { company_name: 'Elta Solar ApS' } as never, templateType: 'sales' } as never)
ok(!q.includes(EVIL) && q.includes('Ole &amp; Co'), 'tilbudsmail (quote): titel/navn escapes')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle skabelon-escape-tests bestået')
process.exitCode = bad ? 1 : 0
