/**
 * Pilot-sim 2026-10-31 (S2): aflevering-værnet ved lukning (src/lib/cases/handover-close-guard.ts), "klar til lukning"
 * (case-progress) og klientens bekræftelsesrækkefølge (close-guard runCloseWithConfirmations).
 *   npx tsx scripts/handover-close-guard-test.ts
 * DB-/UI-beviset (underskrift gemmes, lukning afvist/tilladt, roller, audit) køres af harness'en: UI-test U255.
 */
import { handoverCloseDecision, openRequiredHandoverItems, isHandoverCloseError, HANDOVER_PREFIX } from '../src/lib/cases/handover-close-guard'
import { caseCloseReadiness } from '../src/lib/cases/case-progress'
import { runCloseWithConfirmations, UNBILLED_PREFIX } from '../src/lib/cases/close-guard'
import { DEFAULT_CHECKLIST } from '../src/types/service-cases.types'

let fail = 0
const check = (name: string, ok: boolean, extra = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`) }

const started = DEFAULT_CHECKLIST.map((i) => ({ ...i }))
const complete = DEFAULT_CHECKLIST.map((i) => ({ ...i, completed: i.required ? true : i.completed }))
const onlyOptionalOpen = complete

check('ikke startet aflevering (tom/[]/null) hindrer ikke', openRequiredHandoverItems([]).length === 0 && openRequiredHandoverItems(null).length === 0 && openRequiredHandoverItems(undefined).length === 0)
check('startet aflevering: 3 påkrævede åbne', openRequiredHandoverItems(started).length === 3)
check('valgfrie åbne punkter hindrer ikke', openRequiredHandoverItems(onlyOptionalOpen).length === 0)
check('ugyldige elementer ignoreres sikkert', openRequiredHandoverItems([null, 7, { required: 'ja' }]).length === 0)

// 2. normal lukning afvises med åbne påkrævede punkter — for ALLE roller uden undtagelse
for (const role of ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi']) {
  const d = handoverCloseDecision({ checklist: started, role })
  check(`2 normal lukning afvist (${role})`, !d.ok && /mangler: Foto af inverter, Foto af eltavle, Foto af paneler/.test(d.error))
}
check('2 admin/serviceleder får præfiks (UI spørger om begrundelse)', ['admin', 'serviceleder'].every((role) => { const d = handoverCloseDecision({ checklist: started, role }); return !d.ok && isHandoverCloseError(d.error) }))
// 3. lukning tilladt når påkrævede punkter er udfyldt (og når afleveringen ikke er startet)
for (const role of ['admin', 'serviceleder', 'montør']) {
  const d = handoverCloseDecision({ checklist: complete, role })
  check(`3 komplet aflevering → lukning tilladt (${role})`, d.ok && d.override === null)
}
check('3 ikke-startet aflevering → lukning tilladt', (() => { const d = handoverCloseDecision({ checklist: [], role: 'admin' }); return d.ok && d.override === null })())
// 4. begrænsede roller kan ikke omgå (heller ikke med en cases.close-grant: basisrollen afgør)
for (const role of ['montør', 'salg', 'bogholderi', '', null]) {
  const d = handoverCloseDecision({ checklist: started, role, override: { reason: 'Kunden er ikke hjemme, lukker alligevel' } })
  check(`4 undtagelse afvist for ${role || '(ingen rolle)'}`, !d.ok && !isHandoverCloseError(d.error) && /kun admin eller serviceleder/.test(d.error))
}
// 5. admin/serviceleder-undtagelse kræver begrundelse; resultatet bærer de åbne punkter (til audit)
for (const role of ['admin', 'serviceleder']) {
  const none = handoverCloseDecision({ checklist: started, role, override: { reason: '' } })
  const short = handoverCloseDecision({ checklist: started, role, override: { reason: '  ok  ' } })
  const long = handoverCloseDecision({ checklist: started, role, override: { reason: 'x'.repeat(501) } })
  const good = handoverCloseDecision({ checklist: started, role, override: { reason: '  Kunden sender fotos af paneler senere  ' } })
  check(`5 ${role}: tom begrundelse afvist`, !none.ok && /begrundelse/.test(none.error))
  check(`5 ${role}: for kort begrundelse afvist`, !short.ok && /mindst 5/.test(short.error))
  check(`5 ${role}: for lang begrundelse afvist`, !long.ok)
  check(`5 ${role}: gyldig begrundelse → tilladt med åbne punkter til audit`, good.ok && !!good.override && good.override.reason === 'Kunden sender fotos af paneler senere'
    && good.override.openItems.map((i) => i.key).join(',') === 'inverter_photo,tavle_photo,panel_photo')
}

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
