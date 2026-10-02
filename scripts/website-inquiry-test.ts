/**
 * Unit-tests for webhenvendelser (src/lib/mail/website-inquiry.ts + mail-parseren). Syntetiske data, ingen DB.
 *   npx tsx scripts/website-inquiry-test.ts
 */
import { isWebsiteInquiry, normalizeFormSubmitTable } from '../src/lib/mail/website-inquiry'
import { parseCustomerFromEmail } from '../src/lib/utils/email-parser'
import { scoreEmail } from '../src/lib/services/email-intelligence'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

ok(isWebsiteInquiry({ senderEmail: 'submissions@formsubmit.co', subject: 'Ny henvendelse fra eltasolar.dk' }), 'kontaktformular = webhenvendelse')
ok(isWebsiteInquiry({ senderEmail: 'submissions@formsubmit.co', subject: '🌞 Ny henvendelse - ELTA Solar' }), 'variant med emoji')
ok(!isWebsiteInquiry({ senderEmail: 'noreply@formsubmit.co', subject: 'Action Required: Activate FormSubmit on http://eltasolar.dk/' }), 'FormSubmit-systemmail er ikke en henvendelse')
ok(!isWebsiteInquiry({ senderEmail: 'kunde@example.dk', subject: 'Ny henvendelse' }), 'anden afsender er ikke FormSubmit')

const body = [
  'Ny henvendelse fra eltasolar.dk', "Here's what they had to say:", 'Name', 'Value',
  'name', 'Test Testesen', 'phone', '+45 11 22 33 44', 'email', 'test.testesen@example.dk',
  'inquiry_type', 'Solceller', 'message', 'Vi vil gerne have et tilbud på solceller', 'Your friends from,', 'FormSubmit Team',
].join('\n')
const norm = normalizeFormSubmitTable(body)
ok(norm.includes('Navn: Test Testesen') && norm.includes('Telefon: +45 11 22 33 44') && norm.includes('Type: Solceller'), 'tabel → "Navn: …"-linjer')
ok(normalizeFormSubmitTable('Hej\nnavn\nx') === 'Hej\nnavn\nx', 'anden tekst uændret')

const parsed = parseCustomerFromEmail(body, null, 'submissions@formsubmit.co')
ok(parsed.email === 'test.testesen@example.dk', 'parser: kundens mail (ikke FormSubmit)', String(parsed.email))
ok((parsed.name ?? '').includes('Test Testesen'), 'parser: navn', String(parsed.name))
ok(!!parsed.phone && parsed.phone.replace(/\D/g, '').endsWith('11223344'), 'parser: telefon', String(parsed.phone))

// Regressionsværn: andre FormSubmit-/noreply-mails scores fortsat ned (støjfiltret er uændret for dem)
ok(scoreEmail({ subject: 'Action Required: Activate FormSubmit', senderEmail: 'noreply@formsubmit.co', senderName: null, bodyText: 'activate', bodyHtml: null, bodyPreview: null } as never) < 2, 'systemmail fortsat lav score')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle webhenvendelses-tests bestået')
process.exitCode = bad ? 1 : 0
