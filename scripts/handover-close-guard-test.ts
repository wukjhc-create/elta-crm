/**
 * Pilot-sim 2026-10-31 (S2): aflevering-værnet ved lukning (src/lib/cases/handover-close-guard.ts), "klar til lukning"
 * (case-progress) og klientens bekræftelsesrækkefølge (close-guard runCloseWithConfirmations).
 * 2026-11-01: tjekliste pr. sagstype (src/lib/cases/handover-checklist.ts) — solcellekrav kun på solcellesager.
 *   npx tsx scripts/handover-close-guard-test.ts
 * DB-/UI-beviset (underskrift gemmes, lukning afvist/tilladt, roller, audit) køres af harness'en: UI-test U255.
 */
import { handoverCloseDecision, openRequiredHandoverItems, isHandoverCloseError, HANDOVER_PREFIX } from '../src/lib/cases/handover-close-guard'
import { caseCloseReadiness } from '../src/lib/cases/case-progress'
import { runCloseWithConfirmations, UNBILLED_PREFIX } from '../src/lib/cases/close-guard'
import { DEFAULT_CHECKLIST, SERVICE_CASE_TYPES } from '../src/types/service-cases.types'
import { handoverTemplateFor, normalizeHandoverChecklist } from '../src/lib/cases/handover-checklist'

