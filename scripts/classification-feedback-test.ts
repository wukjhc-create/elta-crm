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
import { validateFeedback, FEEDBACK_VERDICTS } from '../src/lib/classification/feedback'
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
ok('note trimmes og afkortes til 500', n.ok && (n as { note: string }).note.length === 500)
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
ok('kun C1a-filerne bruger lib/classification', JSON.stringify(allImporters) === JSON.stringify([
  'src/app/dashboard/mail/components/classification-feedback-panel.tsx', 'src/app/dashboard/mail/page.tsx', 'src/lib/actions/classification-feedback.ts',
]), allImporters.join(', '))

console.log(fail ? `❌ ${fail} fejl, ${pass} ok` : `✅ ${pass} tjek — C1a klassifikationsfeedback (rene/statiske)`)
process.exitCode = fail ? 1 : 0
