/**
 * 00244 (2026-11-01): eksplicit sagstype på tilbud (src/lib/offers/case-type.ts) + valideringen (createOfferSchema).
 *   npx tsx scripts/offer-case-type-test.ts
 * DB-/UI-beviset (formular, portal-accept, kopi, revision, pakke, historisk NULL) køres af harness'en: UI-test U256.
 */
import { serviceCaseTypeForOffer, offerCaseTypeFromPackageJobType, offerCaseTypePreviewLabel, isOfferCaseType, OFFER_CASE_TYPE_LABELS } from '../src/lib/offers/case-type'
import { createOfferSchema, updateOfferSchema } from '../src/lib/validations/offers'
import { handoverTemplateFor } from '../src/lib/cases/handover-checklist'

let fail = 0
const check = (name: string, ok: boolean) => { if (!ok) fail++; console.log(`${ok ? '✓' : '❌'} ${name}`) }

check('solcelletilbud → solcellesag', serviceCaseTypeForOffer('solar') === 'solar')
check('elinstallationstilbud → installationssag', serviceCaseTypeForOffer('installation') === 'installation')
check('historisk NULL/undefined → installation (som før 00244)', serviceCaseTypeForOffer(null) === 'installation' && serviceCaseTypeForOffer(undefined) === 'installation')
check('ugyldig værdi → installation (ingen gæt)', serviceCaseTypeForOffer('Solcelleanlæg 10 kWp') === 'installation' && serviceCaseTypeForOffer('service') === 'installation')
check('kæden: solcelletilbud → solcelle-tjekliste med påkrævede punkter', handoverTemplateFor(serviceCaseTypeForOffer('solar')).some((i) => i.required))
check('kæden: eltilbud → el-tjekliste uden solcellepunkter', !handoverTemplateFor(serviceCaseTypeForOffer('installation')).some((i) => i.key === 'inverter_photo' || i.key === 'panel_photo'))

check('pakke solar → solar', offerCaseTypeFromPackageJobType('solar') === 'solar')
check('pakke installation/service → installation', offerCaseTypeFromPackageJobType('installation') === 'installation' && offerCaseTypeFromPackageJobType('service') === 'installation')
check('pakke ukendt/tom → null (intet sættes)', offerCaseTypeFromPackageJobType('project') === null && offerCaseTypeFromPackageJobType(null) === null && offerCaseTypeFromPackageJobType('') === null)

check('etiketter: Solceller / batteri · Elinstallation / service', OFFER_CASE_TYPE_LABELS.solar === 'Solceller / batteri' && OFFER_CASE_TYPE_LABELS.installation === 'Elinstallation / service')
check('forhåndsvisning NULL siger "ikke valgt"', /ikke valgt på tilbuddet/.test(offerCaseTypePreviewLabel(null)) && offerCaseTypePreviewLabel('solar') === 'Solceller / batteri')
check('isOfferCaseType kun de to værdier', isOfferCaseType('solar') && isOfferCaseType('installation') && !isOfferCaseType('service') && !isOfferCaseType(null))

const base = { title: 'Test', discount_percentage: 0, tax_percentage: 25 }
check('validering: solar/installation accepteres', createOfferSchema.safeParse({ ...base, case_type: 'solar' }).success && createOfferSchema.safeParse({ ...base, case_type: 'installation' }).success)
check('validering: tom streng → null (andre oprettelsesstier uændret)', (() => { const p = createOfferSchema.safeParse({ ...base, case_type: '' }); return p.success && p.data.case_type === null })())
check('validering: uden felt → ok (mail/lead/kalkule-stier sætter ingen type)', createOfferSchema.safeParse(base).success)
check('validering: ukendt værdi afvises', !createOfferSchema.safeParse({ ...base, case_type: 'service' }).success && !updateOfferSchema.safeParse({ id: '00000000-0000-4000-8000-000000000000', ...base, case_type: 'bess' }).success)

console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle bestået')
process.exitCode = fail ? 1 : 0