let fail = 0
const check = (name: string, ok: boolean, extra = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`) }

const started = DEFAULT_CHECKLIST.map((i) => ({ ...i }))
const complete = DEFAULT_CHECKLIST.map((i) => ({ ...i, completed: i.required ? true : i.completed }))
const onlyOptionalOpen = complete

check('ikke startet aflevering (tom/[]/null) hindrer ikke', openRequiredHandoverItems([], 'solar').length === 0 && openRequiredHandoverItems(null, 'solar').length === 0 && openRequiredHandoverItems(undefined, 'solar').length === 0)
check('startet aflevering: 3 påkrævede åbne', openRequiredHandoverItems(started, 'solar').length === 3)
check('valgfrie åbne punkter hindrer ikke', openRequiredHandoverItems(onlyOptionalOpen, 'solar').length === 0)
check('ugyldige elementer ignoreres sikkert', openRequiredHandoverItems([null, 7, { required: 'ja' }], 'solar').length === 0)

// 2. normal lukning afvises med åbne påkrævede punkter — for ALLE roller uden undtagelse
for (const role of ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi']) {
  const d = handoverCloseDecision({ checklist: started, caseType: 'solar', role })
  check(`2 normal lukning afvist (${role})`, !d.ok && /mangler: Foto af inverter, Foto af eltavle, Foto af paneler/.test(d.error))
}
check('2 admin/serviceleder får præfiks (UI spørger om begrundelse)', ['admin', 'serviceleder'].every((role) => { const d = handoverCloseDecision({ checklist: started, caseType: 'solar', role }); return !d.ok && isHandoverCloseError(d.error) }))
// 3. lukning tilladt når påkrævede punkter er udfyldt (og når afleveringen ikke er startet)
for (const role of ['admin', 'serviceleder', 'montør']) {
  const d = handoverCloseDecision({ checklist: complete, caseType: 'solar', role })
  check(`3 komplet aflevering → lukning tilladt (${role})`, d.ok && d.override === null)
}
check('3 ikke-startet aflevering → lukning tilladt', (() => { const d = handoverCloseDecision({ checklist: [], caseType: 'solar', role: 'admin' }); return d.ok && d.override === null })())
// 4. begrænsede roller kan ikke omgå (heller ikke med en cases.close-grant: basisrollen afgør)
for (const role of ['montør', 'salg', 'bogholderi', '', null]) {
  const d = handoverCloseDecision({ checklist: started, caseType: 'solar', role, override: { reason: 'Kunden er ikke hjemme, lukker alligevel' } })
  check(`4 undtagelse afvist for ${role || '(ingen rolle)'}`, !d.ok && !isHandoverCloseError(d.error) && /kun admin eller serviceleder/.test(d.error))
}
// 5. admin/serviceleder-undtagelse kræver begrundelse; resultatet bærer de åbne punkter (til audit)
for (const role of ['admin', 'serviceleder']) {
  const none = handoverCloseDecision({ checklist: started, caseType: 'solar', role, override: { reason: '' } })
  const short = handoverCloseDecision({ checklist: started, caseType: 'solar', role, override: { reason: '  ok  ' } })
  const long = handoverCloseDecision({ checklist: started, caseType: 'solar', role, override: { reason: 'x'.repeat(501) } })
  const good = handoverCloseDecision({ checklist: started, caseType: 'solar', role, override: { reason: '  Kunden sender fotos af paneler senere  ' } })
  check(`5 ${role}: tom begrundelse afvist`, !none.ok && /begrundelse/.test(none.error))
  check(`5 ${role}: for kort begrundelse afvist`, !short.ok && /mindst 5/.test(short.error))
  check(`5 ${role}: for lang begrundelse afvist`, !long.ok)
  check(`5 ${role}: gyldig begrundelse → tilladt med åbne punkter til audit`, good.ok && !!good.override && good.override.reason === 'Kunden sender fotos af paneler senere'
    && good.override.openItems.map((i) => i.key).join(',') === 'inverter_photo,tavle_photo,panel_photo')
}

// ---- tjekliste pr. sagstype (2026-11-01) ----
const SOLAR_ONLY = ['inverter_photo', 'panel_photo']
const nonSolar = SERVICE_CASE_TYPES.filter((t) => t !== 'solar')
// A. solcellesag får solcelle-tjeklisten
const solarTpl = handoverTemplateFor('solar')
check('A solcellesag: solcelle-tjekliste (inverter, eltavle, paneler påkrævet)', solarTpl.filter((i) => i.required).map((i) => i.key).join(',') === 'inverter_photo,tavle_photo,panel_photo'
  && JSON.stringify(solarTpl) === JSON.stringify(DEFAULT_CHECKLIST))
check('A skabelonen er en frisk kopi (deler ikke objekter)', handoverTemplateFor('solar')[0] !== handoverTemplateFor('solar')[0] && handoverTemplateFor('solar')[0] !== DEFAULT_CHECKLIST[0])
// B. ren el-/servicesag får ingen solcellepunkter
for (const t of [...nonSolar, null, undefined]) {
  const tpl = handoverTemplateFor(t)
  check(`B ${t ?? '(ingen type)'}: ingen solcellepunkter, ingen påkrævede`, tpl.length > 0 && !tpl.some((i) => SOLAR_ONLY.includes(i.key)) && !tpl.some((i) => i.required))
}
// C. påkrævet tjekliste blokerer lukning (solcellesag) — også hvis typen skiftes til solcelle efter en el-tjekliste er startet
check('C solcellesag med åbne påkrævede punkter: normal lukning afvist', !handoverCloseDecision({ checklist: handoverTemplateFor('solar'), caseType: 'solar', role: 'admin' }).ok)
const elStartedThenSolar = normalizeHandoverChecklist(handoverTemplateFor('installation'), 'solar')
check('C type skiftet til solcelle efter el-start: solcellepunkter tilføjet og påkrævet', ['inverter_photo', 'panel_photo'].every((k) => elStartedThenSolar.some((i) => i.key === k && i.required && !i.completed))
  && openRequiredHandoverItems(handoverTemplateFor('installation'), 'solar').map((i) => i.key).join(',') === 'tavle_photo,inverter_photo,panel_photo')
// D. ingen påkrævet tjekliste → ingen falsk blokering
for (const t of [...nonSolar, null]) {
  const d = handoverCloseDecision({ checklist: handoverTemplateFor(t), caseType: t, role: 'montør' })
  check(`D ${t ?? '(ingen type)'}: startet el-tjekliste (intet afkrydset) blokerer ikke`, d.ok && d.override === null)
}
check('D el-sag med gammel solcelle-tjekliste (startet før typeopdelingen): solcellepunkter blokerer ikke', handoverCloseDecision({ checklist: started, caseType: 'installation', role: 'salg' }).ok
  && normalizeHandoverChecklist(started, 'installation').every((i) => !i.required) && normalizeHandoverChecklist(started, 'installation').length === started.length)
check('D type skiftet fra solcelle til el: afkrydsninger bevares', (() => { const done = normalizeHandoverChecklist(complete, 'service'); return done.filter((i) => i.completed).length === 3 && !done.some((i) => i.required) })())
check('D ikke-startet forbliver tom (ingen skabelonpunkter tilføjes)', normalizeHandoverChecklist([], 'solar').length === 0 && normalizeHandoverChecklist(null, 'solar').length === 0)
// E. undtagelsen er uændret (solcellesag): admin/serviceleder med begrundelse; begrænset rolle afvist
check('E undtagelse uændret: admin med begrundelse tilladt, montør afvist', (() => {
  const ok = handoverCloseDecision({ checklist: started, caseType: 'solar', role: 'serviceleder', override: { reason: 'Kunden sender fotos senere' } })
  const no = handoverCloseDecision({ checklist: started, caseType: 'solar', role: 'montør', override: { reason: 'Kunden sender fotos senere' } })
  return ok.ok && !!ok.override && ok.override.openItems.length === 3 && !no.ok && /kun admin eller serviceleder/.test(no.error)
})())

// klar-til-lukning: afleveringen tæller med
const work = { caseStatus: 'in_progress', workOrderStatuses: ['done'], unbilled: { count: 0, openTimer: false } }
check('klar til lukning: ikke klar med åben aflevering', (() => { const r = caseCloseReadiness({ ...work, handoverOpenRequired: 3 }); return !r.ready && /Afleveringen mangler 3 påkrævede punkter/.test(r.reason) })())
check('klar til lukning: klar uden åben aflevering', caseCloseReadiness({ ...work, handoverOpenRequired: 0 }).ready && caseCloseReadiness(work).ready)

// klient: rækkefølge aflevering → ufaktureret; annullering lukker intet; undtagelse sendes kun med begrundelse
async function client() {
  const g = globalThis as unknown as { window?: unknown }
  const answers: { confirm: boolean[]; prompt: Array<string | null> } = { confirm: [], prompt: [] }
  g.window = { confirm: () => answers.confirm.shift() ?? false, prompt: () => answers.prompt.shift() ?? null }
  const calls: unknown[] = []
  const server = async (opts: { acknowledgeUnbilled?: boolean; handoverOverride?: { reason: string } }) => {
    calls.push(opts)
    if (!opts.handoverOverride) return { success: false, error: `${HANDOVER_PREFIX}Afleveringen er ikke komplet — mangler: Foto af inverter` }
    if (!opts.acknowledgeUnbilled) return { success: false, error: `${UNBILLED_PREFIX}1 post er ikke faktureret` }
    return { success: true }
  }
  answers.confirm = [false]
  calls.length = 0
  const cancelled = await runCloseWithConfirmations(server)
  check('klient: annulleret advarsel → intet lukket, ét kald', cancelled === null && calls.length === 1)
  answers.confirm = [true]; answers.prompt = ['   ']
  calls.length = 0
  const noReason = await runCloseWithConfirmations(server)
  check('klient: tom begrundelse → intet lukket', noReason === null && calls.length === 1)
  answers.confirm = [true, true]; answers.prompt = ['Kunden sender fotos senere']
  calls.length = 0
  const ok = await runCloseWithConfirmations(server)
  check('klient: begrundelse + ufaktureret-bekræftelse → lukket med begge kvitteringer', !!ok?.success && calls.length === 3
    && JSON.stringify(calls[2]) === JSON.stringify({ handoverOverride: { reason: 'Kunden sender fotos senere' }, acknowledgeUnbilled: true }))
  const restricted = async () => ({ success: false, error: 'Afleveringen er ikke komplet — mangler: X (kun admin eller serviceleder kan lukke uden komplet aflevering)' })
  answers.confirm = [true]; answers.prompt = ['skulle ikke spørges']
  const r = await runCloseWithConfirmations(restricted)
  check('klient: begrænset rolle bliver ikke spurgt om undtagelse (fejlen vises)', !!r && !r.success && answers.prompt.length === 1)
  delete g.window
}

client().then(() => {
  console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle bestået')
  process.exitCode = fail ? 1 : 0
})
