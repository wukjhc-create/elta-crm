/**
 * C1a klassifikationsfeedback — rene + statiske tests (ingen DB).
 *   npx tsx scripts/classification-feedback-test.ts
 *
 * Dækker: validering af vurderinger/rettelser, flag standard FRA, gate i begge handlinger, at loader/kontekst/feedback
 * kun LÆSER (ingen skrivning i mails/kunder/sager/henvendelser), at feedback kun skrives som audit-række, at boksen kun
 * renderes bag serverens afgørelse, og at mailflowet (sync/linker/intelligence/Stage A) ikke importerer klassifikatoren.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { classifyInquiry } from '../src/lib/classification/inquiry-classifier'
import { validateFeedback, FEEDBACK_VERDICTS, redactFeedbackNote, isSameFeedback, FEEDBACK_NOTE_MAX } from '../src/lib/classification/feedback'
import { classificationFeedbackEnabled } from '../src/lib/classification/feature-flag'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [] })

const ID = '11111111-2222-4333-8444-555555555555'
const pred = classifyInquiry({ supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] }, textSignals: ['subject_order_confirmation'] })
const v = (verdict: string, corrected?: Record<string, unknown>, note?: string | null) => validateFeedback({ emailId: ID, verdict, corrected, note }, pred)

// --- Validering
ok('forudsigelse til test: leverandør/ordrebekræftelse', pred.senderType === 'supplier' && pred.inquiryType === 'order_confirmation')
ok('korrekt uden rettelse → ok', v('correct').ok)
ok('kan ikke vurderes → ok', v('cannot_assess').ok)
ok('korrekt MED rettelse afvises', !v('correct', { inquiryType: 'invoice' }).ok)
ok('forkert uden rettelse afvises', !v('wrong').ok)
ok('forkert med "rettelse" = forudsigelsen afvises (ingen ændring)', !v('wrong', { inquiryType: 'order_confirmation' }).ok)
const w = v('wrong', { inquiryType: 'invoice', senderType: 'supplier' })
ok('forkert med rettet type → kun den ændrede dimension gemmes', w.ok && JSON.stringify((w as { corrected: unknown }).corrected) === '{"inquiryType":"invoice"}')
ok('delvist med én rettelse → ok', v('partial', { caseReference: 'existing_case' }).ok)
ok('delvist med alle fire rettet afvises', !v('partial', { senderType: 'unknown', inquiryType: 'invoice', caseReference: 'existing_case', proposedAction: 'manual_review' }).ok)
ok('ugyldig værdi afvises', !v('wrong', { inquiryType: 'faktura' }).ok)
ok('ukendt dimension afvises', !v('wrong', { priority: 'high' }).ok)
ok('ukendt vurdering afvises', !v('maybe').ok)
ok('ugyldigt mail-id afvises', !validateFeedback({ emailId: 'x', verdict: 'correct' }, pred).ok)
const n = v('correct', undefined, '  ' + 'x'.repeat(900))
ok('note trimmes og afkortes til 200', FEEDBACK_NOTE_MAX === 200 && n.ok && (n as { note: string }).note.length === 200)
// --- Personoplysninger i noten (hærdning 2026-11-27)
ok('e-mail i note erstattes', redactFeedbackNote('skriv til Hans.Jensen@firma.dk om det') === 'skriv til [e-mail] om det')
ok('telefon med mellemrum erstattes', redactFeedbackNote('ring 12 34 56 78 i dag') === 'ring [tal] i dag')
ok('+45-nummer erstattes', redactFeedbackNote('tlf +4512345678') === 'tlf [tal]')
ok('CPR erstattes', redactFeedbackNote('cpr 010203-1234') === 'cpr [tal]')
ok('sagsnummer bevares', redactFeedbackNote('hører til SVC-01006') === 'hører til SVC-01006')
ok('kort tal bevares', redactFeedbackNote('postnr 8000, 2 stk') === 'postnr 8000, 2 stk')
ok('linjeskift/whitespace samles', redactFeedbackNote(' a\n\n b ') === 'a b')
const rn = v('correct', undefined, 'kunde ring 87654321 / a@b.dk')
ok('validateFeedback gemmer kun redigeret note', rn.ok && (rn as { note: string }).note === 'kunde ring [tal] / [e-mail]')
// --- Gentagne indsendelser
const base = { version: 'c1-v1', verdict: 'wrong' as const, corrected: { inquiryType: 'invoice' as const }, note: null }
ok('identisk seneste vurdering → samme', isSameFeedback({ version: 'c1-v1', verdict: 'wrong', corrected: { inquiryType: 'invoice' }, note: null }, base))
ok('anden rettelse → ny række', !isSameFeedback({ version: 'c1-v1', verdict: 'wrong', corrected: { inquiryType: 'service_request' }, note: null }, base))
ok('anden version → ny række', !isSameFeedback({ version: 'c1-v0', verdict: 'wrong', corrected: { inquiryType: 'invoice' }, note: null }, base))
ok('anden note → ny række', !isSameFeedback({ version: 'c1-v1', verdict: 'wrong', corrected: { inquiryType: 'invoice' }, note: 'x' }, base))
ok('ingen tidligere → ny række', !isSameFeedback(null, base))
ok('tom note → null', (v('correct', undefined, '   ') as { note: string | null }).note === null)
ok('fire vurderinger', FEEDBACK_VERDICTS.join() === 'correct,partial,wrong,cannot_assess')

// --- Flag
const old = process.env.CLASSIFICATION_FEEDBACK_ENABLED
delete process.env.CLASSIFICATION_FEEDBACK_ENABLED
ok('flag standard FRA', !classificationFeedbackEnabled())
process.env.CLASSIFICATION_FEEDBACK_ENABLED = '1'; ok('kun "true" tænder', !classificationFeedbackEnabled())
process.env.CLASSIFICATION_FEEDBACK_ENABLED = 'true'; ok('"true" tænder', classificationFeedbackEnabled())
if (old === undefined) delete process.env.CLASSIFICATION_FEEDBACK_ENABLED; else process.env.CLASSIFICATION_FEEDBACK_ENABLED = old

// --- Statisk: kun læsning, kun audit-skrivning, gate
const action = read('src/lib/actions/classification-feedback.ts')
const loader = read('src/lib/classification/load-email-classification.ts')
const pureFiles = ['inquiry-context.ts', 'inquiry-classifier.ts', 'inquiry-text-signals.ts', 'feedback.ts', 'feature-flag.ts'].map((f) => read(`src/lib/classification/${f}`))
const WRITE = /\.(insert|update|upsert|delete)\(|\.rpc\(/
ok('loader skriver aldrig (ingen insert/update/upsert/delete/rpc)', !WRITE.test(loader))
ok('rene moduler har ingen DB-kald', pureFiles.every((s) => !/\.from\(|createAdminClient|createClient/.test(s)))
ok('handling skriver ikke direkte (kun via insertAuditRow)', !WRITE.test(action) && (action.match(/insertAuditRow\(/g) ?? []).length === 1)
ok('feedback skrives som audit-række classification_feedback på incoming_email', /FEEDBACK_ACTION/.test(action) && read('src/lib/classification/feedback.ts').includes("FEEDBACK_ACTION = 'classification_feedback'"))
ok('begge eksporterede handlinger er gatet', ['getEmailClassificationAction', 'submitClassificationFeedbackAction'].every((fn) => {
  const body = action.slice(action.indexOf(`export async function ${fn}`)); return /await requireAdminClassificationCtx\(\)/.test(body.slice(0, 600))
}))
ok('gate: flag først, derefter settings.manage', /if \(!classificationFeedbackEnabled\(\)\)[\s\S]{0,200}hasPermission\('settings\.manage'\)/.test(action))
ok('indsendelse klassificerer selv (klientens forudsigelse bruges ikke)', /submitClassificationFeedbackAction[\s\S]*loadEmailClassification\(db, input\.emailId\)[\s\S]*validateFeedback\(input, c\.classification\)/.test(action))
ok('ingen skrivning i drifttabeller fra C1a', ![action, loader].some((s) => /from\('(incoming_emails|conversations|conversation_actions|customers|service_cases)'\)\.(insert|update|upsert|delete)/.test(s)))

ok('gentagelse: seneste egen vurdering læses (bruger + mail) før indsættelse', /\.eq\('entity_id', input\.emailId\)\.eq\('user_id', g\.userId\)[\s\S]{0,200}limit\(1\)[\s\S]*isSameFeedback\([\s\S]*insertAuditRow\(/.test(action))
ok('rettelse kan identificeres: revision + supersedes i metadata', /revision,\n\s*supersedes: last\?\.id \?\? null/.test(action))
ok('metadata har skema, version og forudsigelse — intet mailindhold', /schema: FEEDBACK_SCHEMA,\n\s*version: p\.version/.test(action) && !/subject|body_|from_email|sender_|entity_name|user_email|user_name/.test(action.slice(action.indexOf('insertAuditRow({'))))
const core = read('scripts/test-harness/phase-c-baseline-core.ts')
ok('C0 tæller kun seneste vurdering pr. mail og bruger + versioner/dimensioner', /DISTINCT ON \(entity_id, user_id\)/.test(core) && /'by_version'/.test(core) && /'dim_corrected'/.test(core) && /'corrections'/.test(core))

// --- UI bag serverens afgørelse
const page = read('src/app/dashboard/mail/page.tsx')
const detail = read('src/app/dashboard/mail/components/mail-detail.tsx')
ok('siden afgør flag + settings.manage', /classificationFeedbackEnabled\(\)/.test(page) && /hasPermission\('settings\.manage'\)/.test(page))
ok('mailvisningen renderer kun boksen bag prop', /\{showClassificationFeedback && <ClassificationFeedbackPanel/.test(detail))
ok('boksen er lukket som standard og henter først ved åbning', /useState\(false\)/.test(read('src/app/dashboard/mail/components/classification-feedback-panel.tsx')))

// --- Mailflowet importerer ikke klassifikatoren (ingen påvirkning af drift)
const flow = [...walk('src/lib/services'), ...walk('src/lib/reception'), ...walk('src/app/api')].map((p) => ({ p, s: readFileSync(p, 'utf8') }))
const importers = flow.filter((f) => /lib\/classification\//.test(f.s)).map((f) => f.p)
ok('sync/linker/intelligence/Stage A/API importerer ikke lib/classification', importers.length === 0, importers.join(', '))
const allImporters = walk('src').filter((p) => !p.replace(/\\/g, '/').includes('src/lib/classification/')).filter((p) => /lib\/classification\//.test(readFileSync(p, 'utf8'))).map((p) => p.replace(/\\/g, '/').replace(/^.*src\//, 'src/')).sort()
// Phase C (2026-11-27): koordinator-modulerne (C2/C3, bag COORDINATOR_ENABLED) læser også klassifikationen — stadig ikke mailflowet
ok('kun C1a- og koordinator-filerne bruger lib/classification', JSON.stringify(allImporters) === JSON.stringify([
  'src/app/dashboard/mail/components/classification-feedback-panel.tsx', 'src/app/dashboard/mail/page.tsx', 'src/lib/actions/classification-feedback.ts',
  'src/lib/coordinator/identity-signals.ts', 'src/lib/coordinator/load-identity.ts', 'src/lib/coordinator/suggestions.ts',
]), allImporters.join(', '))
// Mailflowet (services/reception/api) må kun importere koordinatorens FLAG (C4-tilstand), aldrig motoren
const coordImporters = flow.filter((f) => /lib\/coordinator\/(?!feature-flag)/.test(f.s)).map((f) => f.p)
ok('mailflowet importerer kun koordinatorens flag, ikke motoren', coordImporters.length === 0, coordImporters.join(', '))

console.log(fail ? `❌ ${fail} fejl, ${pass} ok` : `✅ ${pass} tjek — C1a klassifikationsfeedback (rene/statiske)`)
process.exitCode = fail ? 1 : 0
